// Real generated stack and native login. Uses the repository's existing Playwright.
const {chromium} = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.FYSO_TEST_WEB_PANEL;
if (!base || !process.env.FYSO_TEST_WEB_PASSWORD_FILE) throw Error('Set an isolated panel URL and private test password file');
const password = fs.readFileSync(process.env.FYSO_TEST_WEB_PASSWORD_FILE, 'utf8').trimEnd();
const folder = path.resolve(__dirname, '../artifacts/delivery-evidence/web-auth');
fs.mkdirSync(folder, {recursive:true});
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const context = await browser.newContext({locale:'es-AR', viewport:{width:1360,height:960}});
    const page = await context.newPage(), errors = [], consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push('console error'); });
    page.on('pageerror', error => errors.push(error.name));
    await page.goto(base + '/?lang=es');
    await page.locator('input[name="username"]').waitFor();
    assert.equal(new URL(page.url()).hostname, new URL(base).hostname.replace(/^panel\./, 'auth.'));
    await page.screenshot({path:path.join(folder,'local-login.png')});
    await page.locator('input[name="username"]').fill('admin');
    await page.locator('input[name="password"]').fill(password);
    const loginResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/user/login' && response.request().method() === 'POST');
    await page.locator('button[type="submit"]').click();
    assert.equal((await loginResponse).status(), 200);
    await page.waitForURL(url => url.hostname === new URL(base).hostname);
    await page.getByRole('button', {name:'Cerrar sesión',exact:true}).waitFor();
    await page.locator('.session-menu').getByText('Admin',{exact:true}).waitFor();
    assert.equal(await page.locator('.session-menu').getByText('Admin',{exact:true}).count(),1);
    await page.locator('header.topbar').screenshot({path:path.join(folder,'shared-session-panel.png')});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('header.topbar').screenshot({path:path.join(folder,'shared-session-mobile.png')});
    await page.setViewportSize({width:1360,height:960});
    const cookies = (await context.cookies()).filter(cookie => cookie.name.startsWith('tinyauth-session-'));
    assert.equal(cookies.length,1); assert.equal(cookies[0].httpOnly,true); assert.equal(cookies[0].sameSite,'Lax');
    const other = new URL(base); other.hostname = 'panel.another-project.localhost';
    assert.equal((await context.cookies(other.toString())).filter(cookie => cookie.name.startsWith('tinyauth-session-')).length,0);
    assert.equal(await page.evaluate(() => document.cookie.includes('tinyauth-session-')), false);
    const dagu = base.replace('//panel.', '//dagu.'), omb = base.replace('//panel.','//omb.');
    for (const [url, api] of [[dagu,'/api/v1/dags'],[omb,'/api/bots']]) {
      const response = await context.request.get(url + api);
      assert.equal(response.status(),200);
      if (api.endsWith('/bots')) assert.ok((await response.json()).bots.length > 0);
    }
    const ombPage = await context.newPage();
    ombPage.on('pageerror', error => errors.push(error.name));
    ombPage.on('console', message => { if (message.type() === 'error') consoleErrors.push('console error'); });
    await ombPage.goto(omb);
    await ombPage.getByText('MausBot',{exact:true}).first().waitFor();
    await ombPage.screenshot({path:path.join(folder,'shared-session-omb.png')});
    // Cross-origin writes from a sibling app are rejected despite the shared session.
    const crossOrigin = await context.request.post(dagu + '/api/v1/dags/nonexistent/enqueue', {headers:{Origin:omb}, data:{}});
    assert.equal(crossOrigin.status(),403);
    await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
    await page.waitForURL(url => url.hostname === new URL(base).hostname.replace(/^panel\./,'auth.'));
    await page.locator('input[name="username"]').waitFor();
    await page.screenshot({path:path.join(folder,'signed-out.png')});
    for (const url of [base + '/api/session',dagu + '/api/v1/dags',omb + '/api/bots']) {
      assert.equal((await context.request.get(url,{maxRedirects:0})).status(),401);
      assert.equal((await context.request.get(url,{maxRedirects:0, headers:{Cookie:`${cookies[0].name}=${cookies[0].value}`}})).status(),401);
    }
    assert.deepEqual(errors,[]);
    console.log(`PASS: native local login; real panel/Dagu/OMB; cookie isolation; cross-origin protection; global logout and rejected replay; no page errors. Browser console error entries: ${consoleErrors.length}.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode=1; });
