// Project identity (D92): one name, look and mark for every app the browser shows.
// Defaults: the Fyso mark, violet, the Fyso type and soft corners with the project's name. An
// optional, project-owned project/brand.json overrides any of them:
//   {"name": "Acme", "accent": "#1d4ed8", "icon": "brand/icon.png", "font": "system",
//    "radius": "round", "loginBackground": "brand/login-background.jpg"}
// (icon: a PNG and loginBackground: a JPEG, both under project/). The panel edits it through the
// fyso-brand workflow (save). Each app receives it through its own native setting:
//   Dagu        DAGU_UI_NAVBAR_TITLE (also its tab title)     run-dagu.sh
//   Tinyauth    ui.title, ui.backgroundImage                    web-auth-config.cjs
//   OpenMausBot OMB_BRAND_FILE (applied only with a whitelabel licence)  run-omb.sh
//   favicons and the login background, served by Caddy from $FYSO_DATA/brand (fyso_brand)
//   the panel   project.json `brand` (accent, font and radius become its design tokens)
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');

const HEX = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_ACCENT = '#6e1fff';
const FONTS = ['fyso', 'system', 'humanist', 'classic', 'rounded'];
const RADII = ['sharp', 'soft', 'round'];
const DEFAULTS = {accent: DEFAULT_ACCENT, font: 'fyso', radius: 'soft'};
const FILES = {icon: 'brand/icon.png', loginBackground: 'brand/login-background.jpg'};

/** A file named in brand.json: it must exist under project/ with the expected extension. */
function projectFile(root, value, ext, key) {
  const file = path.resolve(root, 'project', String(value));
  if (!file.startsWith(path.join(root, 'project') + path.sep) || !file.endsWith(ext) || !fs.existsSync(file)) {
    throw Error(`project/brand.json: ${key} must be an existing ${ext} file under project/`);
  }
  return file;
}

function resolve(env = process.env) {
  const root = env.FYSO_ROOT;
  const brand = {name: env.FYSO_PROJECT_NAME || 'Fyso', ...DEFAULTS,
    icon: path.join(root, 'framework/brand/fyso-mark.png'), loginBackground: null};
  const file = path.join(root, 'project/brand.json');
  if (!fs.existsSync(file)) return brand;
  const custom = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (typeof custom.name === 'string' && custom.name.trim()) brand.name = custom.name.trim().slice(0, 40);
  if (custom.accent !== undefined) {
    if (!HEX.test(custom.accent)) throw Error('project/brand.json: accent must be a 6-digit hex colour such as #6e1fff');
    brand.accent = custom.accent.toLowerCase();
  }
  if (custom.font !== undefined) {
    if (!FONTS.includes(custom.font)) throw Error(`project/brand.json: font must be one of ${FONTS.join(', ')}`);
    brand.font = custom.font;
  }
  if (custom.radius !== undefined) {
    if (!RADII.includes(custom.radius)) throw Error(`project/brand.json: radius must be one of ${RADII.join(', ')}`);
    brand.radius = custom.radius;
  }
  if (custom.icon !== undefined) brand.icon = projectFile(root, custom.icon, '.png', 'icon');
  if (custom.loginBackground !== undefined) brand.loginBackground = projectFile(root, custom.loginBackground, '.jpg', 'loginBackground');
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
  // Caddy serves the photo when there is one, the drawn background otherwise (try_files).
  if (brand.loginBackground) put(path.join(dir, 'login-background.jpg'), fs.readFileSync(brand.loginBackground));
  else fs.rmSync(path.join(dir, 'login-background.jpg'), {force: true});
  const agents = title(brand, env.FYSO_BRAND_AGENTS_NAME || 'Chat de agentes');
  put(path.join(dir, 'omb.json'), JSON.stringify({name: agents.slice(0, 40), accent: brand.accent, logo: uri, favicon: uri}) + '\n');
  return brand;
}

const version = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10);

