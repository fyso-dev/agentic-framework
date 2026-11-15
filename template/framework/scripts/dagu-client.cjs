// Run one of this project's Dagu workflows and return its output, like the panel does
// (start or enqueue, poll, read outputs; D80). Used by the Bot Architect CLI and the fyso MCP server.
const FAILED = ['failed', 'aborted', 'rejected', 'cancelled'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function client(env = process.env) {
  if (!env.FYSO_DAGU_PORT || !env.FYSO_ADMIN_USER || !env.FYSO_ADMIN_PASSWORD)
    throw new Error('Dagu is not configured: run through mise (FYSO_DAGU_PORT, FYSO_ADMIN_USER, FYSO_ADMIN_PASSWORD)');
  const base = `http://127.0.0.1:${env.FYSO_DAGU_PORT}/api/v1`;
  const headers = {Authorization: 'Basic ' + Buffer.from(`${env.FYSO_ADMIN_USER}:${env.FYSO_ADMIN_PASSWORD}`).toString('base64'),
    'Content-Type': 'application/json'};
  const get = async (path, init) => {
    const r = await fetch(base + path, {headers, signal: AbortSignal.timeout(10000), ...init});
    if (!r.ok) throw new Error(`Dagu ${init?.method || 'GET'} ${path} failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
    return r.json();
  };
  // D80: start at once only workflows that may overlap; Dagu's queue scan waits up to 3 s.
  const overlap = new Map();
  const mayOverlap = name => {
    if (!overlap.has(name)) overlap.set(name, get(`/dags/${encodeURIComponent(name)}`)
      .then(r => (r.dag?.maxActiveRuns ?? 1) !== 1).catch(() => { overlap.delete(name); return false; }));
    return overlap.get(name);
  };
  return {
    /** Start or enqueue `name` with string params and wait. Resolves `{runId, output}` (output parsed as JSON when it is). */
    async run(name, params = {}, {output, timeoutMs = 300000} = {}) {
      const dag = encodeURIComponent(name);
      const body = Object.keys(params).length ? {params: JSON.stringify(params)} : {};
      const {dagRunId} = await get(`/dags/${dag}/${await mayOverlap(name) ? 'start' : 'enqueue'}`, {method: 'POST', body: JSON.stringify(body)});
      const run = encodeURIComponent(dagRunId);
      for (let polls = 0, end = Date.now() + timeoutMs; Date.now() < end; polls++) {
        let detail;
        try { detail = (await get(`/dag-runs/${dag}/${run}`)).dagRunDetails; } catch { await sleep(1000); continue; }
        if (detail.statusLabel === 'succeeded' || detail.statusLabel === 'partially_succeeded') {
          const outputs = (await get(`/dag-runs/${dag}/${run}/outputs`)).outputs || {};
          let value = output ? outputs[output] ?? outputs[output.toLowerCase()] : outputs;
          if (typeof value === 'string') try { value = JSON.parse(value); } catch {}
          return {runId: dagRunId, output: value};
        }
        if (FAILED.includes(detail.statusLabel)) {
          const reason = detail.nodes?.find(n => n.error)?.error || detail.error || detail.statusLabel;
          throw new Error(`${name} ${detail.statusLabel} (run ${dagRunId}): ${reason}`);
        }
        await sleep(Math.min(1000, Math.round(200 * 1.5 ** polls)));
      }
      throw new Error(`${name} still running after ${Math.round(timeoutMs / 1000)} s (run ${dagRunId}); inspect it in Dagu`);
    },
  };
}

module.exports = {client};
