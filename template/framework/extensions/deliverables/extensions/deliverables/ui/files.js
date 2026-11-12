// The list of delivered files. Data comes from Caddy's own directory listing (JSON),
// on this same origin; names are untrusted text and are only ever set as text.
const params = new URLSearchParams(location.search);
const lang = params.get('lang') === 'en' ? 'en' : 'es';
document.documentElement.lang = lang;
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light';
const resources = await (await fetch(`./locales/${lang}.json`)).json();
await i18next.init({lng: lang, fallbackLng: 'es', resources: {[lang]: {translation: resources}}});
const t = new Proxy({}, {get: (_, key) => i18next.t(key)});
const $ = id => document.getElementById(id);
document.title = t.title;
$('filter').placeholder = t.filter;
$('filter').setAttribute('aria-label', t.filter);
$('refresh').textContent = t.refresh;
$('h-name').textContent = t.name;
$('h-date').textContent = t.date;
$('h-date').className = 'date';
$('h-size').textContent = t.size;
$('h-size').className = 'num';

const when = new Intl.DateTimeFormat(lang, {dateStyle: 'medium', timeStyle: 'short'});
const size = bytes => {
  const units = ['B', 'kB', 'MB', 'GB'];
  let n = bytes, i = 0;
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
  return `${new Intl.NumberFormat(lang, {maximumFractionDigits: i ? 1 : 0}).format(n)} ${units[i]}`;
};
let files = [];

function render() {
  const query = $('filter').value.trim().toLowerCase();
  const shown = files.filter(f => f.name.toLowerCase().includes(query));
  const body = $('list').tBodies[0];
  body.replaceChildren(...shown.map(file => {
    const row = document.createElement('tr');
    const cell = (text, className) => { const td = document.createElement('td'); td.textContent = text; if (className) td.className = className; row.append(td); return td; };
    cell(file.name, 'name');
    cell(when.format(new Date(file.mod_time)), 'date');
    cell(size(file.size), 'num');
    const link = document.createElement('a');
    link.href = `/${encodeURIComponent(file.name)}`;
    link.download = file.name;
    link.textContent = t.download;
    cell('', 'num').append(link);
    return row;
  }));
  $('list').hidden = !shown.length;
  $('state').textContent = !files.length ? t.empty : !shown.length ? t.noMatch : '';
}

async function load() {
  $('state').textContent = t.loading;
  try {
    const response = await fetch('/', {headers: {Accept: 'application/json'}, cache: 'no-store'});
    // 404: nothing was delivered yet, the folder does not exist.
    if (response.status === 404) files = [];
    else if (!response.ok) throw new Error(String(response.status));
    else files = ((await response.json()) || []).filter(f => !f.is_dir).sort((a, b) => new Date(b.mod_time) - new Date(a.mod_time));
    render();
  } catch {
    $('list').hidden = true;
    $('state').textContent = t.error;
  }
}
$('filter').addEventListener('input', render);
$('refresh').addEventListener('click', load);
load();
