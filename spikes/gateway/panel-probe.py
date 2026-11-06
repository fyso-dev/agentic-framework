#!/usr/bin/env python3
"""Exercise the no-backend pattern through Caddy, with browser-like headers."""
import json, os, time, urllib.request, urllib.error
from pathlib import Path
headers={'Host':'panel.localhost:8600','Origin':'http://panel.localhost:8600','Sec-Fetch-Site':'same-origin','Authorization':os.environ['GATEWAY_AUTH']}
def req(path,body=None,method=None):
    h=dict(headers)
    if body is not None:h['Content-Type']='application/json'
    r=urllib.request.Request('http://127.0.0.1:8600'+path,headers=h,data=None if body is None else json.dumps(body).encode(),method=method)
    try:return urllib.request.urlopen(r,timeout=10)
    except urllib.error.HTTPError as e:return e
r=req('/config/team.yaml');text=r.read().decode();assert r.status==200 and 'bots: []' in text;print('config GET',r.status)
for method in ['POST','PUT','DELETE']:
    r=req('/config/team.yaml',method=method);r.read();assert r.status==405;print('config',method,r.status)
message='gateway-panel-proof'
r=req('/api/v1/dags/gateway-echo/start',{'params':'MESSAGE='+message});body=json.load(r);assert r.status==200;run=body['dagRunId'];print('start',r.status,run)
path='/api/v1/dag-runs/gateway-echo/'+run
for _ in range(30):
    r=req(path);body=json.load(r);status=body['dagRunDetails']['statusLabel']
    if status in ['succeeded','failed','aborted']:break
    time.sleep(0.5)
assert status=='succeeded',body
print('status',r.status,status)
r=req(path+'/outputs');outputs=json.load(r)['outputs'];assert outputs['echo']==message;print('outputs',r.status,outputs)
file=Path(__file__).resolve().parents[2]/'.data/dagu/spike-output/message.txt'
assert file.read_text().strip()==message;print('file matches supplied param',True)
