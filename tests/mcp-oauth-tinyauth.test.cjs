// D88 against a real Tinyauth: FYSO_TEST_TINYAUTH (5.2.0 binary) and FYSO_TEST_CADDY (for bcrypt).
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{spawnSync}=require('node:child_process');
const repo=path.resolve(__dirname,'..');
const tools=[process.env.FYSO_TEST_TINYAUTH,process.env.FYSO_TEST_CADDY];
test('a real Tinyauth issues a token with PKCE that the remote MCP accepts for panel users only',{skip:tools.every(Boolean)?false:'requires FYSO_TEST_TINYAUTH and FYSO_TEST_CADDY'},()=>{
  const r=spawnSync(process.execPath,[path.join(__dirname,'mcp-oauth-tinyauth.cjs'),repo,...tools,path.join(repo,'template/framework/panel/node_modules/.bin')],{encoding:'utf8',timeout:60000});
  assert.equal(r.status,0,r.stdout+r.stderr);
  assert.doesNotMatch(r.stdout,/^FAIL/m);
});
