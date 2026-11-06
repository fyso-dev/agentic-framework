#!/usr/bin/env python3
"""Pair only this isolated OMB, test Caddy transport, then revoke the test session."""
import json, os, re, subprocess, urllib.request, urllib.error
base='http://127.0.0.1:8600'
auth=os.environ['GATEWAY_AUTH']
common={'Host':'omb.localhost:8600','Authorization':auth,'Origin':'http://omb.localhost:8600','Sec-Fetch-Site':'same-origin'}
def request(path, headers=None, body=None, local=False, method=None):
    h={} if local else dict(common)
    h.update(headers or {})
    if body is not None: h['Content-Type']='application/json'
    req=urllib.request.Request(('http://127.0.0.1:8604' if local else base)+path,headers=h,data=None if body is None else json.dumps(body).encode(),method=method)
    try:return urllib.request.urlopen(req,timeout=10)
    except urllib.error.HTTPError as e:return e
r=request('/')
html=r.read().decode()
print('page',r.status,'X-Frame-Options',r.headers.get('X-Frame-Options'),'CSP',r.headers.get('Content-Security-Policy'))
assets=re.findall(r'(?:src|href)="(/assets/[^\"]+)"',html)
for asset in assets[:3]:
    r=request(asset);print('asset',asset,r.status);r.read()
for path in ['/api/bots','/api/events']:
    r=request(path,{'X-Auth-Request-User':'admin'});print('unpaired',path,r.status,r.read().decode()[:140])
pair=json.load(request('/api/auth/pairing',body={'label':'gateway-spike','scopes':['client']},local=True))
print('pairing URL present',bool(pair.get('url')),'hint',pair.get('hint'))
try:
    r=request('/api/auth/pair',body={'code':pair['code'],'cookie':True,'label':'gateway-spike'})
    cookie=r.headers['Set-Cookie'].split(';')[0];print('exchange',r.status);r.read()
    r=request('/api/bots',{'Cookie':cookie});body=json.load(r);print('paired API',r.status,'bot count',len(body.get('bots',[])))
    args=['curl','--noproxy','*','-N','--max-time','3','-sS','-i']
    for key,value in {**common,'Cookie':cookie}.items():args+=['-H',key+': '+value]
    r=subprocess.run(args+[base+'/api/events'],capture_output=True,text=True)
    safe=re.sub(r'(?im)^set-cookie:.*$', 'Set-Cookie: [redacted]',r.stdout)
    print('paired SSE curl exit',r.returncode,safe[:1000],r.stderr.strip())
finally:
    sessions=json.load(request('/api/auth/sessions',local=True)).get('sessions',[])
    for session in sessions:
        if session.get('label')=='gateway-spike':
            r=request('/api/auth/sessions/'+session['id'],local=True,method='DELETE');r.read();print('session revoked',r.status)
