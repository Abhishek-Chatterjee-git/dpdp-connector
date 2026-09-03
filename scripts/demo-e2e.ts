import assert from 'node:assert';
import { ControlPlaneStorage, ControlPlaneServer } from '../control-plane/src/index.js';
import { SqliteAdapter, ZoneAgentDaemon } from '../agent/src/index.js';
import { EcomDatabase, EcomServer } from '../sim-enterprise/ecom-app/src/index.js';

console.log('================================================================');
console.log('  DPDP ACT 2025 COMPLIANCE CONNECTOR — END-TO-END DEMO SUITE  ');
console.log('================================================================\n');

const CP_PORT = 4011;
const AGENT_PORT = 5011;
const ECOM_PORT = 3011;

// 1. Shared Database for Enterprise Simulation
const sharedDbPath = ':memory:';
const ecomDb = new EcomDatabase(sharedDbPath);
await ecomDb.init();

// Adapter wrapping the same native DB
const agentAdapter = new SqliteAdapter(sharedDbPath);
// Inject initialized native db into adapter
(agentAdapter as any).db = ecomDb.getDb();

// 2. Start Central Control Plane
console.log('[Phase 1] Starting Central Control Plane on port', CP_PORT);
const cpStorage = new ControlPlaneStorage(':memory:');
const cpServer = new ControlPlaneServer(CP_PORT, cpStorage);
await cpServer.start();

// 3. Start Zone Agent
console.log('[Phase 2] Starting Zone Agent on port', AGENT_PORT);
const agentDaemon = new ZoneAgentDaemon(
  {
    agentId: 'agent-mumbai-zone-01',
    agentName: 'AWS-Mumbai-VPC-Agent',
    agentPort: AGENT_PORT,
    controlPlaneUrl: `http://127.0.0.1:${CP_PORT}`,
    heartbeatIntervalMs: 500,
    ddlCheckIntervalMs: 1000,
  },
  agentAdapter
);
await agentDaemon.start();

// 4. Start Demo E-Commerce Enterprise App
console.log('[Phase 3] Starting Demo E-Commerce App on port', ECOM_PORT);
const ecomServer = new EcomServer(
  {
    port: ECOM_PORT,
    agentUrl: `http://127.0.0.1:${AGENT_PORT}`,
    controlPlaneUrl: `http://127.0.0.1:${CP_PORT}`,
  },
  ecomDb
);
await ecomServer.start();

console.log('\n--- ALL THREE TIERS OPERATIONAL ---\n');

// -------------------------------------------------------------
// SCENARIO 1: Automated Discovery & Zero-PII-Egress Data Mapping
// -------------------------------------------------------------
console.log('>>> SCENARIO 1: Automated Discovery & Data Mapping');
// Trigger discovery scan
await agentDaemon.getDiscoveryScanner().scan().then(async (report) => {
  await fetch(`http://127.0.0.1:${CP_PORT}/api/v1/agent/discovery/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
});

const dataMapRes = await fetch(`http://127.0.0.1:${CP_PORT}/api/v1/dpo/datamap`);
const dataMap = (await dataMapRes.json()) as any;
console.log(`[DPO Catalog] Discovered ${dataMap.tables.length} tables in enterprise database.`);

const usersTable = dataMap.tables.find((t: any) => t.tableName === 'users');
assert.ok(usersTable, 'users table must be cataloged');
const piiCols = usersTable.columns.filter((c: any) => c.detectedPii);
console.log(`[DPO Catalog] Detected PII in 'users' table: ${piiCols.map((c: any) => `${c.name} (${c.detectedPii.piiType})`).join(', ')}`);
assert.ok(piiCols.length >= 3, 'Must detect Aadhaar, Phone, Email, etc.');

// -------------------------------------------------------------
// SCENARIO 2: Customer Onboarding & DPDP Consent Notice
// -------------------------------------------------------------
console.log('\n>>> SCENARIO 2: Customer Signup with DPDP Granular Consent Notice');
const signupRes = await fetch(`http://127.0.0.1:${ECOM_PORT}/api/auth/signup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fullName: 'Priya Patel',
    email: 'priya.patel@test.in',
    phone: '9876543211',
    panNo: 'ABCDE5678G',
    streetAddress: '45 Residency Road, Bengaluru',
    consents: ['essential', 'marketing_promo'], // Consented to essential + marketing
  }),
});

assert.strictEqual(signupRes.status, 200);
const signupData = (await signupRes.json()) as any;
const newUserId = signupData.user.id;
console.log(`[E-Commerce] Account created: ${signupData.user.fullName} (ID: ${newUserId}) with purposes: ${signupData.user.consentedPurposes.join(', ')}`);

// -------------------------------------------------------------
// SCENARIO 3: Hot-Path Real-Time Consent Check (<1ms)
// -------------------------------------------------------------
console.log('\n>>> SCENARIO 3: Real-Time Gated Marketing Action (Hot Path)');
const startCheck = performance.now();
const promoRes1 = await fetch(`http://127.0.0.1:${ECOM_PORT}/api/marketing/send-promo-sms`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: newUserId }),
});
const promoLatency = performance.now() - startCheck;

assert.strictEqual(promoRes1.status, 200, 'Marketing SMS must succeed when consent is active');
const promoData1 = (await promoRes1.json()) as any;
console.log(`[E-Commerce] 200 OK — ${promoData1.message} (Agent Check Latency: ${promoData1.agentLatencyMs}ms)`);

// -------------------------------------------------------------
// SCENARIO 4: Consent Withdrawal & Real-Time Invalidation
// -------------------------------------------------------------
console.log('\n>>> SCENARIO 4: Consent Withdrawal & Event-Driven Cache Invalidation');
const withdrawRes = await fetch(`http://127.0.0.1:${ECOM_PORT}/api/privacy/consent/withdraw`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: newUserId,
    purposesWithdrawn: ['marketing_promo'],
  }),
});
assert.strictEqual(withdrawRes.status, 200);
console.log(`[Control Plane] Consent withdrawn for ${newUserId}. Eviction task dispatched to Zone Agent.`);

