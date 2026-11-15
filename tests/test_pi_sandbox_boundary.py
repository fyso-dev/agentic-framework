"""Opt-in macOS boundary probe; no credentials or existing service is touched."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest


@unittest.skipUnless(sys.platform == 'darwin' and os.environ.get('FYSO_TEST_PI_SANDBOX') == '1',
                     'requires an explicitly selected macOS sandbox probe')
class PiSandboxBoundary(unittest.TestCase):
    def test_only_selected_ports_and_lock_paths_are_writable(self):
        node = os.environ.get('FYSO_TEST_NODE') or shutil.which('node')
        self.assertTrue(node, 'Node is required')
        with tempfile.TemporaryDirectory(prefix='fyso-boundary-probe-') as tmp:
            base = Path(tmp).resolve(); fixture = base / 'fixture'; fixture.mkdir()
            outside = base / 'outside'; outside.mkdir(); lock = outside / 'auth.json.lock'
            sockets = [socket.socket(), socket.socket(), socket.socket(), socket.socket(socket.AF_INET6)]
            try:
                for sock in sockets[:3]:
                    sock.bind(('127.0.0.1', 0)); sock.listen()
                try: sockets[3].bind(('::1', 0)); sockets[3].listen()
                except OSError: self.skipTest('IPv6 loopback is unavailable')
                own, other, tls, tls_v6 = [sock.getsockname()[1] for sock in sockets]
                profile = '''(version 1)
(allow default)
(deny file-write*)
(allow file-write* (subpath (param "FIXTURE")) (literal (param "LOCK")) (subpath (param "LOCK")))
(deny network*)
(allow network-outbound (remote tcp (param "OWN_PORT")))
(allow network-outbound (remote tcp (param "TLS_PORT")))
(deny network-outbound (remote tcp (param "TLS_LOCAL")))
(allow network-outbound (remote tcp (param "TLS_V6_PORT")))
(deny network-outbound (remote tcp (param "TLS_V6_LOCAL")))
(allow network-outbound (remote unix-socket (literal "/private/var/run/mDNSResponder")))
'''
                script = r'''const fs=require('fs'),net=require('net'),dns=require('dns');
const [own,other,tls,tlsV6,fixture,lock,outside,testDns]=process.argv.slice(1);
const connect=(p,host='127.0.0.1')=>new Promise(resolve=>{const s=net.connect({port:Number(p),host});s.on('connect',()=>{s.destroy();resolve(true)});s.on('error',()=>resolve(false))});
(async()=>{const result={inside:false,lock:false,outsideDenied:false};
try{fs.writeFileSync(fixture+'/canary','x');result.inside=true}catch{}
try{fs.mkdirSync(lock);fs.writeFileSync(lock+'/canary','x');result.lock=true}catch{}
try{fs.writeFileSync(outside,'x')}catch{result.outsideDenied=true}
result.ownAllowed=await connect(own);result.otherDenied=!(await connect(other));
result.tlsLoopbackDenied=!(await connect(tls));
result.tlsIpv6LoopbackDenied=!(await connect(tlsV6,'::1'));
if(testDns==='1')result.dns=await new Promise(resolve=>dns.lookup('chatgpt.com',error=>resolve(!error)));
console.log(JSON.stringify(result));if(Object.values(result).some(value=>!value))process.exitCode=1})()'''
                result = subprocess.run(['/usr/bin/sandbox-exec', '-D', f'FIXTURE={fixture}', '-D', f'LOCK={lock}',
                                         '-D', f'OWN_PORT=localhost:{own}', '-D', f'TLS_PORT=*:{tls}',
                                         '-D', f'TLS_LOCAL=localhost:{tls}', '-D', f'TLS_V6_PORT=*:{tls_v6}',
                                         '-D', f'TLS_V6_LOCAL=localhost:{tls_v6}', '-p', profile, node, '-e', script,
                                         str(own), str(other), str(tls), str(tls_v6), str(fixture), str(lock), str(outside / 'forbidden'),
                                         os.environ.get('FYSO_TEST_PI_DNS', '')],
                                        capture_output=True, text=True, timeout=20)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertTrue(all(json.loads(result.stdout).values()))
                self.assertFalse((outside / 'forbidden').exists())
            finally:
                for sock in sockets: sock.close()


if __name__ == '__main__': unittest.main()
