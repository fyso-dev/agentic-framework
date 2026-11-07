"""Isolated contract checks: native Qt metadata, Linux/Dagu handoff and Windows adapter."""
import importlib.util
import json
import os
import re
from pathlib import Path
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import time
import unittest
import xml.etree.ElementTree as ET
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / 'installer/qt/runtime'
spec = importlib.util.spec_from_file_location('qt_install', RUNTIME / 'install.py')
installer = importlib.util.module_from_spec(spec); spec.loader.exec_module(installer)


class Contracts(unittest.TestCase):
    def test_locale_parity_and_metadata(self):
        es = json.loads((ROOT / 'installer/qt/locales/es.json').read_text())
        en = json.loads((ROOT / 'installer/qt/locales/en.json').read_text())
        self.assertEqual(es.keys(), en.keys())
        for p in [ROOT/'installer/qt/config/config.xml',ROOT/'installer/qt/meta/package.xml',ROOT/'installer/qt/meta/project.ui']:
            ET.parse(p)

    def test_slug_uniqueness_including_31_character_limit(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp); name='a'*31
            (folder/name).mkdir()
            self.assertEqual(installer.slug_for(name,folder,{name[:-2]+'-2'}),name[:-2]+'-3')
            self.assertRegex(installer.slug_for('123 ó !!',folder,set()),r'^[a-z][a-z0-9-]{1,30}$')

    def test_extension_ports_are_reserved_too(self):
        with socket.socket() as listener:
            listener.bind(('0.0.0.0',0))
            port=listener.getsockname()[1]
            base=port-port%10-10
            self.assertFalse(installer.free_block(base,[]))
        self.assertFalse(installer.free_block(8400,[{'port_base':'8400'}]))
        self.assertFalse(installer.free_block(65530,[]))
        self.assertFalse(installer.free_block(8400,[],[8414]))
        self.assertFalse(installer.free_block(8400,[{'port_base':'8410'}]))

    def test_inventory_retains_stopped_projects_and_ignores_removed_ones(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); p=root/'elsewhere'; p.mkdir()
            (p/'.copier-answers.yml').write_text("project_slug: 'my-project'\nport_base: 8420\n")
            registry=root/'registry';registry.write_text(str(p)+'\n'+str(root/'removed')+'\n')
            self.assertEqual(installer.inventory(root/'parent',registry),[{'project_slug':'my-project','port_base':'8420'}])