/** What the panel shows: file URLs change with their content, so browsers refetch them. */
function panel(brand, env = process.env) {
  const custom = brand.icon !== path.join(env.FYSO_ROOT, 'framework/brand/fyso-mark.png');
  return {name: brand.name, accent: brand.accent, font: brand.font, radius: brand.radius,
    icon: custom ? `/favicon-96x96.png?v=${version(brand.icon)}` : null,
    loginBackground: brand.loginBackground ? `/fyso-brand/login-background?v=${version(brand.loginBackground)}` : null,
    defaults: {name: env.FYSO_PROJECT_NAME || 'Fyso', ...DEFAULTS}};
}

// Images arrive base64 in a workflow parameter, which Linux caps at 128 KB per value: the
// panel compresses them below these limits.
const IMAGES = {
  icon: {magic: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), max: 90 * 1024, kind: 'PNG'},
  loginBackground: {magic: Buffer.from([0xff, 0xd8, 0xff]), max: 90 * 1024, kind: 'JPEG'},
};

/**
 * Saves the panel's edit to project/brand.json (and the images under project/brand/), commits it
 * and installs it. input: {name?, accent?, font?, radius?, icon?, loginBackground?}; images are
 * base64 (PNG icon, JPEG background), or null to go back to the default.
 * A value equal to the default is dropped, so the file only holds what differs.
 */
function save(input, env = process.env) {
  const root = env.FYSO_ROOT, file = path.join(root, 'project/brand.json');
  const tracked = ['project/brand.json', ...Object.values(FILES).map((f) => `project/${f}`)];
  const dirty = execFileSync('git', ['status', '--porcelain', '--', ...tracked], {cwd: root, encoding: 'utf8'});
  if (dirty.trim()) throw Error('commit the existing edits of project/brand.json before changing the identity in the panel');
  // A failed save puts every file back, so the next one does not find uncommitted edits.
  const before = tracked.map((f) => path.join(root, f)).map((f) => [f, fs.existsSync(f) ? fs.readFileSync(f) : null]);
  try { return apply(input, env, root, file, tracked); }
  catch (error) {
    for (const [f, data] of before) data === null ? fs.rmSync(f, {force: true}) : fs.writeFileSync(f, data);
    throw error;
  }
}

function apply(input, env, root, file, tracked) {
  const custom = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const choose = (key, value, fallback) => { if (value === fallback) delete custom[key]; else custom[key] = value; };
  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (!name || name.length > 40) throw Error('the name must have 1 to 40 characters');
    choose('name', name, env.FYSO_PROJECT_NAME || 'Fyso');
  }
  if (input.accent !== undefined) {
    if (!HEX.test(input.accent)) throw Error('the accent must be a 6-digit hex colour such as #6e1fff');
    choose('accent', input.accent.toLowerCase(), DEFAULT_ACCENT);
  }
  if (input.font !== undefined) {
    if (!FONTS.includes(input.font)) throw Error(`the font must be one of ${FONTS.join(', ')}`);
    choose('font', input.font, DEFAULTS.font);
  }
  if (input.radius !== undefined) {
    if (!RADII.includes(input.radius)) throw Error(`the corners must be one of ${RADII.join(', ')}`);
    choose('radius', input.radius, DEFAULTS.radius);
  }
  for (const [key, rule] of Object.entries(IMAGES)) {
    const target = path.join(root, 'project', FILES[key]);
    if (input[key] === null) {
      if (custom[key] === FILES[key]) fs.rmSync(target, {force: true});
      delete custom[key];
    } else if (input[key] !== undefined) {
      const data = Buffer.from(String(input[key]), 'base64');
      if (!data.subarray(0, rule.magic.length).equals(rule.magic)) throw Error(`the ${key} must be a ${rule.kind} image`);
      if (data.length > rule.max) throw Error(`the ${key} must be under ${rule.max / 1024} KB`);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.writeFileSync(target, data);
      custom[key] = FILES[key];
    }
  }
  if (Object.keys(custom).length) fs.writeFileSync(file, JSON.stringify(custom, null, 2) + '\n');
  else fs.rmSync(file, {force: true});
  const brand = resolve(env); // validates what was written before anything is committed
  // git rejects a path that is neither on disk nor committed, such as a never-uploaded icon.
  const known = tracked.filter((f) => fs.existsSync(path.join(root, f)) ||
    execFileSync('git', ['ls-files', '--', f], {cwd: root, encoding: 'utf8'}).trim());
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

module.exports = {resolve, title, install, panel, save, FONTS, RADII};

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
