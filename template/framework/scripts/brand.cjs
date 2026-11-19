// Project identity (D92): one name, accent and mark for every app the browser shows.
// Defaults: the Fyso mark and violet with the project's name. An optional, project-owned
// project/brand.json overrides them: {"name": "Acme", "accent": "#1d4ed8", "icon": "brand/acme.png"}
// (icon: a PNG under project/). The panel edits it through the fyso-brand workflow (save).
// Each app receives it through its own native setting:
//   Dagu        DAGU_UI_NAVBAR_TITLE (also its tab title)     run-dagu.sh
//   Tinyauth    ui.title, ui.backgroundImage                    web-auth-config.cjs
//   OpenMausBot OMB_BRAND_FILE (applied only with a whitelabel licence)  run-omb.sh
//   favicons    served by Caddy from $FYSO_DATA/brand           Caddyfile (fyso_brand)
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');

const HEX = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_ACCENT = '#6e1fff';

function resolve(env = process.env) {
  const root = env.FYSO_ROOT;
  const brand = {name: env.FYSO_PROJECT_NAME || 'Fyso', accent: DEFAULT_ACCENT, icon: path.join(root, 'framework/brand/fyso-mark.png')};
  const file = path.join(root, 'project/brand.json');
  if (!fs.existsSync(file)) return brand;
  const custom = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (typeof custom.name === 'string' && custom.name.trim()) brand.name = custom.name.trim().slice(0, 40);
  if (custom.accent !== undefined) {
    if (!HEX.test(custom.accent)) throw Error('project/brand.json: accent must be a 6-digit hex colour such as #6e1fff');
    brand.accent = custom.accent.toLowerCase();
  }
  if (custom.icon !== undefined) {
    const icon = path.resolve(root, 'project', String(custom.icon));
    if (!icon.startsWith(path.join(root, 'project') + path.sep) || !icon.endsWith('.png') || !fs.existsSync(icon)) {
      throw Error('project/brand.json: icon must be an existing .png file under project/');
    }
    brand.icon = icon;
  }
  return brand;
}

/** The title an app shows in its tab: "<project> · <app>", or the project alone. */
function title(brand, app) {
  return app ? `${brand.name} · ${app}` : brand.name;
}

// Atomic writes: Caddy and OpenMausBot install the same files while starting in parallel.
function put(file, data) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, data);
  fs.renameSync(temp, file);
}

