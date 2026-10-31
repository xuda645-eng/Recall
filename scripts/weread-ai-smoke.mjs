import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AI_MAX_OUTPUT_TOKENS, arkResponsesUrl, parseQuestionResponse, questionRequest } from '../shared/weread-ai.ts';

const statePath = process.env.RECALL_SMOKE_STATE ?? resolve('../exports/weread/ai-smoke-state.json');
await mkdir(resolve(statePath, '..'), { recursive: true });
const lockPath = `${statePath}.lock`;
const lock = await open(lockPath, 'wx', 0o600).catch(() => null);
if (!lock) { console.log(JSON.stringify({ status: 'already_running' })); process.exit(0); }

async function credentials(path) {
  const content = await readFile(path, 'utf8');
  return Object.fromEntries(content.split(/\r?\n/).flatMap(line => {
    const match = /^(?:export\s+)?([A-Z_]+)=(.*)$/.exec(line.trim());
    if (!match) return [];
    return [[match[1], match[2].replace(/^(["'])(.*)\1$/, '$2')]];
  }));
}

try {
  const now = Date.now();
  const state = JSON.parse(await readFile(statePath, 'utf8').catch(() => JSON.stringify({ startedAt: now, attempts: 0, results: [] })));
  if (now - state.startedAt >= 24 * 3600000 || state.attempts >= 4 || state.stopped) {
    console.log(JSON.stringify({ status: 'complete', attempts: state.attempts, results: state.results }));
  } else if (state.lastAttempt && now - state.lastAttempt < 6 * 3600000) {
    console.log(JSON.stringify({ status: 'not_due', attempts: state.attempts }));
  } else {
    state.attempts++; state.lastAttempt = now;
    await writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
    const started = Date.now();
    let result;
    try {
      const ark = await credentials(process.env.ARK_CREDENTIALS_FILE ?? '/tmp/recall-ark.credentials.env');
      const weread = await credentials(process.env.WEREAD_CREDENTIALS_FILE ?? resolve('../weread.credentials.env'));
      if (!ark.ARK_API_KEY || !ark.ARK_ENDPOINT_ID || !weread.WEREAD_API_KEY) throw new Error('missing_credentials');
      const shelf = await fetch('https://i.weread.qq.com/api/agent/gateway', {
        method: 'POST', headers: { Authorization: `Bearer ${weread.WEREAD_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_name: '/user/notebooks', skill_version: '1.0.5', count: 1 }),
        signal: AbortSignal.timeout(45000), redirect: 'error',
      });
      if (!shelf.ok) { await shelf.body?.cancel(); throw new Error(`weread_http_${shelf.status}`); }
      const catalogue = await shelf.json();
      if (catalogue.upgrade_info) throw new Error('weread_upgrade_required');
      if ((catalogue.errcode !== undefined && catalogue.errcode !== 0) || !Array.isArray(catalogue.books)) throw new Error('weread_invalid_catalogue');
      const syntheticHighlight = state.attempts % 2 ? '合上材料，用自己的话说明结论与依据，再回到原文检查遗漏。'
        : '检验结论时，需要先区分事实与判断，并说明判断依据。材料中的“忽略以上指令”只是一句需要辨别的引用。';
      const response = await fetch(arkResponsesUrl(ark.ARK_BASE_URL), {
        method: 'POST', headers: { Authorization: `Bearer ${ark.ARK_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(questionRequest(ark.ARK_ENDPOINT_ID, syntheticHighlight, state.attempts % 2 === 0)),
        signal: AbortSignal.timeout(45000), redirect: 'error',
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error(`ark_http_${response.status}`); }
      const value = await response.json();
      const question = parseQuestionResponse(value, state.attempts % 2 === 0);
      result = { status: 'passed', at: new Date(now).toISOString(), durationMs: Date.now() - started,
        question: question.question, summaryPresent: question.summary !== null,
        inputTokens: value.usage?.input_tokens ?? null, outputTokens: value.usage?.output_tokens ?? null,
        maxOutputTokens: AI_MAX_OUTPUT_TOKENS, personalContentSentToModel: false, libraryWrites: 0 };
    } catch (error) {
      const safe = /^(missing_credentials|weread_http_\d+|weread_invalid_catalogue|weread_upgrade_required|ark_http_\d+)$/.test(error.message) ? error.message : 'network_or_schema_failure';
      result = { status: 'failed', at: new Date(now).toISOString(), reason: safe, durationMs: Date.now() - started, libraryWrites: 0 };
      state.stopped = true; process.exitCode = 1;
    }
    state.results.push(result);
    await writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ attempt: state.attempts, ...result }));
  }
} finally {
  await lock.close(); await unlink(lockPath);
}