class Handoff(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.bin=self.root/'bin';self.bin.mkdir()
        for tool in ['lsof','rsync']:
            (self.bin/tool).write_text('#!/bin/sh\nexit 0\n');(self.bin/tool).chmod(0o755)
        mise=self.bin/'mise'
        mise.write_text('''#!/usr/bin/env python3
import json,os,sys,pathlib,stat
args=sys.argv[1:]
with open(os.environ['COMMAND_LOG'],'a') as out:out.write(json.dumps(args)+'\\n')
if 'dagu' in args and 'start' in args:
 p=dict(a.split('=',1) for a in args[args.index('--',args.index('start'))+1:])
 secret=pathlib.Path(p['PASSWORD_FILE'])
 assert stat.S_IMODE(secret.stat().st_mode)==0o600
 assert secret.read_text().strip()==os.environ['EXPECTED_PASSWORD']
 pathlib.Path(os.environ['SECRET_PATH']).write_text(str(secret))
 if os.environ.get('HOLD_STEP'):
  import time;time.sleep(30)
 dest=pathlib.Path(p['DIR']);dest.mkdir()
 (dest/'.copier-answers.yml').write_text('project_slug: '+p['SLUG']+'\\nport_base: '+p['PORT']+'\\n')
 if os.environ.get('FAIL_STEP')=='dagu':sys.exit(1)
if 'doctor' in args and os.environ.get('FAIL_STEP')=='doctor':sys.exit(1)
''');mise.chmod(0o755)
        self.env={**os.environ,'PATH':str(self.bin)+os.pathsep+os.environ['PATH'],
                  'XDG_STATE_HOME':str(self.root/'state'),'HOME':str(self.root/'home'),
                  'COMMAND_LOG':str(self.root/'commands'),'SECRET_PATH':str(self.root/'secret-path'),
                  'EXPECTED_PASSWORD':'quotes\'" $() and unicode ñ'}
        self.request={'name':'Test project','folder':str(self.root/'projects'),'engine':'codex',
                      'admin':'tester','password':self.env['EXPECTED_PASSWORD'],'source':str(self.root/'template')}
        self.copy=json.loads((ROOT/'installer/qt/locales/en.json').read_text())
        self.locale_dir=self.root/'assets/locales';self.locale_dir.mkdir(parents=True)
        for lang in ['es','en']:shutil.copy(ROOT/f'installer/qt/locales/{lang}.json',self.locale_dir)

    def tearDown(self):self.tmp.cleanup()

    def run_install(self,fail=None):
        if fail:self.env['FAIL_STEP']=fail
        with patch.dict(os.environ,self.env,clear=True),patch.object(installer,'RES',self.root/'assets'):
            installer.install(dict(self.request))

    def test_secret_is_private_ephemeral_and_never_a_dagu_parameter(self):
        self.run_install()
        commands=(self.root/'commands').read_text()
        self.assertNotIn(self.request['password'],commands)
        self.assertIn('PASSWORD_FILE=',commands)
        self.assertFalse(Path((self.root/'secret-path').read_text()).exists())
        self.assertIn('doctor',commands)
        self.assertIn('test-project',(self.root/'state/fyso/projects.txt').read_text())

    def test_failed_dagu_removes_password_and_does_not_claim_success(self):
        with self.assertRaises(subprocess.CalledProcessError):self.run_install('dagu')
        self.assertFalse(Path((self.root/'secret-path').read_text()).exists())
        self.assertNotIn('doctor',(self.root/'commands').read_text())

    def test_doctor_failure_preserves_project_and_reserves_identity(self):
        with self.assertRaises(subprocess.CalledProcessError):self.run_install('doctor')
        self.assertTrue((self.root/'projects/test-project').exists())
        self.assertIn('test-project',(self.root/'state/fyso/projects.txt').read_text())

    def test_repeated_installs_get_distinct_directories_and_ports(self):
        self.run_install();self.run_install()
        self.assertTrue((self.root/'projects/test-project-2').exists())
        ports=re.findall(r'PORT=([0-9]+)',(self.root/'commands').read_text())
        self.assertEqual(len(ports),2);self.assertNotEqual(ports[0],ports[1])

    def test_windows_control_pipe_eof_cancels_only_installer_work_and_cleans_secret(self):
        self.env['HOLD_STEP']='1'
        shutil.copy(RUNTIME/'install.py',self.root/'assets/install.py')
        child=subprocess.Popen([sys.executable,str(self.root/'assets/install.py'),'--watch-stdin'],
                               env=self.env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            child.stdin.write(json.dumps(self.request)+'\n');child.stdin.flush()
            deadline=time.monotonic()+10
            while not (self.root/'secret-path').exists() and child.poll() is None and time.monotonic()<deadline:
                time.sleep(.05)
            self.assertTrue((self.root/'secret-path').exists())
            secret=Path((self.root/'secret-path').read_text())
            child.stdin.close()
            child.wait(timeout=10)
            self.assertEqual(child.returncode,130)
            self.assertFalse(secret.exists())
        finally:
            if child.poll() is None:child.kill();child.wait()
            child.stdout.close();child.stderr.close()

    def test_request_file_is_consumed_on_validation_failure(self):
        private=self.root/'fyso-request-test';private.mkdir()
        request=private/'request.json';request.write_text('{"name":"", "password":"test"}');request.chmod(0o600)
        r=subprocess.run([sys.executable,str(RUNTIME/'install.py'),'--request-file',str(request)],env=self.env,capture_output=True,text=True)
        self.assertEqual(r.returncode,1);self.assertFalse(request.exists());self.assertNotIn('"password"',r.stderr)


if __name__=='__main__':unittest.main()
