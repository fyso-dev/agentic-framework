#!/usr/bin/env node
// Deliverables: copy a finished file into the folder the gateway serves behind the web
// login (Caddy file_server), and return its link. Small glue, no server of its own:
//   deliver.cjs put <file> [--name <name>]   -> {"name","url","bytes"}
//   deliver.cjs list                          -> [{"name","url","bytes","modified"}]
//   deliver.cjs mcp                           -> the same two operations as MCP tools (stdio)
// Run through framework/scripts/run-ext.sh, which provides FYSO_* from the project.
const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 100 * 1024 * 1024;
const VERSION = '0.1.0';
// Never handed out, wherever they are: login users, snapshots, keys and anything that
// looks like a credential. Hidden paths are refused too, except extensions' runtime data.
const DENIED = [/^project\/auth(\/|$)/, /^state(\/|$)/, /\.enc\./, /\.(key|pem|age|p12|pfx)$/i,
  /(^|\/)[^/]*(secret|credential|token|password)[^/]*(\/|$)/i, /(^|\/)auth(\/|$)/i, /(^|\/)node_modules(\/|$)/];
const HIDDEN = /(^|\/)\./;
const ALLOWED_HIDDEN = /^\.data\/ext\/[a-z][a-z0-9-]{1,30}\//;

function context(env = process.env) {
  if (!env.FYSO_ROOT || !env.FYSO_DATA) throw new Error('missing project environment: run through framework/scripts/run-ext.sh deliverables');
  const root = fs.realpathSync(env.FYSO_ROOT);
  return {root, dir: path.join(env.FYSO_DATA, 'ext', 'deliverables', 'files'), env};
}

function origin(env) {
  // The framework's own rule for public addresses (D62).
  const web = require(path.join(fs.realpathSync(env.FYSO_ROOT), 'framework', 'scripts', 'web-origin.cjs'));
  if (!env.FYSO_WEB_DOMAIN || !env.FYSO_HTTP_PORT) throw new Error('missing FYSO_WEB_DOMAIN or FYSO_HTTP_PORT');
  return web.origin('files', env);
}
const link = (name, env) => `${origin(env)}/${encodeURIComponent(name)}`;

function source(file, ctx) {
  if (typeof file !== 'string' || !file.trim()) throw new Error('path is required');
  let real;
  try { real = fs.realpathSync(path.resolve(ctx.root, file)); } catch { throw new Error(`file not found: ${file}`); }
  const rel = path.relative(ctx.root, real).split(path.sep).join('/');
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('only files inside the project can be delivered');
  const hidden = HIDDEN.test(rel) && !(ALLOWED_HIDDEN.test(rel) && !HIDDEN.test(rel.replace(ALLOWED_HIDDEN, '')));
  if (hidden || DENIED.some(rule => rule.test(rel))) throw new Error(`this file cannot be delivered: ${rel}`);
  const stat = fs.statSync(real);
  if (!stat.isFile()) throw new Error(`not a file: ${rel}`);
  if (stat.size > MAX_BYTES) throw new Error(`file is larger than ${MAX_BYTES / 1024 / 1024} MB`);
  return {real, rel, bytes: stat.size};
}

// A plain file name a person recognizes: no folders, control characters or leading dot.
function cleanName(wanted, fallback) {
  let name = String(wanted || fallback).normalize('NFC').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+/, '').trim();
  const ext = path.extname(fallback);
  if (ext && path.extname(name).toLowerCase() !== ext.toLowerCase()) name += ext;
  if (!path.basename(name, path.extname(name)).trim()) throw new Error('name is empty');
  if (name.length > 120) name = name.slice(0, 120 - path.extname(name).length).trim() + path.extname(name);
  return name;
}

