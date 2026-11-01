import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const request = JSON.parse(await readFile(process.argv[2], 'utf8'));
const project = await realpath(request.project);
const parserPath = await realpath(path.resolve(project, request.parser));
assert.ok(parserPath.startsWith(project + path.sep), 'Parser must belong to project');
const { createServer } = await import(pathToFileURL(`${project}/node_modules/vite/dist/node/index.js`).href);
const server = await createServer({
  root: project,
  configFile: false,
  resolve: { alias: { '@': `${project}/src` } },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
});

try {
  const { parseMemoryMarkdown, planMemoryImport, applyMemoryImport } = await server.ssrLoadModule('/' + path.relative(project, parserPath).split(path.sep).join('/'));
  const { createSeedSnapshot } = await server.ssrLoadModule('/src/data/seed.ts');
  const { createFolder, folderPath } = await server.ssrLoadModule('/src/lib/memory-folders.ts');
  const generationTime = new Date().toISOString();
  const seed = createSeedSnapshot();

  function parentId(snapshot, names) {
    let state = snapshot;
    let parent = null;
    for (const name of names || []) {
      let deck = state.decks.find(deck => (deck.parentId ?? null) === parent && deck.name === name);
      if (!deck) {
        state = createFolder(state, name, parent, generationTime);
        deck = state.decks.at(-1);
      }
      parent = deck.id;
    }
    return { state, parent };
  }

  function checkedDocument(file) {
    const document = parseMemoryMarkdown(file.text, generationTime);
    assert.equal(document.entries.length, file.expected.length, file.name);
    for (const [index, entry] of document.entries.entries()) {
      const expected = file.expected[index];
      assert.deepEqual({ id: entry.id, path: entry.path, front: entry.front, back: entry.back }, {
        id: expected.id, path: expected.path, front: expected.front, back: expected.back,
      }, file.name);
      assert.equal(entry.kind, 'qa');
      assert.equal(entry.generated, false);
      assert.equal(entry.meta.importedAt, undefined, 'Generated file must not claim APP import');
    }
    return document;
  }

  function importFiles(snapshot, files, parentNames, updates = false) {
    let { state, parent } = parentId(snapshot, parentNames);
    const totals = { added: 0, updated: 0, skipped: 0, changes: 0 };
    for (const file of files) {
      const document = checkedDocument(file);
      const before = JSON.stringify(state);
      const plan = planMemoryImport(state, document, parent);
      totals.changes += plan.rows.filter(row => row.status === 'change').length;
      const selected = updates ? new Set(plan.rows.filter(row => row.status === 'change').map(row => row.entry.id)) : new Set();
      const result = applyMemoryImport(state, plan, selected);
      assert.equal(JSON.stringify(state), before, 'Import must not mutate original snapshot');
      for (const field of ['reviewLogs', 'studySessions']) {
        assert.deepEqual(result.snapshot[field], state[field]);
      }
      const oldIds = new Set(state.cards.map(card => card.id));
      assert.ok(state.cards.every(old => result.snapshot.cards.some(card => card.id === old.id)), 'Missing file rows must not delete old cards');
      for (const card of result.snapshot.cards.filter(card => oldIds.has(card.id))) {
        const old = state.cards.find(old => old.id === card.id);
        for (const field of ['importedAt', 'createdAt', 'reps', 'lapses', 'stability', 'difficulty', 'state',
          'lastReviewDate', 'nextReviewDate', 'scheduledDays', 'elapsedDays', 'learningSteps']) {
          assert.equal(card[field], old[field], `Review field changed: ${field}`);
        }
        if (!selected.has(card.id)) assert.deepEqual(card, old, 'Unselected updates must not overwrite');
      }
      for (const row of plan.rows.filter(row => row.status === 'new' || selected.has(row.entry.id))) {
        const card = result.snapshot.cards.find(card => card.id === row.entry.id);
        assert.deepEqual(folderPath(result.snapshot.decks, card.deckId).map(deck => deck.name), [...(parentNames || []), ...row.entry.path]);
      }
      for (const field of ['added', 'updated', 'skipped']) totals[field] += result[field];
      state = result.snapshot;
    }
    return { state, totals };
  }

  const expectedCount = request.documents.reduce((total, file) => total + file.expected.length, 0);
  const first = importFiles(seed, request.documents, request.import_parent);
  assert.equal(first.totals.added, expectedCount);
  const repeated = importFiles(first.state, request.documents, request.import_parent);
  assert.deepEqual(repeated.totals, { added: 0, updated: 0, skipped: expectedCount, changes: 0 });
  assert.deepEqual(repeated.state, first.state);

  let historical = seed;
  for (const batch of request.history) historical = importFiles(historical, batch.documents, batch.import_parent, true).state;
  historical = { ...historical, cards: historical.cards.map(card => ({ ...card, reps: 7, stability: 13,
    difficulty: 4, nextReviewDate: '2027-01-01T00:00:00Z' })) };
  const defaultImport = importFiles(historical, request.documents, request.import_parent);
  const confirmedImport = importFiles(historical, request.documents, request.import_parent, true);
  assert.equal(defaultImport.totals.updated, 0);
  assert.equal(confirmedImport.totals.updated, confirmedImport.totals.changes);

  const changedFile = { ...request.documents[0], expected: request.documents[0].expected.map((card, index) =>
    index === 0 ? { ...card, front: card.front.length < 9900 ? card.front + '（内存校验修订）'
      : card.front.replace(/^./u, card.front.startsWith('验') ? '测' : '验') } : card) };
  changedFile.text = changedFile.text.replace('问题：' + request.documents[0].expected[0].front + '\n',
    () => '问题：' + changedFile.expected[0].front + '\n');
  const protectedState = { ...first.state, cards: first.state.cards.map(card => ({ ...card, reps: 5, stability: 11 })) };
  const declined = importFiles(protectedState, [changedFile], request.import_parent);
  assert.equal(declined.totals.changes, 1);
  assert.deepEqual(declined.state, protectedState);
  const accepted = importFiles(protectedState, [changedFile], request.import_parent, true);
  assert.equal(accepted.totals.updated, 1);

  console.log(JSON.stringify({
    status: 'passed', parser: request.parser, cards: expectedCount, first_import: first.totals,
    repeat_import: repeated.totals, against_history: defaultImport.totals,
    confirmed_history_updates: confirmedImport.totals, explicit_update_verified: true,
    old_cards_preserved: true, review_progress_preserved: true, database_accessed: false,
    physical_iphone_tested: false,
  }));
} finally {
  await server.close();
}
