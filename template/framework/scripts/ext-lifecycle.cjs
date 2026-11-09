const fs = require('node:fs');
const {read, glob, validId, workflows} = require('./extensions.cjs');
try {
  if (process.argv[2] === 'list') {
    for (const file of glob('.copier-answers.ext-*.yml')) {
      const answers = read(file);
      console.log([file.slice('.copier-answers.ext-'.length,-4),answers._src_path,answers._commit || ''].join('\t'));
    }
  } else if (process.argv[2] === 'remove') {
    const id = process.argv[3];
    if (!validId(id) || process.argv.length !== 4) throw Error('Usage: mise run ext:remove <ext>');
    const answers = `.copier-answers.ext-${id}.yml`;
    if (!fs.existsSync(answers)) throw Error(`Extension ${id} is not installed`);
    fs.rmSync(`extensions/${id}`,{recursive:true,force:true});
    fs.rmSync(`.config/mise/conf.d/ext-${id}.toml`,{force:true});
    for (const file of workflows(id)) fs.rmSync(file);
    fs.rmSync(answers);
  } else throw Error('Unknown lifecycle operation');
} catch(error) {console.error(error.message);process.exitCode=1;}
