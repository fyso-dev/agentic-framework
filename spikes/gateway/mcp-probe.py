#!/usr/bin/env python3
"""Read-only MCP handshake, tool listing and dagu_read; never prints auth headers."""
import argparse, json, os, urllib.request, urllib.error
p = argparse.ArgumentParser()
p.add_argument('--url', default='http://127.0.0.1:8601/mcp')
p.add_argument('--host')
p.add_argument('--auth-env')
a = p.parse_args()
headers = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'}
if a.host: headers['Host'] = a.host
if a.auth_env: headers['Authorization'] = os.environ[a.auth_env]
def call(method, params, ident):
    data = {'jsonrpc': '2.0', 'method': method, 'params': params}
    if ident is not None: data['id'] = ident
    try:
        r = urllib.request.urlopen(urllib.request.Request(a.url, data=json.dumps(data).encode(), headers=headers), timeout=15)
    except urllib.error.HTTPError as e:
        print(method, e.code, e.read().decode()[:400]); return None
    if r.headers.get('Mcp-Session-Id'): headers['Mcp-Session-Id'] = r.headers['Mcp-Session-Id']
    body = r.read().decode()
    if not body: return None
    if body.startswith('event:') or body.startswith('data:'):
        body = next(line[5:].strip() for line in body.splitlines() if line.startswith('data:'))
    result = json.loads(body)
    if method == 'tools/list':
        print('tools/list', r.status, [t['name'] for t in result.get('result', {}).get('tools', [])])
    else: print(method, r.status, json.dumps(result)[:1800])
    return result
call('initialize', {'protocolVersion': '2025-03-26', 'capabilities': {}, 'clientInfo': {'name': 'gateway-spike', 'version': '1'}}, 1)
call('notifications/initialized', {}, None)
call('tools/list', {}, 2)
call('tools/call', {'name': 'dagu_read', 'arguments': {'target': 'dags'}}, 3)
