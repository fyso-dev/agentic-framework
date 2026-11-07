"""Run the actual PowerShell adapter with a disposable wsl.exe shim (not Windows proof)."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
PS=shutil.which('pwsh')


@unittest.skipUnless(PS,'PowerShell Core is required for adapter execution tests')
class WindowsAdapter(unittest.TestCase):
    def fixture(self, root):
        payload=root/'payload';payload.mkdir()
        shutil.copy(ROOT/'installer/qt/runtime/windows.ps1',payload)
        shutil.copytree(ROOT/'installer/qt/locales',payload/'locales')
        binary=root/'bin';binary.mkdir()
        shim=binary/'wsl.exe'
        shim.write_text('''#!/usr/bin/env python3
import os,sys,json,pathlib
args=sys.argv[1:]
if 'uname' in args:
 print('6.6-microsoft-standard-WSL2' if not os.environ.get('WSL1') else '4.4-microsoft');sys.exit(0)
if 'wslpath' in args:print(os.environ['LINUX_ASSETS']);sys.exit(0)
if 'sh' in args:sys.exit(0)
request=json.loads(sys.stdin.readline())
assert request['password']=='test quote " ñ'
assert '--watch-stdin' in args
pathlib.Path(os.environ['HANDOFF']).write_text(json.dumps({'args':args,'lang':request['lang']}))
# The adapter keeps stdin open during work, so Qt cancellation can close it.
sys.exit(int(os.environ.get('CHILD_EXIT','0')))
''');shim.chmod(0o755)
        request_dir=root/'fyso-request-test';request_dir.mkdir()
        request=request_dir/'request.json';request.write_text(json.dumps({'name':'fixture','password':'test quote " ñ'}))
        return request,{**os.environ,'PATH':str(binary)+os.pathsep+os.environ['PATH'],
            'PS_SCRIPT':str(payload/'windows.ps1'),'LINUX_ASSETS':str(root/'assets with spaces'),'HANDOFF':str(root/'handoff')}

    def invoke(self, request, env, mode='Install'):
        return subprocess.run([PS,'-NoProfile','-File',env['PS_SCRIPT'],
                               '-Mode',mode,'-RequestFile',str(request),'-Language','en'],
                              env=env,cwd=request.parent.parent,capture_output=True,text=True,timeout=30)

    def test_unicode_secret_stdin_and_paths_with_spaces(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);request,env=self.fixture(root)
            r=self.invoke(request,env)
            self.assertEqual(r.returncode,0,r.stderr)
            self.assertFalse(request.exists())
            handoff=json.loads((root/'handoff').read_text())
            self.assertEqual(handoff['lang'],'en')
            self.assertIn(str(root/'assets with spaces/install.py'),handoff['args'])
            self.assertNotIn('test quote',r.stdout+r.stderr)

    def test_linux_failure_propagates_to_qt(self):
        with tempfile.TemporaryDirectory() as tmp:
            request,env=self.fixture(Path(tmp));env['CHILD_EXIT']='7'
            r=self.invoke(request,env);self.assertEqual(r.returncode,7,r.stderr)

    def test_wsl1_is_rejected_without_mutating_a_distribution(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);request,env=self.fixture(root);env['WSL1']='1'
            r=self.invoke(request,env,mode='Check')
            self.assertNotEqual(r.returncode,0);self.assertFalse((root/'handoff').exists())


if __name__=='__main__':unittest.main()
