"""Exercise generated run-dagu.sh using an isolated Copier project, not mise."""
import base64
import json
import os
import re
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request

ROOT = Path(os.environ.get('FYSO_TEST_TEMPLATE_ROOT', Path(__file__).resolve().parents[1]))


def classify_runner_text(text):
    """Classify fixture failures without returning log contents or paths."""
    denied=('operation not permitted','permission denied','command not found','no such file or directory')
    safe_commands=('mkdir','env','dirname','bash','dagu','node','realpath')
    observed=set()
    for line in text.splitlines():
        if not any(reason in line.lower() for reason in denied): continue
        for command in safe_commands:
            if re.search(r'(?<![A-Za-z0-9_-])'+re.escape(command)+r':',line): observed.add(command)
    if observed: return 'isolated runner failed invoking: '+', '.join(sorted(observed))
    if any(reason in text.lower() for reason in denied): return 'isolated runner reported an unclassified permission or executable failure'
    return 'isolated runner exited; no classified error'


def sanitized_runner_diagnostic(log_path):
    try:
        return classify_runner_text(log_path.read_text(errors='replace')[-16384:])
    except OSError:
        return 'isolated runner log unavailable'


def sanitize_fixture_error(text):
    """Sanitize fictional run errors; this fixture has no real credentials."""
    text=str(text).replace('fixture-password','[REDACTED]')
    basic=base64.b64encode(b'fixture:fixture-password').decode()
    text=text.replace(basic,'[REDACTED]')
    text=re.sub(r'(?i)(bearer|basic)\s+[A-Za-z0-9._~+/=-]+',r'\1 [REDACTED]',text)
    text=re.sub(r'(?i)(password|token|secret|authorization)\s*[:=]\s*[^\s,;]+',r'\1=[REDACTED]',text)
    text=re.sub(r'https?://[^\s\"\']+', '[URL]', text)
    text=re.sub(r'(?<![A-Za-z0-9])/(?:[^\s\"\']+)', '[PATH]', text)
    return ' '.join(text.split())[:500]


def watcher_path_diagnostic(text, root):
    """Identify watcher paths only for safe fixed devices or this test fixture."""
    results=[]
    for match in re.finditer(r'failed to start parent exit watcher:\s*open\s+(\S+)',str(text)):
        raw=match.group(1).rstrip(':,')
        if re.fullmatch(r'/dev/(?:null|fd/[0-9]+)',raw): results.append(raw)
        else:
            try:
                rel=Path(raw).resolve(strict=False).relative_to(root.resolve())
                results.append('<fixture>/'+str(rel))
            except (ValueError,OSError): results.append('<outside-fixture-unidentified>')
    return ', '.join(sorted(set(results))) or 'none reported'


def sanitized_run_failure(details, root):
    """Return only synthetic run errors and fixture-owned error log lines."""
    messages=[];states=[];paths=[]
    for field in ('error','message','statusText'):
        if isinstance(details.get(field),str): messages.append(details[field])
    if isinstance(details.get('log'),str):paths.append(details['log'])
    for node in details.get('nodes',[]):
        step=node.get('step') or {};name=step.get('id')
        if name not in ('ask','record','deliver'): continue
        state=str(node.get('statusLabel','unknown')).lower()
        if state not in ('waiting','running','not_started','succeeded','failed','aborted','rejected','queued'): state='unknown'
        states.append(f'{name}={state}')
        for field in ('error','message'):
            if isinstance(node.get(field),str): messages.append(node[field])
        if isinstance(node.get('stderr'),str):paths.append(node['stderr'])
    for path in paths:
        try:
            target=Path(path).resolve(strict=True)
            if root.resolve() not in target.parents or not target.is_file(): continue
            content=target.read_text(errors='replace')[-32768:]
            messages.extend(line for line in content.splitlines() if re.search(r'(?i)error|fail|fatal|denied|not permitted',line))
        except (OSError,ValueError): pass
    combined='\n'.join(messages)
    socket_names=sorted(set(re.findall(r'(?<![A-Za-z0-9_])@dagu_[A-Za-z0-9_.-]{1,80}\.sock',combined)))
    safe=[sanitize_fixture_error(line) for line in messages if line.strip()]
    return 'steps: '+', '.join(states)+'; '+classify_runner_text(combined)+'; fixture socket basenames: '+(', '.join(socket_names) or 'none reported')+'; watcher paths: '+watcher_path_diagnostic(combined,root)+'; errors: '+(' | '.join(safe[-8:]) or 'none reported')

