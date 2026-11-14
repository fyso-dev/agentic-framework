"""Run only isolation canaries; does not generate a project or start Dagu."""
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import uuid

HERE = Path(__file__).resolve().parent
PYTHON = Path(sys.executable).resolve()
COPIER = Path(os.environ['FYSO_TEST_COPIER']).absolute()
DAGU = Path(os.environ['FYSO_TEST_DAGU']).resolve()
NODE = Path(os.environ['FYSO_TEST_NODE']).resolve()
COPIER_PYTHON = Path(os.environ['FYSO_TEST_COPIER_PYTHON']).resolve()
CHILD = r'''
import ctypes,json,os,pathlib,socket,subprocess,sys
fixture=pathlib.Path(sys.argv[1]); sibling=fixture.parent/'outside'; ports=list(map(int,sys.argv[2:7])); sentinel=int(sys.argv[7]); allowed_socket=sys.argv[8]
checks={};(fixture/'allowed').write_text('ok')
try:(sibling/'blocked').write_text('no');checks['outside_write']=False
except PermissionError:checks['outside_write']=True
link=fixture/'escape';link.symlink_to(sibling/'blocked')
try:link.write_text('no');checks['symlink_escape']=False
except PermissionError:checks['symlink_escape']=True
try:os.fstat(sentinel);checks['fd_closed']=False
except OSError:checks['fd_closed']=True
sockets=[]
for port in ports:
 s=socket.socket();s.bind(('127.0.0.1',port));s.listen();sockets.append(s)
c=socket.socket();c.connect(('127.0.0.1',ports[0]));a,_=sockets[0].accept();a.close();c.close();checks['allowed_tcp']=True
v6=socket.socket(socket.AF_INET6);v6.setsockopt(socket.IPPROTO_IPV6,socket.IPV6_V6ONLY,1);v6.bind(('::1',ports[0]));v6.listen();c=socket.socket(socket.AF_INET6);c.connect(('::1',ports[0]));a,_=v6.accept();a.close();c.close();checks['allowed_ipv6']=True
for name,family,address in [('omb',socket.AF_INET,('127.0.0.1',33604)),('ipv6_other',socket.AF_INET6,('::1',33604)),('external',socket.AF_INET,('1.1.1.1',80))]:
 sock=socket.socket(family);sock.settimeout(1)
 try:sock.connect(address);checks[name+'_denied']=False
 except PermissionError:checks[name+'_denied']=True
 except OSError:checks[name+'_denied']=False
 finally:sock.close()
unix=socket.socket(socket.AF_UNIX);unix.bind(allowed_socket);unix.listen();c=socket.socket(socket.AF_UNIX);c.connect(allowed_socket);a,_=unix.accept();a.close();c.close();checks['allowed_unix']=True
other=socket.socket(socket.AF_UNIX)
try:other.bind(allowed_socket);checks['collision_rejected']=False
except OSError as e:checks['collision_rejected']=e.errno==__import__('errno').EADDRINUSE
other.close();unix.close();os.unlink(allowed_socket)
sock=socket.socket(socket.AF_UNIX)
try:sock.connect(str(fixture/'server.sock'));checks['unix_denied']=False
except PermissionError:checks['unix_denied']=True
except OSError:checks['unix_denied']=False
finally:sock.close()
try:subprocess.run(['/usr/bin/true'],check=True);checks['exec_denied']=False
except PermissionError:checks['exec_denied']=True
m=ctypes.CDLL('/usr/lib/libSystem.B.dylib');boot=ctypes.c_uint.in_dll(m,'bootstrap_port');p=ctypes.c_uint();checks['mach_denied']=m.bootstrap_look_up(boot,b'com.apple.cfprefsd.daemon',ctypes.byref(p))!=0
worker=subprocess.Popen(['/bin/sh','-c','read unused'],stdin=subprocess.PIPE,close_fds=True)
print(json.dumps({'checks':checks,'worker':worker.pid}),flush=True)
sys.stdin.readline();worker.stdin.close();worker.wait(timeout=5)
'''

def main():
    with tempfile.TemporaryDirectory(prefix='fyso-hr-canary-') as temp:
        root=Path(temp).resolve();fixture=root/'fixture';fixture.mkdir();(root/'outside').mkdir()
        socket_path=Path('/tmp').resolve()/('fyso-hr-canary-'+uuid.uuid4().hex+'.sock')
        try:socket_path.lstat()
        except FileNotFoundError:pass
        else:raise FileExistsError('Canary socket path occupied')
        held=[]
        for _ in range(5):
            sock=socket.socket();sock.bind(('127.0.0.1',0));held.append(sock)
        ports=[sock.getsockname()[1] for sock in held]
        if 33604 in ports:raise RuntimeError('Selected forbidden OMB port')
        unix=socket.socket(socket.AF_UNIX);unix.bind(str(fixture/'server.sock'));unix.listen()
        fd=os.open(root/'sentinel',os.O_CREAT|os.O_RDWR,0o600);os.dup2(fd,100,inheritable=True)
        if fd != 100:os.close(fd)
        env={k:v for k,v in os.environ.items() if k in ('HOME','USER','LOGNAME')}
        env.update({'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','TMPDIR':str(fixture),'PYTHONDONTWRITEBYTECODE':'1'})
        args=['/usr/bin/sandbox-exec','-f',str(HERE/'human-requests-sandbox.sb'),'-D',f'FIXTURE={fixture}',
              '-D',f'PYTHON={PYTHON}','-D',f'COPIER={COPIER}','-D',f'COPIER_PYTHON={COPIER_PYTHON}','-D',f'SOCKET={socket_path}','-D',f'DAGU={DAGU}','-D',f'NODE={NODE}']
        for i,port in enumerate(ports):args+=['-D',f'PORT{i}=localhost:{port}']
        args += [str(PYTHON),'-c',CHILD,str(fixture),*(str(p) for p in ports),'100',str(socket_path)]
        # Ports were bound before launch; close reservations only immediately before spawn.
        for s in held:s.close()
        proc=subprocess.Popen(args,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,close_fds=True,start_new_session=True)
        try:
            line=proc.stdout.readline()
            if not line:raise RuntimeError('Sandbox canary did not start: '+proc.stderr.read()[-500:])
            report=json.loads(line)
            assert all(report['checks'].values()),report['checks']
            assert os.getpgid(report['worker'])==proc.pid
            for port in ports:
                result=subprocess.run(['/usr/sbin/lsof','-nP','-t',f'-iTCP:{port}','-sTCP:LISTEN'],capture_output=True,text=True,check=True,close_fds=True)
                owners={int(line) for line in result.stdout.splitlines() if line.isdigit()}
                assert owners and all(os.getpgid(pid)==proc.pid for pid in owners),f'Unexpected listener for {port}'
            print(json.dumps({'checks':report['checks'],'all_listener_owners_in_fixture_group':True,'child_in_fixture_group':True}))
        finally:
            try:proc.stdin.write('\n');proc.stdin.flush();proc.wait(timeout=5)
            except (BrokenPipeError,subprocess.TimeoutExpired):os.killpg(proc.pid,signal.SIGKILL);proc.wait()
            proc.stdin.close();proc.stdout.close();proc.stderr.close();unix.close();os.close(100)
        if proc.returncode:raise RuntimeError(f'Canary exited {proc.returncode}')

if __name__=='__main__':main()
