"""GNU base64 must not fold the project's Dagu Authorization header."""
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]


class LinuxHeaders(unittest.TestCase):
    def test_long_credentials_produce_one_header_line(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);scripts=root/'framework/scripts';scripts.mkdir(parents=True)
            for name in ['lib.sh','run-omb.sh']:shutil.copy(ROOT/'template/framework/scripts'/name,scripts)
            binary=root/'bin';binary.mkdir()
            # Reproduce GNU wrapping even when the test host's base64 does not wrap.
            b64=binary/'base64'
            b64.write_text('#!/usr/bin/env python3\nimport base64,sys,textwrap\nprint("\\n".join(textwrap.wrap(base64.b64encode(sys.stdin.buffer.read()).decode(),76)))\n');b64.chmod(0o755)
            omb=binary/'openmausbot'
            omb.write_text('#!/usr/bin/env python3\nimport json,os\nprint(json.dumps({"header":os.environ["DAGU_MCP_AUTH"]}))\n');omb.chmod(0o755)
            env={**os.environ,'PATH':str(binary)+os.pathsep+os.environ['PATH'],'FYSO_ROOT':str(root),'FYSO_DATA':str(root/'.data'),
                 'FYSO_WEB_DOMAIN':'fixture.localhost','FYSO_ADMIN_USER':'fixture-user','FYSO_ADMIN_PASSWORD':'x'*120,
                 **{f'FYSO_{name}_PORT':str(8500+i) for i,name in enumerate(['OMB','OMB_WEBHOOK','HTTP','DAGU'])}}
            r=subprocess.run(['bash',str(scripts/'run-omb.sh')],env=env,capture_output=True,text=True,check=True)
            header=json.loads(r.stdout)['header']
            self.assertNotIn('\n',header)
            self.assertEqual(base64.b64decode(header[6:]).decode(),'fixture-user:'+('x'*120))


if __name__=='__main__':unittest.main()
