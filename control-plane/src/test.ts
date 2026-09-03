import assert from 'node:assert';
import { ControlPlaneStorage } from './storage/db.js';
import { ControlPlaneServer } from './server.js';
import { DiscoveryReport } from '@dpdp/shared';

console.log('--- Running @dpdp/control-plane self-test ---');

const testPort = 4055;
const storage = new ControlPlaneStorage(':memory:');
const server = new ControlPlaneServer(testPort, storage);

await server.start();
const services = server.getServices();

// 1. Test Agent Registration
console.log('Test 1: Agent Registration via API');
const regRes = await fetch(`http://127.0.0.1:${testPort}/api/v1/agent/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agentId: 'agent-mumbai-01',
    agentName: 'AWS-Mumbai-Zone-Agent',
    version: '1.0.0',
    environment: 'production',
    targetEndpoints: ['postgres://app_replica:5432/ecom_db'],
  }),
});

assert.strictEqual(regRes.status, 200);
const regData = (await regRes.json()) as any;
assert.strictEqual(regData.success, true);
assert.ok(regData.agentToken.startsWith('dpdp_token_'));

// 2. Test Discovery Metadata Ingestion
console.log('Test 2: Discovery Metadata Ingestion');
const mockReport: DiscoveryReport = {
  agentId: 'agent-mumbai-01',
  targetId: 'postgres-primary',
  targetType: 'POSTGRES',
  targetUriMasked: 'postgres://app_replica:5432/ecom_db',
  timestamp: new Date().toISOString(),
  overallDdlChecksum: 'abc123def456',
  tables: [
    {
      tableName: 'customers',
      rowCountEstimate: 1500,
      ddlChecksum: 'tbl_check_1',
      columns: [
        { name: 'id', dataType: 'INTEGER', isNullable: false, isPrimaryKey: true },
        {
          name: 'email',
          dataType: 'VARCHAR',
          isNullable: false,
          isPrimaryKey: false,
          detectedPii: { piiType: 'EMAIL', confidence: 0.98, sampleCount: 100, matchCount: 98 },
        },
        {
          name: 'aadhaar_number',
          dataType: 'VARCHAR',
          isNullable: true,
          isPrimaryKey: false,
          detectedPii: { piiType: 'AADHAAR', confidence: 1.0, sampleCount: 100, matchCount: 100 },
        },
      ],
    },
  ],
};

const discRes = await fetch(`http://127.0.0.1:${testPort}/api/v1/agent/discovery/submit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(mockReport),
});
assert.strictEqual(discRes.status, 200);

const dataMap = services.catalog.getDataMap();
assert.strictEqual(dataMap.length, 1);
assert.strictEqual(dataMap[0].tableName, 'customers');
assert.strictEqual(dataMap[0].piiColumnsCount, 2);

// 3. Test Consent Recording & Withdrawal with Agent Invalidation Task
console.log('Test 3: Consent Lifecycle & Cache Invalidation Dispatch');
const consentRes = await fetch(`http://127.0.0.1:${testPort}/api/v1/consent/record`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    principalId: 'user_aarav_99',
    noticeVersion: 'v2.0',
    purposes: ['essential', 'marketing_sms', 'analytics'],
    channel: 'web_signup',
  }),
});
assert.strictEqual(consentRes.status, 200);

// Withdraw 'marketing_sms'
const withdrawRes = await fetch(`http://127.0.0.1:${testPort}/api/v1/consent/withdraw`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    principalId: 'user_aarav_99',
    purposesWithdrawn: ['marketing_sms'],
  }),
});
assert.strictEqual(withdrawRes.status, 200);
const withdrawData = (await withdrawRes.json()) as any;
assert.strictEqual(withdrawData.success, true);
assert.strictEqual(withdrawData.invalidatedAgentsCount, 1);