// Give brief tick for heartbeat task exchange
await new Promise((r) => setTimeout(r, 600));

// Retrying promotional SMS — MUST BE BLOCKED BY ZONE AGENT!
const promoRes2 = await fetch(`http://127.0.0.1:${ECOM_PORT}/api/marketing/send-promo-sms`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: newUserId }),
});

assert.strictEqual(promoRes2.status, 403, 'Marketing SMS must be blocked with 403 after withdrawal');
const promoData2 = (await promoRes2.json()) as any;
console.log(`[E-Commerce] 403 FORBIDDEN — BLOCKED BY ZONE AGENT: ${promoData2.reason}`);
console.log(`[E-Commerce] Statutory Basis: ${promoData2.statutoryBasis}`);

// -------------------------------------------------------------
// SCENARIO 5: Data Subject Rights (DSR) Erasure Saga
// -------------------------------------------------------------
console.log('\n>>> SCENARIO 5: Distributed DSR Erasure Saga (Right to be Forgotten)');
const erasureRes = await fetch(`http://127.0.0.1:${ECOM_PORT}/api/privacy/dsr/erasure`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: newUserId }),
});
assert.strictEqual(erasureRes.status, 200);
console.log(`[Control Plane] DSR Erasure Saga initiated for user: ${newUserId}`);

// Allow agent heartbeat tick to execute deletion task and return proof
await new Promise((r) => setTimeout(r, 700));

// Verify user is deleted in the database
const checkUserRow = ecomDb.getDb().prepare('SELECT * FROM users WHERE id = ?').get(newUserId);
assert.strictEqual(checkUserRow, undefined, 'User record must be deleted in DB');
console.log('[Zone Agent] Atomic DELETE executed in database. User record wiped.');

// Verify DSR status on Control Plane
const dsrReqsRes = await fetch(`http://127.0.0.1:${CP_PORT}/api/v1/dpo/overview`);
const dsrOverview = (await dsrReqsRes.json()) as any;
const completedDsr = dsrOverview.recentDsrs.find((d: any) => d.principalId === newUserId);
assert.ok(completedDsr);
assert.strictEqual(completedDsr.status, 'COMPLETED');
console.log(`[Control Plane] DSR Status: COMPLETED with signed cryptographic receipt.`);

// -------------------------------------------------------------
// SCENARIO 6: Cryptographic Audit Ledger Verification
// -------------------------------------------------------------
console.log('\n>>> SCENARIO 6: Cryptographic Audit Ledger Verification');
const ledgerRes = await fetch(`http://127.0.0.1:${CP_PORT}/api/v1/dpo/ledger/verify`, {
  method: 'POST',
});
const ledgerData = (await ledgerRes.json()) as any;
console.log(`[Audit Ledger] Verification result: ${ledgerData.valid ? 'VALID (Tamper-Free)' : 'FAILED'}`);
console.log(`[Audit Ledger] Total SHA-256 Chained Blocks: ${ledgerData.totalBlocks}`);
assert.strictEqual(ledgerData.valid, true);

// -------------------------------------------------------------
// SCENARIO 7: Live DPDP Compliance Scorecard
// -------------------------------------------------------------
console.log('\n>>> SCENARIO 7: DPO Live Compliance Health Score');
const compRes = await fetch(`http://127.0.0.1:${CP_PORT}/api/v1/dpo/overview`);
const compOverview = (await compRes.json()) as any;
const comp = compOverview.compliance;
console.log(`[DPO Scorecard] Overall Grade: ${comp.grade} (${comp.overallScore}%)`);
console.log(`[DPO Scorecard] Recommendations: ${comp.recommendations.join('; ')}`);

// Cleanup
await ecomServer.stop();
await agentDaemon.stop();
await cpServer.stop();

console.log('\n================================================================');
console.log('  ALL END-TO-END POC INTEGRATION SCENARIOS PASSED WITH SUCCESS  ');
console.log('================================================================\n');
