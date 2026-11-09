// The platform's own MCP server (D33): typed tools for what the panel does, so an agent
// can inspect and configure this project. Every change goes through the same Dagu
// workflows as the panel; nothing here edits project files directly.
// Transport: MCP stdio (newline-delimited JSON-RPC 2.0). No dependencies.
// Started by the project's .mcp.json: `mise exec -- node framework/scripts/fyso-mcp.cjs`.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const VERSION = '1';
const context = () => fs.readFileSync(path.join(ROOT, 'framework/agent-context.md'), 'utf8');
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
process.chdir(ROOT);

const dagu = () => require('./dagu-client.cjs').client();
const b64 = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
const readJson = file => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
const health = name => { try { execFileSync('framework/scripts/health.sh', [name], {stdio: 'ignore', timeout: 8000}); return 'ok'; } catch { return 'down'; } };
const architect = async params => (await dagu().run('fyso-bot-architect', params, {output: 'RESULT', timeoutMs: 180000})).output;

const str = (description, extra = {}) => ({type: 'string', description, ...extra});
const obj = (properties = {}, required = []) => ({type: 'object', properties, required, additionalProperties: false});

// name → {description, inputSchema, annotations, run(args)}
const TOOLS = {
  fyso_context: {
    description: 'Read the local Fyso operating guide: architecture, ownership, isolation, bot/workflow/code/extension procedures, verification and tool limitations. Available even when the stack is down; read before planning work.',
    inputSchema: obj(),
    annotations: {readOnlyHint: true},
    run: () => ({guide: context()}),
  },
  fyso_status: {
    description: 'Project overview: name and URLs, health of Dagu/OpenMausBot/gateway, apps, installed extensions (with which declared secrets are set, never their values) and how bots are versioned in git. Read-only; start here.',
    inputSchema: obj(),
    annotations: {readOnlyHint: true},
    async run() {
      execFileSync('node', ['framework/scripts/panel-data.cjs', 'config'], {stdio: 'ignore', timeout: 30000});
      const panel = f => readJson(path.join(process.env.FYSO_DATA || '.data', 'panel', f));
      return {project: panel('project.json'), services: {dagu: health('dagu'), omb: health('omb'), gateway: health('caddy')},
        apps: panel('apps.json'), extensions: panel('extensions.json'), botVersioning: panel('bot-versioning.json')};
    },
  },
  fyso_check: {
    description: 'Run the setup checklist (engines logged in, bots applied, Dagu reachable) and return the result. Same as the panel\'s "Puesta a punto".',
    inputSchema: obj(),
    annotations: {readOnlyHint: true},
    run: async () => (await dagu().run('fyso-setup-check', {}, {output: 'CHECK'})).output,
  },
  fyso_doctor: {
    description: 'Run the project health checks (mise run doctor) and return their text output and whether all passed.',
    inputSchema: obj(),
    annotations: {readOnlyHint: true},
    run() {
      try { return {ok: true, output: execFileSync('framework/scripts/doctor.sh', [], {encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe']})}; }
      catch (e) { return {ok: false, output: `${e.stdout || ''}${e.stderr || ''}`}; }
    },
  },
  fyso_connections: {
    description: 'List this project native OpenMausBot and declared MCP connections, without credentials or endpoints. Shows enabled state and whether definitions are in project files; does not test tools. Connect/authenticate services in this project OpenMausBot Apps UI, then assign tools through fyso_bot_plan.',
    inputSchema: obj(),
    annotations: {readOnlyHint: true},
    run: () => architect({OP: 'connections'}),
  },
  fyso_bots_list: {
    description: 'List the native OpenMausBot bots of this project (id, name, title, model, busy).',
    inputSchema: obj(),
    annotations: {readOnlyHint: true},
    run: () => architect({OP: 'list'}),
  },
  fyso_bot_read: {
    description: 'Read one bot\'s native profile by its exact id (from fyso_bots_list), plus the revision a later plan is based on.',
    inputSchema: obj({bot_id: str('Exact native bot id')}, ['bot_id']),
    annotations: {readOnlyHint: true},
    run: ({bot_id}) => architect({OP: 'read', BOT_ID: bot_id}),
  },
  fyso_bot_plan: {
    description: 'Preview creating, updating or deleting one bot. Changes nothing: returns a planId and a preview. Inspect the preview before applying. An explicit create/update/delete request authorizes its matching plan; exploratory requests authorize preview only. Supported profile fields: name, title, description, model (native "<engine>/<model>"), soul (inline instructions), approval, computer ("off"), tools (native allow/deny selectors; discover servers with fyso_connections). Delete needs the exact bot_id.',
    inputSchema: obj({
      action: str('What to do', {enum: ['create', 'update', 'delete']}),
      bot_id: str('Exact native bot id; required for update and delete'),
      bot: {type: 'object', description: 'Native bot entry for create/update, e.g. {"name":"Support","title":"Answers customers","model":"claude/claude-sonnet-5","soul":"…"}'},
    }, ['action']),
    annotations: {readOnlyHint: true},
    run: ({action, bot_id = '', bot}) => architect({OP: 'plan', ACTION: action, BOT_ID: bot_id, BOT_B64: bot ? b64(bot) : ''}),
  },
  fyso_bot_apply: {
    description: 'Apply a plan from fyso_bot_plan by its exact planId: snapshots bots and memory, applies it in OpenMausBot and commits project/bots/team.yaml. Fails if the configuration changed since the plan; then plan again.',
    inputSchema: obj({plan_id: str('planId returned by fyso_bot_plan')}, ['plan_id']),
    annotations: {destructiveHint: true},
    run: ({plan_id}) => architect({OP: 'apply', PLAN_ID: plan_id}),
  },
  fyso_bot_import: {
    description: 'Bring a bot that exists only in OpenMausBot (or only in a snapshot) into the versioned project configuration, by exact native id. Does not change its running profile.',
    inputSchema: obj({bot_id: str('Exact native bot id')}, ['bot_id']),
    run: ({bot_id}) => architect({OP: 'import', BOT_ID: bot_id}),
  },
  fyso_ext_search: {
    description: 'Search the extension catalogs (project/marketplaces.yaml): id, description, latest version and whether it is installed or has an update. Reads git catalogs over the network.',
    inputSchema: obj({query: str('Optional text to filter by id, name, description or tag')}),
    annotations: {readOnlyHint: true, openWorldHint: true},
    async run({query = ''}) {
      const data = (await dagu().run('fyso-ext-catalog', {}, {output: 'CATALOG', timeoutMs: 180000})).output;
      const q = query.toLowerCase();
      const match = e => !q || [e.id, e.name, e.description, ...(e.tags || [])].join(' ').toLowerCase().includes(q);
      return {catalogs: data.catalogs, extensions: data.extensions.filter(match)};
    },
  },
  fyso_ext_install: {
    description: 'Install (mode "add") or upgrade (mode "update") one extension from the catalogs by id. Commits only the extension\'s files and loads its processes and routes without a restart. Afterwards, tell the person to set any secrets it declares with `mise run secrets` (never ask them for secret values).',
    inputSchema: obj({id: str('Extension id from fyso_ext_search'), mode: str('add or update', {enum: ['add', 'update']})}, ['id']),
    annotations: {destructiveHint: false, openWorldHint: true},
    run: async ({id, mode = 'add'}) => (await dagu().run('fyso-ext-install', {ID: id, MODE: mode}, {output: 'RESULT', timeoutMs: 900000})).output,
  },
  fyso_snapshot: {
    description: 'Save bots and memory to git now (the scheduled snapshot, on demand). Returns "no changes" or the commit.',
    inputSchema: obj(),
    run: async () => (await dagu().run('fyso-snapshot', {}, {output: 'RESULT', timeoutMs: 300000})).output,
  },
  fyso_observability: {
    description: 'Collect bot conversations, workflow execution and AI consumption figures, as shown in the panel\'s Observability page.',
    inputSchema: obj(),
    annotations: {readOnlyHint: true},
    // The workflow refreshes .data/panel/observability.json and only prints refresh metadata;
    // return the collected data itself, as the panel reads it (GET /config/observability.json).
    async run() {
      const refresh = (await dagu().run('fyso-observability', {}, {output: 'SUMMARY', timeoutMs: 300000})).output;
      const data = readJson(path.join(process.env.FYSO_DATA || '.data', 'panel', 'observability.json'));
      if (!data) throw new Error('fyso-observability succeeded but .data/panel/observability.json is missing');
      return {refresh, ...data};
    },
  },
};

function validate(schema, args) {
  for (const key of schema.required || []) if (args[key] === undefined || args[key] === '') throw new Error(`missing argument: ${key}`);
  for (const [key, value] of Object.entries(args)) {
    const prop = schema.properties?.[key];
    if (!prop) throw new Error(`unknown argument: ${key}`);
    if (prop.type === 'string' && typeof value !== 'string') throw new Error(`${key} must be a string`);
    if (prop.type === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) throw new Error(`${key} must be an object`);
    if (prop.enum && !prop.enum.includes(value)) throw new Error(`${key} must be one of ${prop.enum.join(', ')}`);
  }
}

async function handle(msg) {
  const {id, method, params = {}} = msg;
  switch (method) {
    case 'initialize': {
      const protocolVersion = PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0];
      return {protocolVersion, capabilities: {tools: {listChanged: false}}, serverInfo: {name: 'fyso', version: VERSION},
        instructions: context()};
    }
    case 'ping': return {};
    case 'tools/list':
      return {tools: Object.entries(TOOLS).map(([name, t]) => ({name, description: t.description, inputSchema: t.inputSchema, ...(t.annotations && {annotations: t.annotations})}))};
    case 'tools/call': {
      const tool = TOOLS[params.name];
      if (!tool) throw Object.assign(new Error(`unknown tool: ${params.name}`), {code: -32602});
      try {
        const args = params.arguments || {};
        validate(tool.inputSchema, args);
        const result = await tool.run(args);
        return {content: [{type: 'text', text: JSON.stringify(result, null, 2)}], ...(result && typeof result === 'object' && !Array.isArray(result) && {structuredContent: result})};
      } catch (e) {
        return {isError: true, content: [{type: 'text', text: e.message}]};
      }
    }
    default:
      if (id === undefined) return undefined; // notifications need no answer
      throw Object.assign(new Error(`method not found: ${method}`), {code: -32601});
  }
}

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
    handle(msg).then(result => {
      if (msg.id !== undefined && result !== undefined) send({jsonrpc: '2.0', id: msg.id, result});
    }, e => {
      if (msg.id !== undefined) send({jsonrpc: '2.0', id: msg.id, error: {code: e.code || -32603, message: e.message}});
    });
  }
});
process.stdin.on('end', () => process.exit(0));
module.exports = {TOOLS};
