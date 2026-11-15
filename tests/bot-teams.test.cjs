// Native OMB teams in the panel (D81): team.yaml `teams:`/`team:` are read, edited and diffed.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const team=()=>import('../template/framework/panel/src/lib/team.ts');
const roster=()=>import('../template/framework/panel/src/lib/botRoster.ts');
const TEAM=`version: 1
teams:
  - name: Equipo comercial
    brief: { file: \${FYSO_ROOT}/project/bots/brief.md }
  - name: Soporte
    brief: |
      Answer kindly.
bots:
  - name: MausBot
    chief: true
    model: claude/a
  - name: Jefa comercial
    team: Equipo comercial
    chief: true
    model: claude/a
  - name: Redactor
    team: Equipo comercial
    model: claude/a
  - name: Builder
    model: claude/a
rooms:
  - name: Comercial
    team: Mesa
    members: [Redactor]
`;
test('only the default MausBot is hidden; a team chief stays listed',async()=>{
  const {parseTeam,readBots,listedBots}=await team();
  const bots=readBots(parseTeam(TEAM));
  assert.deepEqual(bots.map(b=>[b.name,b.team]),[['MausBot',''],['Jefa comercial','Equipo comercial'],['Redactor','Equipo comercial'],['Builder','']]);
  assert.deepEqual(listedBots(bots).map(b=>b.name),['Jefa comercial','Redactor','Builder']);
});
test('teams, briefs and every team name the file uses are read',async()=>{
  const {parseTeam,readTeams,teamNames}=await team();
  const doc=parseTeam(TEAM);
  assert.deepEqual(readTeams(doc),[
    {name:'Equipo comercial',brief:{kind:'file',file:'${FYSO_ROOT}/project/bots/brief.md'}},
    {name:'Soporte',brief:{kind:'inline',text:'Answer kindly.\n'}},
  ]);
  assert.deepEqual(teamNames(doc),['Equipo comercial','Soporte','Mesa']);
});
test('the form sets, keeps and clears a bot team without touching other keys',async()=>{
  const {parseTeam,readBots,upsertBot,serializeTeam}=await team();
  const doc=parseTeam(TEAM);
  const base={title:'',model:'claude/a',soulText:null,usesWorkflows:false};
  upsertBot(doc,3,{...base,name:'Builder',team:' Soporte '});
  upsertBot(doc,2,{...base,name:'Redactor'});
  upsertBot(doc,1,{...base,name:'Jefa comercial',team:''});
  const bots=readBots(doc);
  assert.equal(bots[3].team,'Soporte');assert.equal(bots[2].team,'Equipo comercial');assert.equal(bots[1].team,'');assert.equal(bots[1].chief,true);
  assert.match(serializeTeam(doc),/brief: \{ file: \$\{FYSO_ROOT\}\/project\/bots\/brief\.md \}/);
});
test('the panel rejects clearing an existing team because OMB ignores it',async()=>{
  const {invalidTeamRemoval}=await team();
  assert.equal(invalidTeamRemoval('Sales','  '),true);
  assert.equal(invalidTeamRemoval('Sales','Support'),false);
  assert.equal(invalidTeamRemoval('',''),false);
});
test('clearing a draft-only team is allowed while native membership remains protected',async()=>{
  const {appliedTeamForRemoval,invalidTeamRemoval}=await team();
  const draft={name:'Agent',index:0,team:'Sales'};
  const base=[{...draft,team:''}];
  assert.equal(invalidTeamRemoval(appliedTeamForRemoval(draft,[{name:'Agent',section:''}],base),''),false);
  assert.equal(invalidTeamRemoval(appliedTeamForRemoval(draft,[],[]),''),false);
  assert.equal(invalidTeamRemoval(appliedTeamForRemoval(draft,[{name:'Agent',section:'Sales'}],base),''),true);
  assert.equal(invalidTeamRemoval(appliedTeamForRemoval(draft,null,[draft]),''),true);
});
test('moving a bot to another team is a change of that bot, not a delete plus a create',async()=>{
  const {parseTeam,readBots,upsertBot,diffBots,listedBots}=await team();
  const before=listedBots(readBots(parseTeam(TEAM)));
  const doc=parseTeam(TEAM);
  upsertBot(doc,3,{title:'',model:'claude/a',soulText:null,usesWorkflows:false,name:'Builder',team:'Soporte'});
  const rows=diffBots(before,listedBots(readBots(doc)));
  assert.deepEqual(rows.map(r=>[r.bot.name,r.state]),[['Jefa comercial','applied'],['Redactor','applied'],['Builder','pending']]);
  // Same name in two teams: each draft matches its own team before falling back to the name.
  const twin=(name,team,fingerprint)=>({name,team,fingerprint});
  const pair=diffBots([twin('A','x','1'),twin('A','y','2')],[twin('A','y','2'),twin('A','x','1')]);
  assert.deepEqual(pair.map(r=>r.state),['applied','applied']);
});
test('the roster groups bots by team, General first, then the file order',async()=>{
  const {botRoster,groupByTeam}=await roster();
  const row=(name,team,state='applied',index=0)=>({bot:{index,name,team,title:'',model:'claude/a'},state});
  const native=(id,name,section)=>({id,name,section,title:'',modelSelection:{instanceId:'claude',model:'a'}});
  const rows=botRoster([row('Redactor','Equipo comercial'),row('Builder','Soporte','pending',1)],
    [native('r','Redactor','Equipo comercial'),native('b','Builder',undefined),native('o','Native only','Ventas')]);
  assert.deepEqual(rows.map(r=>[r.name,r.team]),[['Redactor','Equipo comercial'],['Builder','Soporte'],['Native only','Ventas']]);
  const groups=groupByTeam([...rows,{key:'g',name:'Loose',title:'',model:''}],['Soporte','Equipo comercial']);
  assert.deepEqual(groups.map(g=>[g.team,g.rows.map(r=>r.name)]),[['',['Loose']],['Soporte',['Builder']],['Equipo comercial',['Redactor']],['Ventas',['Native only']]]);
  // Two native bots with one name in different teams link to their own declaration only when unique.
  const twins=botRoster([row('A','x'),row('A','y','applied',1)],[native('1','A','x'),native('2','A','y')]);
  assert.ok(twins.every(r=>r.ambiguous));
});
test('the panel declares a department and edits its shared instructions in the native file',async()=>{
  const {parseTeam,readTeams,upsertTeam,serializeTeam}=await team();
  const doc=parseTeam('version: 1\nbots:\n  - name: Builder\n    model: claude/a\n');
  upsertTeam(doc,null,{name:' Ventas ',brief:'Sean breves.'});
  const text=serializeTeam(doc);
  assert.ok(text.indexOf('teams:')<text.indexOf('bots:'),text);
  assert.deepEqual(readTeams(parseTeam(text)),[{name:'Ventas',brief:{kind:'inline',text:'Sean breves.\n'}}]);
  // Editing keeps the name, even if another one is passed; an empty brief removes it.
  upsertTeam(doc,'ventas',{name:'Otro',brief:''});
  assert.deepEqual(readTeams(doc),[{name:'Ventas',brief:{kind:'none'}}]);
  // A brief kept in a file is never replaced from the panel.
  const file=parseTeam(TEAM);
  upsertTeam(file,'Equipo comercial',{name:'',brief:null});
  assert.deepEqual(readTeams(file)[0].brief,{kind:'file',file:'${FYSO_ROOT}/project/bots/brief.md'});
});
test('a declared department without agents is still listed',async()=>{
  const {groupByTeam}=await roster();
  assert.deepEqual(groupByTeam([{key:'b',name:'Builder',title:'',model:''}],['Ventas']).map(g=>[g.team,g.rows.length]),[['',1],['Ventas',0]]);
  assert.deepEqual(groupByTeam([],[]),[]);
});
