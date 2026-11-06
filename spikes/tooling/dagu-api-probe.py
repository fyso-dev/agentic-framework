"""Throwaway API probe; requires sourced env.sh and dagu-env.sh and seeded clone."""
import json, os, pathlib, socket, subprocess, time, urllib.request
root = pathlib.Path(os.environ['TOOLING_WT'])
assert pathlib.Path(os.environ['DAGU_HOME']) == root / '.data/dagu'
for name in ('DAGU_PORT', 'DAGU_SCHEDULER_PORT', 'DAGU_COORDINATOR_PORT',
             'DAGU_COORDINATOR_HEALTH_PORT', 'DAGU_WORKER_HEALTH_PORT'):
    assert 8420 <= int(os.environ[name]) <= 8429
with socket.socket() as check:
    check.bind(('127.0.0.1', int(os.environ['DAGU_PORT'])))
binary = subprocess.check_output(['mise', 'which', 'dagu'], text=True).strip()
base = 'http://127.0.0.1:8420/api/v1'
def request(path, method='GET', body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, method=method,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=4) as res:
        result = json.load(res)
        print(method, path, res.status, json.dumps(result)[:1500], flush=True)
        return result
with (root / '.data/dagu-server.log').open('w') as log:
    proc = subprocess.Popen([binary, 'server'], stdout=log, stderr=log)
    try:
        for _ in range(60):
            if proc.poll() is not None:
                raise RuntimeError('Dagu exited; inspect .data/dagu-server.log')
            try:
                with socket.create_connection(('127.0.0.1', 8420), timeout=.2):
                    break
            except OSError:
                time.sleep(.25)
        else:
            raise RuntimeError('Dagu did not listen')
        old = request('/dags/hello/spec')
        spec = 'steps:\n  - name: hello\n    command: echo tooling-ui-api-edit\n'
        request('/dags/hello/spec', 'PUT', {'spec': spec, 'expectedSha256': old['sha256']})
        request('/sync/status')
        request('/sync/items/hello/publish', 'POST', {'message': 'Publish tooling UI API edit'})
        actual = subprocess.check_output(['git', '--git-dir=' + str(root / '.data/tooling-remote.git'),
                                          'show', 'main:hello.yaml'], text=True)
        assert actual == spec, actual
        print('Bare remote content equals UI API edit: PASS', flush=True)
        print(subprocess.check_output(['git', '--git-dir=' + str(root / '.data/tooling-remote.git'),
                                       'log', '-1', '--format=%h %an <%ae> %s'], text=True), end='')
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
        print('Probe-owned Dagu stopped:', proc.returncode, flush=True)