/** Writes the icons, the login background and OpenMausBot's brand file to $FYSO_DATA/brand. */
function install(env = process.env) {
  const brand = resolve(env), dir = path.join(env.FYSO_DATA, 'brand');
  fs.mkdirSync(dir, {recursive: true});
  const png = fs.readFileSync(brand.icon), uri = `data:image/png;base64,${png.toString('base64')}`;
  put(path.join(dir, 'icon.png'), png);
  // The SVG icon wraps the PNG, so paths that browsers expect as SVG show the same mark.
  put(path.join(dir, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><image width="64" height="64" preserveAspectRatio="xMidYMid meet" href="${uri}"/></svg>\n`);
  const background = fs.readFileSync(path.join(env.FYSO_ROOT, 'framework/brand/login-background.svg'), 'utf8');
  put(path.join(dir, 'login-background.svg'), background.replaceAll(DEFAULT_ACCENT, brand.accent));
  const agents = title(brand, env.FYSO_BRAND_AGENTS_NAME || 'Chat de agentes');
  put(path.join(dir, 'omb.json'), JSON.stringify({name: agents.slice(0, 40), accent: brand.accent, logo: uri, favicon: uri}) + '\n');
  return brand;
}

/** What the panel shows: the icon URL changes with the icon, so browsers refetch it. */
function panel(brand, env = process.env) {
  const custom = brand.icon !== path.join(env.FYSO_ROOT, 'framework/brand/fyso-mark.png');
  const version = crypto.createHash('sha256').update(fs.readFileSync(brand.icon)).digest('hex').slice(0, 10);
  return {name: brand.name, accent: brand.accent, icon: custom ? `/favicon-96x96.png?v=${version}` : null,
    defaults: {name: env.FYSO_PROJECT_NAME || 'Fyso', accent: DEFAULT_ACCENT}};
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ICON_FILE = 'brand/icon.png', MAX_ICON = 256 * 1024;

/**
 * Saves the panel's edit to project/brand.json (and project/brand/icon.png), commits it and
 * installs it. input: {name?, accent?, icon?}; icon is a base64 PNG, or null for the Fyso mark.
 * A name or accent equal to the default is dropped, so the file only holds what differs.
 */
function save(input, env = process.env) {
  const root = env.FYSO_ROOT, file = path.join(root, 'project/brand.json'), iconPath = path.join(root, 'project', ICON_FILE);
  const tracked = ['project/brand.json', `project/${ICON_FILE}`];
  const dirty = execFileSync('git', ['status', '--porcelain', '--', ...tracked], {cwd: root, encoding: 'utf8'});
  if (dirty.trim()) throw Error('commit the existing edits of project/brand.json before changing the identity in the panel');
  // A failed save puts both files back, so the next one does not find uncommitted edits.
  const before = [file, iconPath].map((f) => [f, fs.existsSync(f) ? fs.readFileSync(f) : null]);
  try { return apply(input, env, root, file, iconPath, tracked); }
  catch (error) {
    for (const [f, data] of before) data === null ? fs.rmSync(f, {force: true}) : fs.writeFileSync(f, data);
    throw error;
  }
}

function apply(input, env, root, file, iconPath, tracked) {
  const custom = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (!name || name.length > 40) throw Error('the name must have 1 to 40 characters');
    if (name === (env.FYSO_PROJECT_NAME || 'Fyso')) delete custom.name; else custom.name = name;
  }
  if (input.accent !== undefined) {
    if (!HEX.test(input.accent)) throw Error('the accent must be a 6-digit hex colour such as #6e1fff');
    if (input.accent.toLowerCase() === DEFAULT_ACCENT) delete custom.accent; else custom.accent = input.accent.toLowerCase();
  }
  if (input.icon === null) {
    if (custom.icon === ICON_FILE) fs.rmSync(iconPath, {force: true});
    delete custom.icon;
  } else if (input.icon !== undefined) {
    const png = Buffer.from(String(input.icon), 'base64');
    if (!png.subarray(0, 8).equals(PNG)) throw Error('the icon must be a PNG image');
    if (png.length > MAX_ICON) throw Error('the icon must be under 256 KB');
    fs.mkdirSync(path.dirname(iconPath), {recursive: true});
    fs.writeFileSync(iconPath, png);
    custom.icon = ICON_FILE;
  }
  if (Object.keys(custom).length) fs.writeFileSync(file, JSON.stringify(custom, null, 2) + '\n');
  else fs.rmSync(file, {force: true});
  const brand = resolve(env); // validates what was written before anything is committed
  // git rejects a path that is neither on disk nor committed, such as a never-uploaded icon.
  const known = tracked.filter((file) => fs.existsSync(path.join(root, file)) ||
    execFileSync('git', ['ls-files', '--', file], {cwd: root, encoding: 'utf8'}).trim());
  if (known.length) {
    execFileSync('git', ['add', '-A', '--', ...known], {cwd: root});
    try { execFileSync('git', ['diff', '--cached', '--quiet', '--', ...known], {cwd: root}); }
    catch { execFileSync('git', ['commit', '-qm', 'brand: save the project identity', '--', ...known], {cwd: root}); }
  }
  install(env);
  writePanel(brand, env);
  return panel(brand, env);
}

/** Keeps the panel's project.json in step without regenerating every panel file. */
function writePanel(brand, env = process.env) {
  const file = path.join(env.FYSO_DATA, 'panel/project.json');
  if (!fs.existsSync(file)) return;
  const project = JSON.parse(fs.readFileSync(file, 'utf8'));
  put(file, JSON.stringify({...project, brand: panel(brand, env)}));
}

module.exports = {resolve, title, install, panel, save};

if (require.main === module) {
  const [command, field] = process.argv.slice(2);
  try {
    if (command === 'install') install();
    else if (command === 'title') process.stdout.write(title(resolve(), field));
    else if (command === 'value' && ['name', 'accent'].includes(field)) process.stdout.write(resolve()[field]);
    // The fyso-brand workflow: OP=read|save, SETTINGS_B64 = base64 JSON for save.
    else if (command === 'operate') {
      const op = process.env.OP || 'read';
      if (op === 'save') {
        const input = JSON.parse(Buffer.from(process.env.SETTINGS_B64 || '', 'base64').toString('utf8') || '{}');
        console.log(JSON.stringify(save(input)));
      } else if (op === 'read') console.log(JSON.stringify(panel(resolve())));
      else throw Error('OP must be read or save');
    }
    else throw Error('usage: brand.cjs install | title [app] | value name|accent | operate');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
