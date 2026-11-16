// The macOS installer's own-password policy and form JSON (installer/macos/fyso-installer.sh).
// Runs the script's functions with bash 3.2-compatible syntax, without opening any window.
const test = require('node:test');
const assert = require('node:assert');
const {execFileSync} = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'installer/macos/fyso-installer.sh');
// Load only the helper functions (js, norm, password_problem, dagu_timings) and the Spanish copy.
const prelude = `
  . "${root}/installer/macos/locales/es.sh"
  eval "$(sed -n -e '/^js() {/p' -e '/^norm() {/p' -e '/^password_problem() {/,/^}/p' -e '/^dagu_timings() {/,/^}/p' "${script}")"
`;
const bash = (body, ...args) => execFileSync('/bin/bash', ['-c', prelude + body, 'test', ...args], {encoding: 'utf8'});
const problem = (password, user = 'admin', project = 'Mi proyecto') =>
  bash('password_problem "$1" "$2" "$3"', password, user, project);

test('accepts passwords the person chose, without symbol rules', () => {
  for (const ok of ['mi perro come manzanas', 'Tortuga-azul-2026', 'Hola mundo, adiós', 'correcthorsebatterystaple', 'Ñandú del monte 7', 'mi "casa", ojo = 9!', '!@#$%^&*()_+', 'tortuga123456'])
    assert.strictEqual(problem(ok), '', ok);
});

test('refuses short, long, repetitive and digit-only passwords', () => {
  const es = bash('printf "%s|%s|%s|%s" "$PW_SHORT" "$PW_LONG" "$PW_REPEATED" "$PW_DIGITS"').split('|');
  assert.strictEqual(problem('corta123'), es[0]);
  assert.strictEqual(problem('x'.repeat(40) + 'y'.repeat(33)), es[1]);
  assert.strictEqual(problem('aaaaaaaaaaaaaaa'), es[2]);
  assert.strictEqual(problem('121212121212'), es[2]);
  assert.strictEqual(problem('839201746551'), es[3]);
});

test('refuses sequences, common words and the user or project name', () => {
  const [seq, common, personal] = bash('printf "%s|%s|%s" "$PW_SEQUENCE" "$PW_COMMON" "$PW_PERSONAL"').split('|');
  assert.strictEqual(problem('abcdefghijklm'), seq);
  assert.strictEqual(problem('qwertyuiopas'), seq);
  for (const bad of ['qwertyuiop12', '1234567890ab', 'abcdefghij2026']) assert.strictEqual(problem(bad), seq, bad);
  for (const bad of ['Password2026!', 'P@ssw0rd2026', 'adminadmin123', 'Contraseña2026', 'bienvenido123', 'iloveyou2026!'])
    assert.strictEqual(problem(bad), common, bad);
  assert.strictEqual(problem('mariana-2026-casa', 'mariana'), personal);
  assert.strictEqual(problem('MiProyecto#2026x', 'admin', 'Mi proyecto'), personal);
});

test('form values are valid JSON strings, whatever the person typed', () => {
  for (const value of ['Mi proyecto', 'Editor, "quoted" = x', 'back\\slash', 'name', 'Ñandú'])
    assert.strictEqual(JSON.parse(bash('js "$1"', value)), value);
});

test('step timings come from the Dagu run status, skipping steps that never ran', () => {
  const fs = require('node:fs'), os = require('node:os');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fyso-timings-'));
  const dir = path.join(home, 'data/dag-runs/fyso-install/dag-runs/2026/11/12/dag-run_20261112_171016Z_install-1/a_1');
  fs.mkdirSync(dir, {recursive: true});
  const nodes = [
    {step: {id: 'generate'}, startedAt: '2026-11-12T14:10:16-03:00', finishedAt: '2026-11-12T14:10:28-03:00'},
    {step: {id: 'start'}, startedAt: '-', finishedAt: '-'},
  ];
  fs.writeFileSync(path.join(dir, 'status.jsonl'), JSON.stringify({nodes}) + '\n');
  const out = bash('DAGU_HOME="$1" RUN=install-1 dagu_timings', home);
  fs.rmSync(home, {recursive: true, force: true});
  assert.strictEqual(out.trim(), 'timing: workflow/generate 12s');
});
