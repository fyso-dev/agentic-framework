// Live acceptance of the AI import of the SilverBullet extension (D56) against a generated,
// running, throwaway project with the extension installed and its engine logged in.
// It runs one real agent turn and leaves the imported pages in that project's wiki.
//   FYSO_TEST_WEB_PANEL=http://panel.<slug>-<port>.localhost:<port>
//   FYSO_TEST_WEB_PASSWORD_FILE=<file with the admin password>
//   FYSO_TEST_PROJECT_ROOT=<generated project>
const {chromium} = require('playwright');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {randomBytes} = require('node:crypto');
const base = process.env.FYSO_TEST_WEB_PANEL, root = process.env.FYSO_TEST_PROJECT_ROOT;
if (!base || !root || !process.env.FYSO_TEST_WEB_PASSWORD_FILE) throw Error('Set an isolated panel URL, its project root and a private test password file');
const password = fs.readFileSync(process.env.FYSO_TEST_WEB_PASSWORD_FILE, 'utf8').trimEnd();
const folder = path.resolve(__dirname, '../artifacts/delivery-evidence/silverbullet');
const wiki = path.join(root, 'project/wiki'), data = path.join(root, '.data/ext/silverbullet');
const pagesOf = dir => fs.readdirSync(dir, {recursive: true}).filter(file => file.endsWith('.md')).sort();

// Synthetic documents of a fictional company: a folder (text, Markdown, Word) and a zip.
const docs = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-import-'));
const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(docs, file)), {recursive: true}); fs.writeFileSync(path.join(docs, file), text); };
write('acme/despliegue.txt', 'NOTAS DE DESPLIEGUE (sintetico, Acme Riego)\n\n1. Abrir un PR contra main y esperar la revision de una persona.\n2. El despliegue a produccion se hace los martes y jueves a las 10:00.\n3. Si falla el chequeo de salud, se vuelve atras con "acme rollback".\n\nNo se despliega del 20 de diciembre al 5 de enero.\n');
write('acme/decisiones/base-de-datos.md', '# Decisión: base de datos (marzo 2026)\n\nSintético. Elegimos **PostgreSQL 17** porque necesitamos PostGIS para las parcelas. Se descartó MySQL.\nRespaldos diarios a las 03:00, retenidos 30 días.\n');
write('acme/decisiones/alojamiento.md', '# Decisión: alojamiento (mayo 2026)\n\nSintético. Un único servidor dedicado en São Paulo: 38 ms hacia los sensores contra 140 ms desde Virginia.\n');
write('bienvenida.md', '# Bienvenida a Acme Riego (sintético)\n\n## Primer día\n\n- Pedir acceso al canal #operaciones.\n- Instalar las herramientas con `mise install`.\n\n## Horarios\n\nLa reunión semanal es los lunes a las 9:30.\n');
write('politicas/vacaciones.md', '# Política de vacaciones (sintética)\n\nCada persona tiene 21 días hábiles por año. Se piden con 15 días de anticipación.\n');
write('politicas/gastos.md', '# Política de gastos (sintética)\n\nHasta 100 USD no requieren aprobación. Más de 1000 USD aprueba la dirección.\n');
execFileSync('mise', ['exec', '--', 'pandoc', path.join(docs, 'bienvenida.md'), '-o', path.join(docs, 'acme/bienvenida.docx')], {cwd: root});
execFileSync('python3', ['-m', 'zipfile', '-c', path.join(docs, 'politicas.zip'), 'vacaciones.md', 'gastos.md'], {cwd: path.join(docs, 'politicas')});
// A credential-shaped value, made at run time so that no such string is ever committed.
const token = 'ghp_' + randomBytes(27).toString('base64').replace(/[^A-Za-z0-9]/g, 'x').slice(0, 36);
write('claves.md', `# Accesos\n\nToken del repositorio: ${token}\n`);

