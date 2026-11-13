const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../../Recall-miaoda-migration');
assert.equal(require(path.join(root, '.spark/meta.json')).app_id, 'app_17hv4js1tsy');
require(path.join(root, 'node_modules/reflect-metadata'));
const { RecallPlatformProbeService } = require(path.join(root, 'dist/server/modules/recall/recall-platform-probe.service.js'));

async function verify() {
  const previous = { node: process.env.NODE_ENV, local: process.env.MIAODA_LOCAL_DEV };
  let checks = 0;
  const check = (actual, expected) => { assert.deepEqual(actual, expected); checks += 1; };
  try {
    const unavailable = new RecallPlatformProbeService(undefined, undefined, undefined, undefined);
    for (const [node, local] of [['production', '1'], ['production', '0'], ['development', '0'], ['test', '1']]) {
      process.env.NODE_ENV = node;
      process.env.MIAODA_LOCAL_DEV = local;
      await assert.rejects(unavailable.isolationProbe('synthetic-user'), error => error.getStatus() === 404);
      checks += 1;
    }
    process.env.NODE_ENV = 'development';
    process.env.MIAODA_LOCAL_DEV = '1';
    await assert.rejects(unavailable.isolationProbe(''), error => error.getStatus() === 400);
    checks += 1;

    for (const [message, expectedReason] of [
      ['SET TRANSACTION ISOLATION LEVEL must be called before any query', 'isolation-after-query'],
      ['SET TRANSACTION ISOLATION LEVEL must not be called within a subtransaction', 'isolation-in-subtransaction'],
      ['https://private.invalid/?signature=never-return-this', 'unclassified'],
    ]) {
      const database = { async transaction(_callback, options) {
        check(options, { isolationLevel: 'repeatable read', accessMode: 'read only' });
        throw new Error('Private query details', { cause: { code: '25000', routine: 'check_transaction_isolation', message } });
      } };
      const service = new RecallPlatformProbeService(database, undefined, undefined, undefined);
      const report = await service.isolationProbe('synthetic-user');
      check(report.callbackEntered, false);
      check(report.failurePhase, 'transaction-configuration');
      check(report.errorCode, '25000');
      check(report.errorReason, expectedReason);
      check(report.errorRoutine, 'check_transaction_isolation');
      check(/private|signature|synthetic-user/i.test(JSON.stringify(report)), false);
      check(report.errorTerms.every(term => typeof term === 'string' && /^[a-z]+$/.test(term)), true);
    }

    const database = { async transaction(callback) {
      return callback({ select() {
        return { from() { return { async limit(limit) {
          check(limit, 1);
          return [{ pid: 1, identity: 'synthetic-user', isolation: 'repeatable read', readOnly: true, rowSecurity: true }];
        } }; } };
      } });
    } };
    const report = await new RecallPlatformProbeService(database, undefined, undefined, undefined).isolationProbe('synthetic-user');
    check(report.callbackEntered, true);
    check(report.failurePhase, null);
    check(report.isolation, 'repeatable read');
    check(report.readOnly, true);
    check(report.identityPreserved, true);
    check(report.rowSecurityActive, true);
    check(report.sampleRows, 1);
    check(JSON.stringify(report).includes('synthetic-user'), false);
    process.stdout.write(`${checks} isolation guard/contract assertions passed; no platform requests made.\n`);
  } finally {
    for (const [key, value] of [['NODE_ENV', previous.node], ['MIAODA_LOCAL_DEV', previous.local]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

verify().catch(() => { process.stderr.write('Isolation contract verification failed.\n'); process.exitCode = 1; });
