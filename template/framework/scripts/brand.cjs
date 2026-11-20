// Project identity (D92): one name, accent and mark for every app the browser shows.
// Defaults: the Fyso mark and violet with the project's name. An optional, project-owned
// project/brand.json overrides them: {"name": "Acme", "accent": "#1d4ed8", "icon": "brand/acme.png"}
// (icon: a PNG under project/). Each app receives it through its own native setting:
//   Dagu        DAGU_UI_NAVBAR_TITLE (also its tab title)     run-dagu.sh
//   Tinyauth    ui.title, ui.backgroundImage                    web-auth-config.cjs
//   OpenMausBot OMB_BRAND_FILE (applied only with a whitelabel licence)  run-omb.sh
//   favicons    served by Caddy from $FYSO_DATA/brand           Caddyfile (fyso_brand)
const fs = require('node:fs'), path = require('node:path');

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
  const agents = title(brand, env.FYSO_BRAND_AGENTS_NAME || 'Agentes');
  put(path.join(dir, 'omb.json'), JSON.stringify({name: agents.slice(0, 40), accent: brand.accent, logo: uri, favicon: uri}) + '\n');
  return brand;
}

module.exports = {resolve, title, install};

if (require.main === module) {
  const [command, field, app] = process.argv.slice(2);
  try {
    if (command === 'install') install();
    else if (command === 'title') process.stdout.write(title(resolve(), field));
    else if (command === 'value' && ['name', 'accent'].includes(field)) process.stdout.write(resolve()[field]);
    else throw Error('usage: brand.cjs install | title [app] | value name|accent');
    void app;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
