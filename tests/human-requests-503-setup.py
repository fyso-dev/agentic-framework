import os,pathlib,subprocess,time,urllib.request,urllib.error,json,shutil,socket,signal
port=int(os.environ["FYSO_TEST_DAGU_PORT"])
if not 1024 <= port <= 65531: raise SystemExit("Invalid port block")
sockets=[]
try:
 for n in range(port,port+5):
  sock=socket.socket(); sock.bind(("127.0.0.1",n)); sockets.append(sock)
except OSError as e: raise SystemExit(f"Port block unavailable: {e}")
finally:
 for sock in sockets: sock.close()
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
root=pathlib.Path(os.environ['FYSO_503_ROOT']); root.mkdir(mode=0o700); (root/'dags').mkdir()
src=pathlib.Path(__file__).resolve().parents[1]/'template/framework/extensions/human-requests'; shutil.copytree(src/'extensions',root/'extensions'); shutil.copy(src/'project/workflows/ext-human-requests-request.yaml',root/'dags')
env={**{k:v for k,v in os.environ.items() if not k.startswith(('DAGU_', 'FYSO_', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'))},'DAGU_HOME':str(root/'dagu'),'DAGU_DAGS_DIR':str(root/'dags'),'DAGU_HOST':'127.0.0.1','DAGU_PORT':''+os.environ['FYSO_TEST_DAGU_PORT']+'','DAGU_SCHEDULER_PORT':''+str(int(os.environ['FYSO_TEST_DAGU_PORT'])+1)+'','DAGU_COORDINATOR_PORT':''+str(int(os.environ['FYSO_TEST_DAGU_PORT'])+2)+'','DAGU_COORDINATOR_HEALTH_PORT':''+str(int(os.environ['FYSO_TEST_DAGU_PORT'])+3)+'','DAGU_WORKER_HEALTH_PORT':''+str(int(os.environ['FYSO_TEST_DAGU_PORT'])+4)+'','DAGU_AUTH_MODE':'none','DAGU_ENV_PASSTHROUGH_PREFIXES':'FYSO_','FYSO_ROOT':str(root),'FYSO_DAGU_PORT':''+os.environ['FYSO_TEST_DAGU_PORT']+'','FYSO_ADMIN_USER':'fixture','FYSO_ADMIN_PASSWORD':'fixture','PATH':os.environ.get('PATH','')}
dag=os.environ.get('FYSO_TEST_DAGU','dagu'); p=subprocess.Popen([dag,'start-all'],env=env,cwd=root,stdin=subprocess.DEVNULL,stdout=(root/'dagu.log').open('w'),stderr=subprocess.STDOUT,start_new_session=True); (root/'dagu.pid').write_text(str(p.pid)+'\n'+subprocess.check_output(['ps','-o','lstart=','-p',str(p.pid)],text=True).strip())
def call(path,body=None):
 try:
  req=urllib.request.Request('http://127.0.0.1:'+os.environ['FYSO_TEST_DAGU_PORT']+'/api/v1'+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json'})
  with opener.open(req,timeout=5) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
def wait(pred):
 for i in range(100):
  try:
   if pred():return
  except (urllib.error.URLError, ConnectionError, TimeoutError):pass
  time.sleep(.1)
 raise Exception('timeout')
def owned_listener():
 if p.poll() is not None: raise RuntimeError('Dagu exited before readiness')
 result=subprocess.run(['lsof','-nP','-ti',f'TCP:{port}','-sTCP:LISTEN'],capture_output=True,text=True)
 if result.returncode: return False
 for value in result.stdout.split():
  try:
   if os.getpgid(int(value)) == p.pid: return True
  except ProcessLookupError: pass
 return False
wait(lambda: owned_listener() and call('/health')[0]==200)
if not owned_listener(): raise RuntimeError('Dagu listener does not belong to fixture')
params={'QUESTION':'Prueba ficticia de recuperación','CONTEXT':'Sin efecto real','RECIPIENT':'team','ORIGIN_TYPE':'none','ORIGIN_REF':'','BLOCKING':'false'}
assert call('/dags/ext-human-requests-request/start',{'dagRunId':'recovery-ui','params':json.dumps(params)})[0]==200
base='/dag-runs/ext-human-requests-request/recovery-ui'
wait(lambda:call(base)[1]['dagRunDetails']['statusLabel']=='waiting')
queue=root/'dagu/data/queue'; queue.rename(root/'queue-backup'); queue.write_text('injected fault')
status,result=call(base+'/human-tasks/ask/complete',{'answer':'aprobado','comment':'','responder':'Persona de prueba','decision':'answered'})
assert status==503 and result['details']['completionStored'] is True and result['details']['resumePending'] is True
print('Isolated real Dagu: 503 saved response; queue failure active')
