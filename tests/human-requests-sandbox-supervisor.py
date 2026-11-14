"""Prepare the supervised generated-Dagu sandbox; do not run without review.

This supervisor intentionally runs outside the child sandbox only to check local
listener ownership. Its child gets two explicit control pipes and no other FDs.
The profile currently permits reading user files: this is a known limitation.
"""
import json
import hashlib
import uuid
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time

HERE=Path(__file__).resolve().parent

def fixture_socket(run_id):
    name='ext-human-requests-request'
    digest=hashlib.md5((name+run_id).encode(),usedforsecurity=False).hexdigest()[:6]
    return Path('/tmp').resolve()/f'@dagu_{name}_{digest}.sock'


def require_unused_socket(path):
    # lstat sees regular files, live/stale sockets, and dangling symlinks.
    try: path.lstat()
    except FileNotFoundError: return
    raise FileExistsError('The proposed fixture socket path is occupied')


def verify_runner(runner, group, child_pid, getpgid, ppid_of):
    if group != child_pid or getpgid(runner) != child_pid:
        raise ValueError('Unexpected runner group')
    if ppid_of(runner) != child_pid:
        raise ValueError('Runner is not a direct fixture child')


def verify_owners(runner, group, main_port, ports, child_pid, getpgid, ppid_of, listeners):
    """Return readiness only if all visible fixture listeners are owned."""
    verify_runner(runner,group,child_pid,getpgid,ppid_of)
    if main_port != ports[0]: raise ValueError('Unexpected port')
    ready = False
    for port in ports:
        owners = listeners(port)
        if any(getpgid(pid) != group for pid in owners):
            raise ValueError('Unexpected listener')
        if port == main_port: ready = bool(owners)
    return ready


def cleanup_group(group, own_group, list_members, kill_group, pause=time.sleep):
    """Stop only the dedicated sandbox session and ensure it is empty."""
    if group == own_group: raise ValueError('Refusing to signal supervisor group')
    def members():
        found=list_members(group)
        if any(session != group for _,session in found): raise ValueError('Unexpected session')
        return found
    if not members(): return
    try: kill_group(group,signal.SIGTERM)
    except ProcessLookupError: return
    for _ in range(30):
        if not members(): return
        pause(.1)
    try: kill_group(group,signal.SIGKILL)
    except ProcessLookupError: return
    for _ in range(30):
        if not members(): return
        pause(.1)
    raise RuntimeError('Fixture process group did not stop')


