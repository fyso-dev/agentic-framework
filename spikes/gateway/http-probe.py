#!/usr/bin/env python3
"""Print response codes and small safe bodies; do not print session headers."""
import argparse, json, os, urllib.request, urllib.error
p=argparse.ArgumentParser();p.add_argument('--label',required=True);a=p.parse_args()
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args): return None
opener=urllib.request.build_opener(NoRedirect)
print(a.label)
for host,port,auth in [('dagu.localhost:8600',8600,False),('dagu.localhost:8600',8600,True),('127.0.0.1:8601',8601,False)]:
 for path in ['/', '/api/v1/dags','/proxy-login','/mcp']:
  headers={'Host':host,'X-Auth-Request-User':'admin'}
  if auth: headers['Authorization']=os.environ['GATEWAY_AUTH']
  data=None
  if path=='/mcp':
   headers.update({'Content-Type':'application/json','Accept':'application/json, text/event-stream'})
   data=json.dumps({'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-03-26','capabilities':{},'clientInfo':{'name':'gateway-spike','version':'1'}}}).encode()
  req=urllib.request.Request('http://127.0.0.1:'+str(port)+path,headers=headers,data=data)
  try:r=opener.open(req,timeout=10)
  except urllib.error.HTTPError as e:r=e
  body=r.read().decode()
  print(host,'basic='+str(auth),path,r.status,r.headers.get('Content-Type'),('location='+r.headers.get('Location','').split('#')[0]),body[:100].replace('\n',' ').rstrip())
