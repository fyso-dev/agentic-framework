// Knowledge page (extensions-contract §9): the SilverBullet editor inside the panel,
// with a short guide on how pages get there. No build step: panel SDK v1 as an ES module.
const sdk = await import(new URL('/assets/extension-sdk.js', location.origin).href);
const {mountExtensionPage, createElement: h, useState, useTranslation, useStore} = sdk;

const EXT = 'silverbullet';
const SKILL = '${FYSO_ROOT}/extensions/silverbullet/skills/project-knowledge/SKILL.md';
const FOLDER = 'project/wiki/';
const GUIDE_KEY = 'fyso.ext.silverbullet.guide';
const stored = () => { try { return localStorage.getItem(GUIDE_KEY); } catch { return null; } };

function Copy({text, code}) {
  const {t} = useTranslation();
  const [done, setDone] = useState(false);
  const copy = () => navigator.clipboard.writeText(text).then(() => {
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }, () => {});
  return h('div', {className: 'kb-copy'},
    h('span', null, code ? h('code', null, text) : text),
    h('button', {type: 'button', className: 'btn btn-sm btn-ghost', onClick: copy}, t(done ? 'kb.copied' : 'kb.copy')));
}

// Navigation happens in the panel that hosts this page (same origin, hash routes).
const panelLink = (hash, className, label, tip) =>
  h('a', {href: `/${hash}`, target: '_parent', className, ...(tip && {title: tip})}, label);

function Bots() {
  const {t} = useTranslation();
  const {rows} = useStore();
  const bots = rows.filter(r => r.state !== 'deleted');
  if (!bots.length) return h('p', null, t('kb.ask.none'));
  return h('ul', {className: 'kb-bots'}, bots.map(({bot, state}) => {
    const on = bot.skillFiles.includes(SKILL);
    let status;
    if (on && state === 'applied') status = h('span', {className: 'pill pill-ok'}, t('kb.ask.on'));
    else if (on) status = panelLink('#/bots/review', 'pill pill-warn', t('kb.ask.pending'), t('kb.ask.review'));
    else status = panelLink(`#/bots/${bot.index}?tab=perfil`, 'btn btn-sm btn-soft', t('kb.ask.give'), t('kb.ask.giveTip'));
    return h('li', {key: bot.index}, h('span', {className: 'name'}, bot.name), status);
  }));
}

function Way({n, title, body, children}) {
  return h('section', {className: 'card kb-way'},
    h('h2', null, h('span', {className: 'kb-num', 'aria-hidden': 'true'}, n), title), h('p', null, body), children);
}

function Page() {
  const {t} = useTranslation();
  const {apps} = useStore();
  const [guide, setGuide] = useState(() => stored() !== '0');
  const toggle = () => {
    try { localStorage.setItem(GUIDE_KEY, guide ? '0' : '1'); } catch { /* storage is optional */ }
    setGuide(!guide);
  };
  const app = apps.data?.find(a => a.id === EXT);
  document.title = t('kb.title');
  return h('main', {className: 'kb'},
    h('header', {className: 'kb-head'},
      h('div', {className: 'grow'}, h('h1', null, t('kb.title')), h('p', null, t('kb.lead'))),
      h('button', {type: 'button', className: 'btn btn-sm btn-soft', 'aria-expanded': guide, onClick: toggle},
        t(guide ? 'kb.guideHide' : 'kb.guideShow')),
      app && h('a', {className: 'btn btn-sm btn-soft', href: app.url, target: '_blank', rel: 'noreferrer'}, `${t('kb.openTab')} ↗`)),
    guide && h('div', {className: 'kb-guide'},
      h(Way, {n: 1, title: t('kb.write.title'), body: t('kb.write.body')}),
      h(Way, {n: 2, title: t('kb.ask.title'), body: t('kb.ask.body')}, h(Bots), h(Copy, {text: t('kb.ask.example')})),
      h(Way, {n: 3, title: t('kb.files.title'), body: t('kb.files.body')}, h(Copy, {text: FOLDER, code: true})),
      h('p', {className: 'kb-note'}, t('kb.note'))),
    app ? h('iframe', {className: 'kb-frame', title: t('kb.frame'), src: app.url})
      : apps.status !== 'loading' && h('p', {className: 'kb-empty', role: 'alert'}, t('kb.unavailable')));
}

const messages = {};
for (const lang of ['es', 'en']) messages[lang] = await (await fetch(`./locales/${lang}.json`)).json();
void mountExtensionPage(Page, messages);