def main():
    fixture=Path(os.environ['FYSO_SANDBOX_FIXTURE']).resolve(strict=True)
    if not fixture.is_dir() or any(fixture.iterdir()):
        raise ValueError('Provide an existing empty fixture directory')
    copier=Path(os.environ['FYSO_TEST_COPIER']).absolute()
    copier_python=Path(os.environ['FYSO_TEST_COPIER_PYTHON']).resolve(strict=True)
    dagu=Path(os.environ['FYSO_TEST_DAGU']).resolve()
    node=Path(os.environ['FYSO_TEST_NODE']).resolve()
    python=Path(sys.executable).resolve()
    source=Path(os.environ['FYSO_TEST_TEMPLATE_ROOT']).resolve(strict=True)
    held=[]
    for _ in range(5):
        sock=socket.socket();sock.bind(('127.0.0.1',0));held.append(sock)
    ports=[sock.getsockname()[1] for sock in held]
    run_id='hr-'+uuid.uuid4().hex
    socket_path=fixture_socket(run_id)
    require_unused_socket(socket_path)
    if 33604 in ports: raise RuntimeError('A fixture port conflicts with the unrelated OMB port')
    request_r,request_w=os.pipe();response_r,response_w=os.pipe()
    os.set_inheritable(request_w,True);os.set_inheritable(response_r,True)
    env={k:v for k,v in os.environ.items() if k in ('HOME','USER','LOGNAME')}
    env.update({'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','TMPDIR':str(fixture),'PYTHONDONTWRITEBYTECODE':'1',
                'FYSO_SANDBOX_FIXTURE':str(fixture),'FYSO_TEST_TEMPLATE_ROOT':str(source),'FYSO_TEST_COPIER':str(copier),
                'FYSO_TEST_DAGU':str(dagu),'FYSO_TEST_NODE':str(node),'FYSO_TEST_PORTS':','.join(map(str,ports)),
                'FYSO_TEST_RUN_ID':run_id,'FYSO_TEST_SOCKET':str(socket_path),
                'FYSO_TEST_CONTROL_OUT':str(request_w),'FYSO_TEST_CONTROL_IN':str(response_r)})
    cmd=['/usr/bin/sandbox-exec','-f',str(HERE/'human-requests-sandbox.sb'),'-D',f'FIXTURE={fixture}',
         '-D',f'PYTHON={python}','-D',f'COPIER={copier}','-D',f'COPIER_PYTHON={copier_python}','-D',f'SOCKET={socket_path}','-D',f'DAGU={dagu}','-D',f'NODE={node}']
    for i,port in enumerate(ports):cmd+=['-D',f'PORT{i}=localhost:{port}']
    cmd += [str(python),str(HERE/'test_human_requests_generated_dagu.py')]
    for sock in held:sock.close()
    child=subprocess.Popen(cmd,env=env,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                           text=True,close_fds=True,pass_fds=(request_w,response_r),start_new_session=True)
    os.close(request_w);os.close(response_r)
    owned={"runner":None}
    def supervise():
        with os.fdopen(request_r,'r') as incoming,os.fdopen(response_w,'w') as outgoing:
            for line in incoming:
                try:
                    request=json.loads(line);group=request['group']; runner=request['runner']; main_port=request['port']
                    def ppid_of(pid):
                        return int(subprocess.check_output(['/bin/ps','-o','ppid=','-p',str(pid)],text=True).strip())
                    def listeners(port):
                        result=subprocess.run(['/usr/sbin/lsof','-nP','-t',f'-iTCP:{port}','-sTCP:LISTEN'],capture_output=True,text=True,close_fds=True)
                        if result.returncode not in (0,1): raise ValueError('lsof failed')
                        return [int(x) for x in result.stdout.splitlines() if x.isdigit()]
                    if request.get('op')=='register':
                        verify_runner(runner,group,child.pid,os.getpgid,ppid_of)
                        if owned['runner'] is not None: raise ValueError('Runner already registered')
                        owned['runner']=runner
                        answer={'ready':True}
                    elif request.get('op')=='check' and owned['runner']==runner:
                        answer={'ready':verify_owners(runner,group,main_port,ports,child.pid,os.getpgid,ppid_of,listeners)}
                    else: raise ValueError('Runner not registered')
                except (OSError,ValueError,KeyError,subprocess.SubprocessError):answer={'error':True}
                outgoing.write(json.dumps(answer)+'\n');outgoing.flush()
    worker=threading.Thread(target=supervise,daemon=True);worker.start()
    def list_members(group):
        # Reap the test process promptly so a zombie is not mistaken for a live descendant.
        child.poll()
        result=subprocess.check_output(['/bin/ps','-axo','pid=,pgid='],text=True)
        members=[]
        for line in result.splitlines():
            parts=line.split()
            if len(parts)==2 and all(value.isdigit() for value in parts):
                pid,pgid=map(int,parts)
                if pgid==group:
                    try: members.append((pid,os.getsid(pid)))
                    except ProcessLookupError: continue
        return members
    timed_out=False
    try:
        out,err=child.communicate(timeout=180)
    except subprocess.TimeoutExpired:
        timed_out=True;out=err=''
    finally:
        # The runner shares the dedicated session even if it died before register.
        cleanup_group(child.pid,os.getpgrp(),list_members,os.killpg)
        try: child.wait(timeout=5)
        except subprocess.TimeoutExpired: raise RuntimeError('Fixture test process did not stop')
        worker.join(timeout=3)
    if timed_out: raise TimeoutError('Supervised test timed out')
    print(out,end='');print(err,end='',file=sys.stderr)
    if child.returncode:raise SystemExit(child.returncode)

if __name__=='__main__':main()