function put(file, wanted, env = process.env) {
  const ctx = context(env), from = source(file, ctx);
  const name = cleanName(wanted, path.basename(from.real));
  fs.mkdirSync(ctx.dir, {recursive: true});
  const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
  for (let n = 1; n <= 500; n++) {
    const candidate = n === 1 ? name : `${stem} (${n})${ext}`;
    try {
      // Never replaces an earlier delivery: a link someone already has keeps its file.
      fs.copyFileSync(from.real, path.join(ctx.dir, candidate), fs.constants.COPYFILE_EXCL);
      return {name: candidate, url: link(candidate, env), bytes: from.bytes, source: from.rel};
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  throw new Error(`too many files named ${name}`);
}

function list(env = process.env) {
  const ctx = context(env);
  let names = [];
  try { names = fs.readdirSync(ctx.dir); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return names.filter(name => !name.startsWith('.')).flatMap(name => {
    const stat = fs.statSync(path.join(ctx.dir, name));
    return stat.isFile() ? [{name, url: link(name, env), bytes: stat.size, modified: stat.mtime.toISOString()}] : [];
  }).sort((a, b) => b.modified.localeCompare(a.modified));
}

const TOOLS = {
  deliver: {
    description: 'Hand a finished file to the person: copies it to the project\'s Deliverables page (panel, behind the web login) and returns its download link. Give the link to the person. Never replaces an earlier file; a taken name gets a number.',
    inputSchema: {type: 'object', additionalProperties: false, required: ['path'], properties: {
      path: {type: 'string', description: 'The file, relative to the project root, for example .data/ext/office-docs/out/Propuesta.docx'},
      name: {type: 'string', description: 'Optional name the person will see, for example "Propuesta Acme.docx"'}}},
    run: args => put(args.path, args.name),
  },
  deliveries: {
    description: 'List the files on the Deliverables page, newest first, with their download links.',
    inputSchema: {type: 'object', additionalProperties: false, properties: {}},
    annotations: {readOnlyHint: true},
    run: () => ({files: list()}),
  },
};
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

function callTool(tool, args) {
  try {
    for (const [key, value] of Object.entries(args)) {
      if (!tool.inputSchema.properties[key]) throw new Error(`unknown argument: ${key}`);
      if (typeof value !== 'string') throw new Error(`${key} must be a string`);
    }
    const result = tool.run(args);
    return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}], structuredContent: result};
  } catch (error) { return {isError: true, content: [{type: 'text', text: error.message}]}; }
}

function handle({id, method, params = {}}) {
  switch (method) {
    case 'initialize':
      return {protocolVersion: PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0],
        capabilities: {tools: {listChanged: false}}, serverInfo: {name: 'deliverables', version: VERSION},
        instructions: 'Use deliver to hand a finished file to the person as a download link. Only files inside the project; never secrets.'};
    case 'ping': return {};
    case 'tools/list':
      return {tools: Object.entries(TOOLS).map(([name, t]) => ({name, description: t.description, inputSchema: t.inputSchema, ...(t.annotations && {annotations: t.annotations})}))};
    case 'tools/call': {
      const tool = TOOLS[params.name];
      if (!tool) throw Object.assign(new Error(`unknown tool: ${params.name}`), {code: -32602});
      return callTool(tool, params.arguments || {});
    }
    default:
      if (id === undefined) return undefined;
      throw Object.assign(new Error(`method not found: ${method}`), {code: -32601});
  }
}

function serve() {
  const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buffer += chunk;
    for (let i; (i = buffer.indexOf('\n')) >= 0;) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { send({jsonrpc: '2.0', id: null, error: {code: -32700, message: 'parse error'}}); continue; }
      try {
        const result = handle(msg);
        if (msg.id !== undefined && result !== undefined) send({jsonrpc: '2.0', id: msg.id, result});
      } catch (error) {
        if (msg.id !== undefined) send({jsonrpc: '2.0', id: msg.id, error: {code: error.code || -32603, message: error.message}});
      }
    }
  });
  process.stdin.on('end', () => process.exit(0));
}

module.exports = {put, list, cleanName, MAX_BYTES};
if (require.main === module) {
  const [action, ...rest] = process.argv.slice(2);
  try {
    if (action === 'mcp') serve();
    else if (action === 'list') console.log(JSON.stringify(list(), null, 2));
    else if (action === 'put') {
      const at = rest.indexOf('--name');
      const name = at >= 0 ? rest.splice(at, 2)[1] : undefined;
      if (rest.length !== 1) throw new Error('Usage: deliver.cjs put <file> [--name <name>]');
      console.log(JSON.stringify(put(rest[0], name)));
    } else throw new Error('Usage: deliver.cjs <put <file> [--name <name>] | list | mcp>');
  } catch (error) { console.error(`error: ${error.message}`); process.exitCode = 1; }
}
