// Optional project-scoped GitHub read credential. Git and gh own authentication;
// no token is placed in argv, a URL, a Git config file, or a persisted helper.
const {spawnSync}=require('node:child_process');
function gitEnv(env=process.env) {
  const result={...env,GIT_TERMINAL_PROMPT:'0'};
  if (!['','native','gh'].includes(env.FYSO_GITHUB_AUTH||'')) throw Error('FYSO_GITHUB_AUTH must be native or gh');
  if (!env.FYSO_GITHUB_TOKEN && env.FYSO_GITHUB_AUTH!=='gh') return result;
  const count=Number(env.GIT_CONFIG_COUNT||0);
  if(!Number.isSafeInteger(count)||count<0)throw Error('Invalid Git environment configuration');
  if(env.FYSO_GITHUB_TOKEN)result.GH_TOKEN=env.FYSO_GITHUB_TOKEN;
  result.GIT_CONFIG_COUNT=String(count+2);
  // An explicit project policy selects the native gh helper for github.com only.
  result[`GIT_CONFIG_KEY_${count}`]='credential.https://github.com.helper';
  result[`GIT_CONFIG_VALUE_${count}`]='';
  result[`GIT_CONFIG_KEY_${count+1}`]='credential.https://github.com.helper';
  result[`GIT_CONFIG_VALUE_${count+1}`]='!gh auth git-credential';
  return result;
}
module.exports={gitEnv};
if(require.main===module) {
  try {
    const args=process.argv.slice(2),env=gitEnv();
    if(args[0]==='check') {
      const source=args[1]||'gh:fyso-dev/agentic-framework';
      const url=require('./marketplace.cjs').gitUrl(source);
      const r=spawnSync('git',['ls-remote','--heads',url],{env,stdio:'ignore',timeout:30_000});
      if(r.status!==0)throw Error('GitHub read access failed. Check this host account, repository permissions, or encrypted FYSO_GITHUB_TOKEN.');
      console.log('GitHub read access verified.');
    } else {
      if(args.shift()!=='--'||!args.length)throw Error('Usage: github-auth.cjs check [source] | -- command [args]');
      const command=args.shift(),r=spawnSync(command,args,{env,stdio:'inherit'});
      if(r.error)throw Error('Could not start the GitHub-authenticated command.');
      process.exitCode=r.status??1;
    }
  } catch(e) { console.error(e.message);process.exitCode=1; }
}