fs.mkdirSync(folder, {recursive: true});
(async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const context = await browser.newContext({locale: 'es-AR', viewport: {width: 1440, height: 800}});
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message.slice(0, 120)));
    await page.goto(base + '/?lang=es');
    await page.locator('input[name="username"]').fill(process.env.FYSO_ADMIN_USER || 'admin');
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.getByRole('navigation').getByRole('link', {name: 'Conocimiento', exact: true}).first().click();
    const kb = page.frameLocator('iframe[title="Conocimiento"]');
    const before = pagesOf(wiki);

    // 1. "Trae lo que ya tienes" opens the import: a picker for folders, zips and files.
    await kb.getByRole('button', {name: 'Importar con IA', exact: true}).click();
    const picker = kb.frameLocator('iframe[title="Selector de archivos para importar"]');
    const convert = kb.getByRole('button', {name: 'Convertir en páginas'});
    await picker.locator('.uppy-Dashboard-AddFiles').waitFor();
    assert.ok(await convert.isDisabled(), 'nothing to convert before an upload');
    await page.screenshot({path: path.join(folder, 'import-picker.png')});

    // 2. A whole folder and a zip upload (resumable, tus); hidden files are left out.
    write('acme/.DS_Store', 'noise');
    await picker.locator('input[type="file"][webkitdirectory]').setInputFiles(path.join(docs, 'acme'));
    await kb.getByText('4 archivos subidos').waitFor({timeout: 60_000});
    await picker.locator('.uppy-DashboardContent-addMore').click();
    await picker.locator('input[type="file"]:not([webkitdirectory])').first().setInputFiles(path.join(docs, 'politicas.zip'));
    await kb.getByText('5 archivos subidos').waitFor({timeout: 60_000});
    assert.equal(fs.readdirSync(path.join(data, 'uploads')).filter(name => name.endsWith('.info')).length, 5);
    await page.screenshot({path: path.join(folder, 'import-uploaded.png')});

    // 3. The person starts the agent. It writes pages; the workflow publishes them.
    await convert.click();
    await kb.getByText('Escribiendo páginas…').waitFor();
    await page.screenshot({path: path.join(folder, 'import-running.png')});
    await kb.getByRole('button', {name: 'Ver el informe'}).waitFor({timeout: 30 * 60_000});
    const created = pagesOf(wiki).filter(file => !before.includes(file));
    const reports = created.filter(file => file.startsWith('Importaciones/'));
    const written = created.filter(file => !file.startsWith('Importaciones'));
    assert.equal(reports.length, 1, 'one report page');
    assert.ok(written.length >= 3, `pages by topic, got ${written.length}`);
    const text = written.map(file => fs.readFileSync(path.join(wiki, file), 'utf8')).join('\n');
    for (const fact of ['PostGIS', '21 días', 'acme rollback', '9:30']) assert.ok(text.includes(fact), `the pages keep the fact "${fact}"`);
    const report = fs.readFileSync(path.join(wiki, reports[0]), 'utf8');
    for (const file of written) assert.ok(report.includes(`[[${file.slice(0, -3)}]]`), `the report links ${file}`);
    assert.match(fs.readFileSync(path.join(wiki, 'index.md'), 'utf8'), /\[\[Importaciones\]\]/);
    // Nothing of the upload is left behind.
    assert.deepEqual(fs.readdirSync(path.join(data, 'uploads')), []);
    assert.deepEqual(fs.readdirSync(path.join(data, 'import')), []);

    // 4. The editor opens on the report, inside the panel.
    const editor = kb.frameLocator('iframe[title="Editor de conocimiento"]');
    await editor.locator('.cm-content').filter({hasText: 'Páginas nuevas'}).waitFor({timeout: 30_000});
    await page.screenshot({path: path.join(folder, 'import-report.png')});
    // "Ver el informe" always brings the report back: after moving elsewhere in the editor,
    // after a reload of the panel, and with the editor scrolled out of view.
    await page.reload();
    await kb.getByRole('button', {name: 'Importar con IA', exact: true}).click();
    await editor.locator('.cm-content').filter({hasText: /\S/}).waitFor({timeout: 30_000});
    assert.equal(await editor.locator('.cm-content').filter({hasText: 'Páginas nuevas'}).count(), 0, 'the editor is on the home page');
    await kb.getByRole('button', {name: 'Ver el informe'}).click();
    await editor.locator('.cm-content').filter({hasText: 'Páginas nuevas'}).waitFor({timeout: 30_000});
    await page.waitForTimeout(800);
    const box = await kb.locator('iframe[title="Editor de conocimiento"]').boundingBox();
    assert.ok(box.y < 400 && box.height >= 400, `the editor is in view (y ${Math.round(box.y)}, height ${Math.round(box.height)})`);
    await page.screenshot({path: path.join(folder, 'import-report-link.png')});

    // 5. A document with a credential stops the import before the agent sees it.
    const pagesBefore = pagesOf(wiki);
    await picker.locator('.uppy-Dashboard-AddFiles').waitFor();
    await picker.locator('input[type="file"]:not([webkitdirectory])').first().setInputFiles(path.join(docs, 'claves.md'));
    await kb.getByText('1 archivo subido').waitFor({timeout: 60_000});
    await convert.click();
    await kb.getByRole('alert').filter({hasText: /credentials/}).waitFor({timeout: 5 * 60_000});
    await page.screenshot({path: path.join(folder, 'import-refused.png')});
    assert.deepEqual(pagesOf(wiki), pagesBefore, 'a refused import writes nothing');
    assert.ok(!fs.existsSync(path.join(data, 'import')) || !fs.readdirSync(path.join(data, 'import'), {recursive: true}).some(file => String(file).endsWith('claves.md')),
      'the refused document is not kept');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({picker: true, folderAndZipUploaded: 5, pagesWritten: written.length, factsKept: 4, reportLinksPages: true,
      homeLinksImports: true, uploadsCleared: true, editorShowsReport: true, credentialRefused: true, pageErrors: 0}));
    await context.close();
  } finally {
    fs.rmSync(docs, {recursive: true, force: true});
    await browser.close();
  }
})().catch(error => { console.error(error.message.slice(0, 600)); process.exitCode = 1; });
