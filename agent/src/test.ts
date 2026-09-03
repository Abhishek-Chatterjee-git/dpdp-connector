import assert from 'node:assert';
import { createHmac } from 'node:crypto';
import { generateVerhoeffCheckDigit, canonicalJson } from '@dpdp/shared';
import { SqliteAdapter } from './db/connector.js';
import { PiiDiscoveryScanner } from './discovery/scanner.js';
import { InMemoryConsentCache } from './consent/cache.js';
import { DsrExecutor } from './dsr/executor.js';
import { ZoneAgentDaemon } from './daemon.js';

console.log('--- Running @dpdp/agent self-test ---');

// 1. Setup Test SQLite Database with Enterprise PII
console.log('Test 1: Setup test database and sample schema');
const adapter = new SqliteAdapter(':memory:');
await adapter.connect();

const db = adapter.getNativeDb();
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    aadhaar_no TEXT NOT NULL,
    pan_no TEXT NOT NULL
  );

  CREATE TABLE payment_methods (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    card_number TEXT NOT NULL,
    upi_id TEXT NOT NULL
  );
`);

// Insert mock data with valid checksums
const validAadhaar = `99991234567${generateVerhoeffCheckDigit('99991234567')}`;
db.prepare(`
  INSERT INTO users (id, full_name, email, phone, aadhaar_no, pan_no)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(101, 'Aarav Sharma', 'aarav.sharma@example.com', '9876543210', validAadhaar, 'ABCDE1234F');

db.prepare(`
  INSERT INTO payment_methods (id, user_id, card_number, upi_id)
  VALUES (?, ?, ?, ?)
`).run(1, 101, '4532015112830366', 'aarav@okhdfcbank');

// 2. Test Local PII Discovery Scanner
console.log('Test 2: PII Discovery Scanner & Classification');
const scanner = new PiiDiscoveryScanner(adapter, {
  agentId: 'test-agent-01',
  targetId: 'target-sqlite-test',
  targetType: 'SQLITE',
  targetUriMasked: 'sqlite://:memory:',
});

const report = await scanner.scan();
assert.strictEqual(report.tables.length, 2);

const usersTable = report.tables.find((t) => t.tableName === 'users');
assert.ok(usersTable);

const emailCol = usersTable.columns.find((c) => c.name === 'email');
assert.strictEqual(emailCol?.detectedPii?.piiType, 'EMAIL');

const aadhaarCol = usersTable.columns.find((c) => c.name === 'aadhaar_no');
assert.strictEqual(aadhaarCol?.detectedPii?.piiType, 'AADHAAR');

const panCol = usersTable.columns.find((c) => c.name === 'pan_no');
assert.strictEqual(panCol?.detectedPii?.piiType, 'PAN');

const payTable = report.tables.find((t) => t.tableName === 'payment_methods');
assert.ok(payTable);
const cardCol = payTable.columns.find((c) => c.name === 'card_number');
assert.strictEqual(cardCol?.detectedPii?.piiType, 'CREDIT_CARD');

const upiCol = payTable.columns.find((c) => c.name === 'upi_id');
assert.strictEqual(upiCol?.detectedPii?.piiType, 'UPI_ID');

// 3. Test In-Memory Sub-Millisecond Consent Cache & Eviction
console.log('Test 3: Sub-millisecond Hot-Path Consent Cache');
const cache = new InMemoryConsentCache();

// Seed consent
cache.set('user_101', 'v1.0', ['essential', 'marketing_promo']);

// Measure check latency
const start = performance.now();
const res1 = cache.check('user_101', 'marketing_promo');
const elapsedMs = performance.now() - start;

assert.strictEqual(res1.allowed, true);
assert.ok(elapsedMs < 1.0, `Expected latency < 1ms, got ${elapsedMs}ms`);

const resDenied = cache.check('user_101', 'third_party_analytics');
assert.strictEqual(resDenied.allowed, false);

// Invalidate marketing
cache.invalidate('user_101', ['marketing_promo']);
const resAfterWithdraw = cache.check('user_101', 'marketing_promo');
assert.strictEqual(resAfterWithdraw.allowed, false);

// Essential remains active
const resEssential = cache.check('user_101', 'essential');
assert.strictEqual(resEssential.allowed, true);

// 4. Test DSR Saga Execution & Signed Receipt
console.log('Test 4: DSR Saga Worker & Cryptographic Proof');
const secretKey = 'test-secret-key-999';
const executor = new DsrExecutor(adapter, 'test-agent-01', secretKey);

const receipt = await executor.executeTask({
  taskId: 'task-dsr-001',
  dsrId: 'dsr-req-555',
  agentId: 'test-agent-01',
  targetId: 'target-sqlite-test',
  action: 'DELETE',
  tableName: 'users',
  filterColumn: 'id',
  filterValue: '101',
});

assert.strictEqual(receipt.status, 'SUCCESS');
assert.strictEqual(receipt.recordsAffected, 1);

// Verify user was actually deleted in DB
const userRows = await adapter.sampleRows('users', 10);
assert.strictEqual(userRows.length, 0);

// Verify HMAC receipt signature
const expectedSig = createHmac('sha256', secretKey)
  .update(
    canonicalJson({
      taskId: receipt.taskId,
      dsrId: receipt.dsrId,
      agentId: receipt.agentId,
      targetId: receipt.targetId,
      status: receipt.status,
      recordsAffected: receipt.recordsAffected,
      completedAt: receipt.completedAt,
    })
  )
  .digest('hex');
assert.strictEqual(receipt.agentSignature, expectedSig);

// 5. Test Zone Agent Daemon HTTP Server
console.log('Test 5: Zone Agent Daemon HTTP Server & Endpoints');
const testPort = 5055;
const daemon = new ZoneAgentDaemon(
  {
    agentId: 'daemon-test-01',
    agentPort: testPort,
    controlPlaneUrl: 'http://127.0.0.1:9999', // dummy url
  },
  adapter
);

await daemon.start();

// Test GET /health
const healthRes = await fetch(`http://127.0.0.1:${testPort}/health`);
assert.strictEqual(healthRes.status, 200);
const healthData = (await healthRes.json()) as any;
assert.strictEqual(healthData.status, 'ok');

// Test POST /consent/cache/set
const setRes = await fetch(`http://127.0.0.1:${testPort}/consent/cache/set`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    principalId: 'user_404',
    noticeVersion: 'v2.1',
    purposes: ['essential', 'sms_offers'],
  }),
});
assert.strictEqual(setRes.status, 200);

// Test GET /consent/check
const checkRes = await fetch(
  `http://127.0.0.1:${testPort}/consent/check?principal_id=user_404&purpose=sms_offers`
);
assert.strictEqual(checkRes.status, 200);
const checkData = (await checkRes.json()) as any;
assert.strictEqual(checkData.allowed, true);

await daemon.stop();

console.log('--- ALL @dpdp/agent self-tests passed successfully! ---');