@unittest.skipUnless(os.environ.get('FYSO_TEST_COPIER') and os.environ.get('FYSO_TEST_DAGU'), 'Set FYSO_TEST_COPIER and FYSO_TEST_DAGU')
class GeneratedDaguTest(unittest.TestCase):
    def test_generated_project_installed_extension_with_native_dagu_runner(self):
        copier, dagu = os.environ['FYSO_TEST_COPIER'], Path(os.environ['FYSO_TEST_DAGU']).resolve()
        with tempfile.TemporaryDirectory(prefix='fyso-hr-generated-', dir=os.environ.get('FYSO_SANDBOX_FIXTURE')) as temp:
            root=Path(temp); source=root/'source'; project=root/'project'; source.mkdir()
            tool_env={key:value for key,value in os.environ.items() if key in ('HOME','USER','LOGNAME','PATH')}
            tool_env.update({'XDG_CONFIG_HOME':str(root/'xdg-config'),'XDG_STATE_HOME':str(root/'xdg-state'),'XDG_CACHE_HOME':str(root/'xdg-cache'),'XDG_DATA_HOME':str(root/'xdg-data'),'TMPDIR':str(root),'NO_PROXY':'*','no_proxy':'*'})
            self.assertIn('9.19.1', subprocess.check_output([copier, '--version'], text=True,env=tool_env))
            shutil.copy(ROOT/'copier.yml',source)
            shutil.copytree(ROOT/'template',source/'template',symlinks=True,ignore=shutil.ignore_patterns('node_modules','__pycache__'))
            subprocess.run([copier,'copy','--defaults','-d','project_name=Human Request Test','-d','project_slug=human-request-test','-d','port_base=33600',str(source),str(project)],check=True,capture_output=True,text=True,env=tool_env)
            subprocess.run([copier,'copy','--defaults','-d','extension_port=33610','./framework/extensions/human-requests','.'],cwd=project,check=True,capture_output=True,text=True,env=tool_env)
            workflows=project/'project/workflows'; request=workflows/'ext-human-requests-request.yaml'
            self.assertTrue(request.is_file())
            # This fixture deliberately runs only the human-request workflow.
            for item in workflows.glob('*.yaml'):
                if item != request: item.unlink()
            held=[]
            requested=os.environ.get('FYSO_TEST_PORTS')
            ports=[int(p) for p in requested.split(',')] if requested else []
            if requested and (len(ports)!=5 or len(set(ports))!=5): raise ValueError('Expected five distinct fixture ports')
            for i in range(5):
                sock=socket.socket();sock.bind(('127.0.0.1',ports[i] if requested else 0));held.append(sock)
            if not requested: ports=[sock.getsockname()[1] for sock in held]
            node_dir=Path(os.environ.get('FYSO_TEST_NODE',shutil.which('node'))).resolve().parent
            bin_dir=root/'bin';bin_dir.mkdir();(bin_dir/'dagu').symlink_to(dagu)
            env={key:value for key,value in os.environ.items() if key in ('HOME','USER','LOGNAME')}
            env.update({'PATH':f'{bin_dir}:{node_dir}:/usr/bin:/bin','LANG':'C.UTF-8','TMPDIR':str(root),
                 'XDG_STATE_HOME':str(root/'xdg-state'),'XDG_CONFIG_HOME':str(root/'xdg-config'),
                 'FYSO_ROOT':str(project),'FYSO_DATA':str(root/'data'),'FYSO_PROJECT':'human-request-test',
                 'FYSO_HTTP_PORT':'33600','FYSO_ADMIN_USER':'fixture','FYSO_ADMIN_PASSWORD':'fixture-password',
                 'FYSO_DAGU_PORT':str(ports[0]),'FYSO_DAGU_SCHEDULER_PORT':str(ports[1]),
                 'FYSO_DAGU_WORKER_HEALTH_PORT':str(ports[2]),'FYSO_DAGU_COORDINATOR_PORT':str(ports[3]),
                 'FYSO_DAGU_COORDINATOR_HEALTH_PORT':str(ports[4]),'FYSO_OMB_PORT':'33604',
                 'OPENMAUSBOT_URL':'http://127.0.0.1:33604'})
            for sock in held: sock.close()
            log_path=root/'dagu.log';log=log_path.open('wb')
            process=subprocess.Popen(['bash',str(project/'framework/scripts/run-dagu.sh')],cwd=project,env=env,stdout=log,stderr=subprocess.STDOUT)
            self.addCleanup(lambda: process.poll() is None and process.terminate())
            base=f'http://127.0.0.1:{ports[0]}/api/v1'; auth='Basic '+base64.b64encode(b'fixture:fixture-password').decode()
            opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
            def control(op):
                payload=json.dumps({'op':op,'runner':process.pid,'group':os.getpgrp(),'port':ports[0]})+'\n'
                os.write(int(os.environ['FYSO_TEST_CONTROL_OUT']),payload.encode())
                reply=b''
                while not reply.endswith(b'\n'):
                    chunk=os.read(int(os.environ['FYSO_TEST_CONTROL_IN']),1)
                    if not chunk: raise RuntimeError('Supervisor channel closed')
                    reply+=chunk
                result=json.loads(reply)
                if result.get('error'): raise AssertionError('Supervisor rejected runner')
                return result
            def verify_listener():
                if process.poll() is not None: raise AssertionError('Generated Dagu exited: '+sanitized_runner_diagnostic(log_path))
                if os.environ.get('FYSO_TEST_CONTROL_IN'):
                    return control('check').get('ready') is True
                probe=subprocess.run(['lsof','-nP','-t',f'-iTCP:{ports[0]}','-sTCP:LISTEN'],capture_output=True,text=True,check=False)
                pids=[int(line) for line in probe.stdout.splitlines() if line.isdigit()]
                if not pids: return False
                if any(os.getpgid(pid)!=os.getpgrp() for pid in pids): raise AssertionError('Unexpected listener on fixture port')
                return True
            def api(path,body=None,authenticated=True):
                if not verify_listener(): raise ConnectionError('Fixture listener not ready')
                request=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**({'Authorization':auth} if authenticated else {})})
                with opener.open(request,timeout=3) as response:return json.load(response)
            def wait(predicate):
                for _ in range(200):
                    if process.poll() is not None: raise AssertionError('Generated Dagu exited: '+sanitized_runner_diagnostic(log_path))
                    try:
                        value=predicate()
                        if value:return value
                    except (OSError,ValueError,KeyError):pass
                    time.sleep(.1)
                self.fail('Timed out waiting for isolated Dagu')
            try:
                if os.environ.get('FYSO_TEST_CONTROL_IN'): control('register')
                wait(lambda:api('/health'))
                with self.assertRaises(urllib.error.HTTPError) as unauth: api('/dag-runs',authenticated=False)
                self.assertEqual(unauth.exception.code,401)
                name='ext-human-requests-request';run=os.environ.get('FYSO_TEST_RUN_ID','generated-run');detail=f'/dag-runs/{name}/{run}'
                params={'REQUEST':json.dumps({'title':'Fictional generated project test','requester':'Fixture bot','doing':'Testing','needs':'An answer','if_silent':'Nothing happens'}),'RECIPIENT':'team','ORIGIN_TYPE':'none','ORIGIN_REF':'','BLOCKING':'false'}
                expected_socket=os.environ.get('FYSO_TEST_SOCKET')
                if expected_socket:
                    try: Path(expected_socket).lstat()
                    except FileNotFoundError: pass
                    else: raise AssertionError('Fixture socket path is occupied')
                api(f'/dags/{name}/start',{'dagRunId':run,'params':json.dumps(params)})
                def waiting_or_fail():
                    current=api(detail)['dagRunDetails']
                    if current['statusLabel'].lower() in ('failed','aborted','rejected'):
                        raise AssertionError('Request failed before waiting: '+sanitized_run_failure(current,root))
                    return current['statusLabel'].lower()=='waiting'
                wait(waiting_or_fail)
                api(detail+'/human-tasks/ask/complete',{'answer':'approved','comment':'fictional','responder':'test person','decision':'answered'})
                finished=wait(lambda:(d if (d:=api(detail)['dagRunDetails'])['statusLabel'] in ('succeeded','failed') else None))
                self.assertEqual(finished['statusLabel'],'succeeded',
                                 'Request failed after response: '+sanitized_run_failure(finished,root))
                self.assertEqual([(n['step']['id'],n['statusLabel']) for n in finished['nodes']],[('prepare','succeeded'),('ask','succeeded'),('record','succeeded'),('deliver','succeeded')])
                outputs=api(detail+'/outputs')['outputs']
                card=json.loads(outputs.pop('hrCard'))
                self.assertEqual(card['request']['title'],'Fictional generated project test')
                self.assertEqual(card['thread'],[])
                self.assertFalse(card['canAsk'])
                self.assertEqual(outputs,{'answer':'approved','comment':'fictional','responder':'test person','decision':'answered'})
                print('PASS Copier 9.19.1, bundled extension, generated run-dagu.sh, authenticated Dagu and origin=none outputs')
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:process.wait(timeout=10)
                    except subprocess.TimeoutExpired:process.kill();process.wait()
                log.close()

if __name__=='__main__': unittest.main()