// Verify agent pulls invalidation task on heartbeat
const hbRes = await fetch(`http://127.0.0.1:${testPort}/api/v1/agent/heartbeat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agentId: 'agent-mumbai-01',
    status: 'ACTIVE',
    ddlChecksum: 'abc123def456',
  }),
});
assert.strictEqual(hbRes.status, 200);
const hbData = (await hbRes.json()) as any;
assert.ok(hbData.tasks.length > 0);
assert.strictEqual(hbData.tasks[0].type, 'TASK_CONSENT_INVALIDATE');
assert.strictEqual(hbData.tasks[0].data.principalId, 'user_aarav_99');

// 4. Test DSR Saga Creation & Proof Receipt Ledgering
console.log('Test 4: DSR Erasure Saga & Cryptographic Proof Receipt');
const dsrReq = await services.dsr.createDsrRequest('user_aarav_99', 'ERASURE', 'DPO_PORTAL');
assert.strictEqual(dsrReq.status, 'IN_PROGRESS');

// Verify agent gets DSR execute task
const hbRes2 = await fetch(`http://127.0.0.1:${testPort}/api/v1/agent/heartbeat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agentId: 'agent-mumbai-01',
    status: 'ACTIVE',
  }),
});
const hbData2 = (await hbRes2.json()) as any;
const dsrTask = hbData2.tasks.find((t: any) => t.type === 'TASK_DSR_EXECUTE');
assert.ok(dsrTask);

// Agent submits DSR proof
const proofRes = await fetch(`http://127.0.0.1:${testPort}/api/v1/agent/dsr/proof`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    taskId: dsrTask.taskId,
    dsrId: dsrReq.dsrId,
    agentId: 'agent-mumbai-01',
    targetId: 'postgres-primary',
    status: 'SUCCESS',
    recordsAffected: 1,
    completedAt: new Date().toISOString(),
    agentSignature: 'sig_hmac_proof_verified_123',
  }),
});
assert.strictEqual(proofRes.status, 200);

const dsrList = services.dsr.getDsrRequests();
const completedDsr = dsrList.find((d) => d.dsrId === dsrReq.dsrId);
assert.strictEqual(completedDsr?.status, 'COMPLETED');

// 5. Test Cryptographic Audit Ledger Integrity
console.log('Test 5: Cryptographic Audit Ledger Integrity Verification');
const integrity = services.ledger.verifyIntegrity();
assert.strictEqual(integrity.valid, true);
assert.ok(integrity.totalBlocks >= 5);

// 6. Test Compliance Health Report
console.log('Test 6: Live Compliance Health Report Calculation');
const report = services.compliance.getComplianceReport();
assert.ok(report.overallScore >= 90);
assert.strictEqual(report.grade, 'A+');
assert.strictEqual(report.metrics.connectedAgentsCount, 1);
assert.strictEqual(report.metrics.discoveredTablesCount, 1);
assert.strictEqual(report.metrics.ledgerValid, true);

// 7. Test DPO Authentication & Session Verification
console.log('Test 7: DPO Officer RBAC Authentication');
const authLoginRes = await fetch(`http://127.0.0.1:${testPort}/api/v1/dpo/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'dpo_admin', password: 'Compliance@2025' }),
});
assert.strictEqual(authLoginRes.status, 200);
const authData = (await authLoginRes.json()) as any;
assert.strictEqual(authData.success, true);
assert.strictEqual(authData.session.user.role, 'DPO_ADMIN');

// 8. Test Agent Auto-Enrollment Script Generator
console.log('Test 8: Agent Enrollment Script Generation');
const enrollRes = await fetch(`http://127.0.0.1:${testPort}/api/v1/dpo/enrollment-script?agent_id=agent-proxmox-01&subnet=192.168.1.0/24`);
assert.strictEqual(enrollRes.status, 200);
const enrollData = (await enrollRes.json()) as any;
assert.ok(enrollData.dockerCommand.includes('agent-proxmox-01'));
assert.ok(enrollData.dockerCommand.includes('192.168.1.0/24'));

await server.stop();
console.log('--- ALL @dpdp/control-plane self-tests passed successfully! ---');
