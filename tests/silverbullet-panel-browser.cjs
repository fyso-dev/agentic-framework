// Live acceptance of the SilverBullet extension's panel page against a generated,
// running project with the extension installed. Uses the repository's Playwright.
//   FYSO_TEST_WEB_PANEL=http://panel.<slug>-<port>.localhost:<port>
//   FYSO_TEST_WEB_PASSWORD_FILE=<file with the admin password>
//   FYSO_TEST_PROJECT_ROOT=<generated project>
const {chromium} = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const base = process.env.FYSO_TEST_WEB_PANEL, root = process.env.FYSO_TEST_PROJECT_ROOT;
if (!base || !root || !process.env.FYSO_TEST_WEB_PASSWORD_FILE) throw Error('Set an isolated panel URL, its project root and a private test password file');
const password = fs.readFileSync(process.env.FYSO_TEST_WEB_PASSWORD_FILE, 'utf8').trimEnd();
const docs = base.replace('//panel.', '//docs.');
const folder = path.resolve(__dirname, '../artifacts/delivery-evidence/silverbullet');
const dropped = path.join(root, 'project/wiki/Procedimientos/Despliegue.md');
fs.mkdirSync(folder, {recursive:true});
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const context = await browser.newContext({locale:'es-AR', viewport:{width:1440,height:1000}});
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message.slice(0, 120)));
    await page.goto(base + '/?lang=es');
    await page.locator('input[name="username"]').fill(process.env.FYSO_ADMIN_USER || 'admin');
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    // 1. The knowledge base is a section of the panel, not only a tile that leaves it.
    const nav = page.getByRole('navigation').getByRole('link', {name:'Conocimiento', exact:true}).first();
    await nav.click();
    const kb = page.frameLocator('iframe[title="Conocimiento"]');
    await kb.getByRole('heading', {name:'Conocimiento', exact:true}).waitFor();
    for (const way of ['Escríbela', 'Pídesela a un bot', 'Trae lo que ya tienes']) await kb.getByRole('heading', {name:way, exact:true}).waitFor();
    assert.equal(new URL(page.url()).origin, new URL(base).origin);

    // 2. The real SilverBullet editor runs inside it, with the same web session.
    const editor = kb.frameLocator('iframe[title="Editor de conocimiento"]');
    const rendered = editor.locator('.cm-content').filter({hasText:/\S/});
    await rendered.waitFor({timeout:30_000});
    assert.equal(await kb.locator('iframe[title="Editor de conocimiento"]').getAttribute('src'), docs);
    await page.screenshot({path:path.join(folder, 'panel-knowledge.png')});

    // 3. Feeding by files: a Markdown file dropped in project/wiki/ is a page right away.
    fs.mkdirSync(path.dirname(dropped), {recursive:true});
    fs.writeFileSync(dropped, '# Despliegue\n\nPrueba sintética: se despliega con `mise run up`.\n');
    const served = await context.request.get(`${docs}/.fs/Procedimientos/Despliegue.md`);
    assert.equal(served.status(), 200);
    assert.match(await served.text(), /Prueba sintética/);
    await editor.locator('body').evaluate(() => { location.href = '/Procedimientos/Despliegue'; });
    await editor.locator('.cm-content').filter({hasText:'Prueba sintética'}).waitFor({timeout:30_000});
    await page.screenshot({path:path.join(folder, 'panel-knowledge-dropped-file.png')});

    // 4. Feeding by bots: each bot shows its access, and "Dar acceso" lands on its skill switch.
    const bots = kb.locator('.kb-bots li');
    const count = await bots.count();
    assert.ok(count > 0, 'the default team has bots');
    await bots.first().getByRole('link', {name:'Dar acceso'}).click();
    await page.waitForURL(/#\/bots\/\d+\?tab=perfil$/);
    const toggle = page.getByRole('switch', {name:'project-knowledge'});
    await toggle.waitFor();
    await page.screenshot({path:path.join(folder, 'panel-bot-skill.png')});

    // 5. The guide folds away and stays folded; the editor remains.
    await nav.click();
    await kb.getByRole('button', {name:'Ocultar guía'}).click();
    await page.reload();
    await kb.getByRole('button', {name:'Cómo alimentarla'}).waitFor();
    assert.equal(await kb.getByRole('heading', {name:'Escríbela'}).count(), 0);
    await rendered.waitFor({timeout:30_000});
    await page.screenshot({path:path.join(folder, 'panel-knowledge-folded.png')});

    // 6. English, and the page's private slots stay private.
    await page.goto(base + '/?lang=en#/extensions/silverbullet/knowledge');
    await page.frameLocator('iframe[title="Knowledge"]').getByRole('button', {name:'How to feed it'}).waitFor();
    assert.equal((await context.request.get(`${base}/extensions/silverbullet/panel/knowledge.js`)).status(), 200);
    assert.equal((await context.request.get(`${base}/extensions/silverbullet/mcp.sh`)).status(), 404);

    // 7. Installing or updating an extension restarts the login authority (D58): the
    // session survives it, and the full-window editor opens without the "unauthorized" page.
    execFileSync('mise', ['exec', '--', 'framework/scripts/pc.sh', 'process', 'restart', 'web-auth'], {cwd:root, stdio:'ignore'});
    let status = 0;
    for (let i = 0; i < 30 && status !== 200; i++) {
      await page.waitForTimeout(1000);
      status = (await context.request.get(`${docs}/.fs/index.md`, {maxRedirects:0})).status();
    }
    assert.equal(status, 200);
    await page.goto(docs);
    await page.locator('.cm-content').filter({hasText:/\S/}).waitFor({timeout:30_000});
    assert.equal(new URL(page.url()).origin, new URL(docs).origin);
    await page.screenshot({path:path.join(folder, 'full-window-editor.png')});
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({navEntry:true, guide:3, embeddedEditor:true, droppedFileVisible:true, bots:count, accessLinkOpensSkill:true, guideFoldPersists:true, english:true, privateSlotsBlocked:true, sessionSurvivesLoginRestart:true, fullWindowEditor:true, pageErrors:0}));
    await context.close();
  } finally {
    fs.rmSync(dropped, {force:true});
    await browser.close();
  }
})().catch(error => { console.error(error.message.slice(0, 400)); process.exitCode = 1; });
