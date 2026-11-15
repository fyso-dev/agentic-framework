// Enforce a workflow scope (D60) on Dagu's forwarded MCP tools. Operator level only:
// read and run the scope's workflows; no changes, no inline specs, no free-form reads.
// Everything not listed here is refused: an argument or target a later Dagu adds stays
// closed until it is reviewed.
const scopes = require('./workflow-scopes.cjs');

const TOOLS = ['dagu_read', 'dagu_execute'];
// dagu_read targets that address one workflow by `name`, and the other arguments each accepts.
const BY_NAME = {
  dag: [], dag_spec: [], runs: [], run: ['dagRunId', 'subRunId'], run_logs: ['dagRunId', 'query'],
  step_log: ['dagRunId', 'subRunId', 'stepName', 'item', 'bodyStepName', 'query'],
  foreach_items: ['dagRunId', 'subRunId', 'stepName', 'query'], foreach_item: ['dagRunId', 'subRunId', 'stepName', 'item'],
};
const EXECUTE = ['action', 'name', 'dagRunId', 'params', 'wait', 'singleton', 'stepName', 'includeDownstream', 'subDAGRunId', 'inputs', 'reason', 'attemptId', 'labels'];
// Run labels carry data a workflow reads (a recipient, a deadline). `workspace=` is the one
// label that decides what a scope may see, so a scoped caller can never set it on a run.
const RUN_LABEL = /^[A-Za-z0-9][A-Za-z0-9_.\/=-]{0,8191}$/;
const runLabels = labels => {
  if (!Array.isArray(labels) || labels.length > 16 || !labels.every(label => typeof label === 'string' && RUN_LABEL.test(label))) deny('labels must be at most 16 plain run labels in a workflow scope');
  if (labels.some(label => /^workspace(=|$)/i.test(label))) deny('a workspace label is not available in a workflow scope');
};
const QUERY = /^(?:(?:tail|head|offset|limit|stream|parent|status|page|perPage)=[\w.-]{1,40})(?:&(?:tail|head|offset|limit|stream|parent|status|page|perPage)=[\w.-]{1,40})*$/;
const deny = message => { throw Error(message); };
const only = (args, keys, what) => { for (const key of Object.keys(args)) if (!keys.includes(key)) deny(`${key} is not available for ${what} in a workflow scope`); };

// Pi's MCP bridge consumes text blocks but discards structuredContent. Keep the
// native content and mirror the same authorized result as text for such clients.
function textCompatible(result) {
  if (result?.isError || !result?.structuredContent || typeof result.structuredContent !== 'object') return result;
  return {...result, content: [...(Array.isArray(result.content) ? result.content : []), {type: 'text', text: JSON.stringify(result.structuredContent, null, 2)}]};
}

// `resolve` returns the scope's workflows (name → {name, class, description}); tests replace it.
function guard(root, scope, system, resolve = () => scopes.allowed(root, scope, system)) {
  const names = resolve;
  const inScope = name => {
    if (typeof name !== 'string' || !names().has(name)) deny(`${name || 'that workflow'} is not in scope "${scope}". Available: ${[...names().keys()].join(', ') || 'none'}`);
  };
  return {
    scope,
    names,
    tools: list => list.filter(tool => TOOLS.includes(tool.name)).map(tool => {
      if (tool.name !== 'dagu_execute' || !tool.inputSchema?.properties) return tool;
      const schema = tool.inputSchema;
      return {...tool, inputSchema: {...schema, properties: Object.fromEntries(Object.entries(schema.properties).filter(([key]) => EXECUTE.includes(key))),
        ...(Array.isArray(schema.required) && {required: schema.required.filter(key => EXECUTE.includes(key))})}};
    }),
    /** Returns a result to answer locally, or undefined to forward the call unchanged. Throws when refused. */
    check(tool, args = {}) {
      if (tool === 'dagu_execute') {
        only(args, EXECUTE, 'dagu_execute');
        if (args.labels !== undefined) runLabels(args.labels);
        return void inScope(args.name);
      }
      if (tool !== 'dagu_read') deny(`${tool} is not available in a workflow scope: this bot reads and runs workflows, it does not change them`);
      if (args.uri !== undefined) {
        only(args, ['uri', 'target'], 'a uri read');
        // Path segments are plain words: no `..`, no encoded separators, no query.
        const match = /^dagu:\/\/(?:(reference)\/[\w-]+|(?:dags|runs)\/([\w.-]+)(?:\/[\w-]+)*)$/.exec(String(args.uri));
        if (!match) deny('only dagu://dags/<workflow>, dagu://runs/<workflow> and dagu://reference URIs are available in a workflow scope');
        if (!match[1]) inScope(match[2]);
        return undefined;
      }
      if (args.target === 'references') return void only(args, ['target'], 'references');
      if (args.target === 'reference') return void only(args, ['target', 'name'], 'reference');
      // Answered from the repository: Dagu's own list is paged and unfiltered.
      if (args.target === 'dags') {
        only(args, ['target'], 'the workflow list');
        const items = [...names().values()].map(w => ({name: w.name, ...(w.description && {description: w.description}), class: w.class, uri: `dagu://dags/${encodeURIComponent(w.name)}/spec`}));
        const data = {scope, items};
        return {content: [{type: 'text', text: JSON.stringify(data, null, 2)}], structuredContent: {data, target: 'dags'}};
      }
      if (!Object.hasOwn(BY_NAME, args.target)) deny(`target ${args.target} is not available in a workflow scope. Available: dags, ${Object.keys(BY_NAME).join(', ')}, references, reference`);
      only(args, ['target', 'name', ...BY_NAME[args.target]], `target ${args.target}`);
      inScope(args.name);
      if (args.query !== undefined && !QUERY.test(String(args.query))) deny('query accepts only tail, head, offset, limit, stream, parent, status, page and perPage');
      // `runs` is filtered in Dagu by exact name, and checked again on the way back (shape).
      return undefined;
    },
    /** Arguments actually sent to Dagu. */
    rewrite(tool, args) {
      return tool === 'dagu_read' && args.target === 'runs' ? {target: 'runs', query: `name=${encodeURIComponent(args.name)}`} : args;
    },
    /** A run list must hold only the requested workflow; anything else is dropped, and an unknown shape is refused. */
    shape(tool, args, result) {
      if (result?.isError) return result;
      if (tool !== 'dagu_read' || args.target !== 'runs') return textCompatible(result);
      const items = result?.structuredContent?.data?.items;
      if (!Array.isArray(items)) deny('unexpected run list from Dagu; refused in a workflow scope');
      const data = {...result.structuredContent.data, items: items.filter(item => item?.name === args.name)};
      return {content: [{type: 'text', text: JSON.stringify(data, null, 2)}], structuredContent: {data, target: 'runs'}};
    },
  };
}

module.exports = {guard, TOOLS, textCompatible};
