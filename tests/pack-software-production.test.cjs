// Software production vertical (pack-software-production): its department template is a valid
// omb-team/1 package, bots ask before acting, and the bundled sources have no machine paths.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const t=require('../template/framework/scripts/team-template.cjs');
const yaml=require('yaml');

const ROOT=path.join(__dirname,'../template/framework/extensions/pack-software-production');
const SRC=path.join(ROOT,'extensions/pack-software-production');

test('the department template validates as an omb-team/1 package', () => {
  const pkg=t.extensionPackage('pack-software-production','produccion-software',{root:ROOT});
  assert.equal(pkg.departamento,'Producción de software');
  assert.equal(pkg.formato,'omb-team/1');
  assert.equal(pkg.skills.length,2);
  assert.match(t.digest(pkg),/^[0-9a-f]{64}$/);
});

test('the template is listed by the core as an installed extension template', () => {
  const found=t.templates({root:ROOT}).filter(item=>item.extension==='pack-software-production');
  assert.equal(found.length,1, JSON.stringify(found));
  assert.equal(found[0].error,undefined);
  assert.equal(found[0].bots.length,5);
  assert.equal(found[0].skills,2);
});

test('five bots, each asking before acting, with a soul and a model', () => {
  const team=yaml.parse(fs.readFileSync(path.join(SRC,'teams/produccion-software/team.yaml'),'utf8'));
  assert.equal(team.version,1);
  assert.deepEqual(team.bots.map(bot=>bot.name),[
    'Requirements Intake','Software Planner','Software Developer','Code Reviewer','Delivery Reporter']);
  for (const bot of team.bots) {
    assert.equal(bot.approval,'ask',bot.name);
    assert.equal(bot.team,'Producción de software',bot.name);
    assert.ok(bot.soul.trim(),bot.name);
    assert.match(bot.model,/^claude\/[\w.-]+$/,bot.name);
    assert.equal(bot.cwd,undefined,bot.name);
    assert.equal(bot.chief,undefined,bot.name);
  }
});

test('GitHub Issues: the repository question and the state labels the bots read', () => {
  const file=path.join(SRC,'github.yaml.slotjinja');
  const text=fs.readFileSync(file,'utf8');
  assert.match(text,/^repo: "\{\{ github_repo \}\}"$/m);
  const labels=yaml.parse(text.replace(/\{\{[^}]*\}\}/g,'x')).labels;
  assert.deepEqual(Object.keys(labels).sort(),['approved','in_progress','in_review','needs_info','plan_review']);
  assert.equal(new Set(Object.values(labels)).size,5);
  const copier=yaml.parse(fs.readFileSync(path.join(ROOT,'copier.yml'),'utf8'));
  assert.equal(copier.github_repo.default,'');
});

test('the bundled sources contain no machine-specific paths', () => {
  const host=/\/Users\/[\w.-]+|\/home\/[\w.-]+\/|\/private\/tmp\/|\/var\/folders\//;
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>
    item.isDirectory()?walk(path.join(dir,item.name)):[path.join(dir,item.name)]);
  for (const file of walk(ROOT)) assert.doesNotMatch(fs.readFileSync(file,'utf8'),host,file);
});
