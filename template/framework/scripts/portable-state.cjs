// Normalize known host paths only in the VERSIONED copy, never in live OMB data.
const fs=require('node:fs'),path=require('node:path');
function portable(text,root,home) {return text.replaceAll(root,'${FYSO_ROOT}').replaceAll(home,'${HOME}');}
if(require.main===module) {
  const base=process.argv[2];
  for(const file of fs.globSync('**/*',{cwd:base})) {
    if(!/\.(md|ya?ml|json)$/.test(file))continue;
    const name=path.join(base,file);
    if(fs.lstatSync(name).isFile())fs.writeFileSync(name,portable(fs.readFileSync(name,'utf8'),process.env.FYSO_ROOT,process.env.HOME));
  }
}
module.exports={portable};
