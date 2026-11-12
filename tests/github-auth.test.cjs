// Optional GitHub read credential for Copier and catalog reads (github-auth.cjs).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {gitEnv}=require(path.resolve(__dirname,'../template/framework/scripts/github-auth.cjs'));

test('without a policy or token, only disables prompts', () => {
  const env=gitEnv({PATH:'/bin'});
  assert.equal(env.GIT_TERMINAL_PROMPT,'0');
  assert.equal(env.GIT_CONFIG_COUNT,undefined);
  assert.equal(env.GH_TOKEN,undefined);
});

test('a token selects the gh helper for github.com and stays out of Git config', () => {
  const env=gitEnv({FYSO_GITHUB_TOKEN:'secret-value'});
  assert.equal(env.GH_TOKEN,'secret-value');
  assert.equal(env.GIT_CONFIG_COUNT,'2');
  assert.equal(env.GIT_CONFIG_KEY_0,'credential.https://github.com.helper');
  assert.equal(env.GIT_CONFIG_VALUE_0,'');
  assert.equal(env.GIT_CONFIG_VALUE_1,'!gh auth git-credential');
  for(const [k,v] of Object.entries(env))if(k.startsWith('GIT_CONFIG_'))assert.ok(!v.includes('secret-value'));
});

test('existing GIT_CONFIG entries are kept', () => {
  const env=gitEnv({FYSO_GITHUB_AUTH:'gh',GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'a.b',GIT_CONFIG_VALUE_0:'c'});
  assert.equal(env.GIT_CONFIG_COUNT,'3');
  assert.equal(env.GIT_CONFIG_KEY_0,'a.b');
  assert.equal(env.GIT_CONFIG_KEY_1,'credential.https://github.com.helper');
});

test('invalid policies and Git environments are rejected', () => {
  assert.throws(()=>gitEnv({FYSO_GITHUB_AUTH:'token'}),/native or gh/);
  assert.throws(()=>gitEnv({FYSO_GITHUB_TOKEN:'x',GIT_CONFIG_COUNT:'-1'}),/Invalid Git/);
});
