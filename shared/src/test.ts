import assert from 'node:assert';
import {
  canonicalJson,
  sha256,
  createLedgerBlock,
  verifyLedgerChain,
  validateVerhoeff,
  generateVerhoeffCheckDigit,
  validateLuhn,
  classifySingleValue,
  classifyColumnSample,
  maskSensitiveValue,
  LedgerBlock,
} from './index.js';

console.log('--- Running @dpdp/shared self-test ---');

// 1. Canonical JSON & Hashing
console.log('Test 1: Canonical JSON determinism');
const obj1 = { b: 2, a: 1, nested: { z: 10, y: 20 } };
const obj2 = { nested: { y: 20, z: 10 }, a: 1, b: 2 };
assert.strictEqual(canonicalJson(obj1), canonicalJson(obj2));
assert.strictEqual(canonicalJson(obj1), '{"a":1,"b":2,"nested":{"y":20,"z":10}}');

// 2. Verhoeff Aadhaar Checksum
console.log('Test 2: Verhoeff Aadhaar algorithm');
// Valid Verhoeff samples
assert.strictEqual(validateVerhoeff('236'), true); // 23 with check digit 6
assert.strictEqual(validateVerhoeff('237'), false);
// Generate check digit for 99991234567 -> then validate
const raw9 = '99991234567';
const cd = generateVerhoeffCheckDigit(raw9);
const fullAadhaar = `${raw9}${cd}`;
assert.strictEqual(validateVerhoeff(fullAadhaar), true);
assert.strictEqual(validateVerhoeff(`${raw9}${(cd + 1) % 10}`), false);

// 3. Luhn Card Checksum
console.log('Test 3: Luhn Credit Card algorithm');
assert.strictEqual(validateLuhn('49927398716'), true);
assert.strictEqual(validateLuhn('49927398717'), false);

// 4. PII Classifiers & Masking
console.log('Test 4: PII Classifiers');
assert.strictEqual(classifySingleValue('test.user@example.com'), 'EMAIL');
assert.strictEqual(classifySingleValue('ABCDE1234F'), 'PAN');
assert.strictEqual(classifySingleValue('9876543210'), 'PHONE');
assert.strictEqual(classifySingleValue('+919876543210'), 'PHONE');
assert.strictEqual(classifySingleValue(fullAadhaar), 'AADHAAR');
assert.strictEqual(classifySingleValue('4532015112830366'), 'CREDIT_CARD');
assert.strictEqual(classifySingleValue('random_text_123'), 'UNKNOWN');

// Masking
assert.strictEqual(maskSensitiveValue('test.user@example.com', 'EMAIL'), 't***r@example.com');
assert.strictEqual(maskSensitiveValue('9876543210', 'PHONE'), '98******10');

// Column classification
const colResult = classifyColumnSample('contact_email', [
  'alice@example.com',
  'bob@corp.in',
  'charlie@gmail.com',
]);
assert.strictEqual(colResult.piiType, 'EMAIL');
assert.strictEqual(colResult.matchCount, 3);
assert.ok(colResult.confidence >= 0.9);

// 5. Cryptographic Ledger Chain Verification
console.log('Test 5: Tamper-evident Ledger Chain');
const chain: LedgerBlock[] = [];

// Genesis Block
const block0 = createLedgerBlock(
  null,
  'AGENT_REGISTERED',
  'tenant-default',
  { agentId: 'agent-01', agentName: 'VPC-Mumbai-Agent' },
  undefined,
  '2026-09-03T12:00:00.000Z'
);
chain.push(block0);

// Block 1
const block1 = createLedgerBlock(
  block0,
  'CONSENT_GRANTED',
  'tenant-default',
  { purposes: ['essential', 'marketing'] },
  'hash_principal_123',
  '2026-09-03T12:01:00.000Z'
);
chain.push(block1);

// Block 2
const block2 = createLedgerBlock(
  block1,
  'DSR_ERASURE_COMPLETED',
  'tenant-default',
  { recordsAffected: 1, status: 'SUCCESS' },
  'hash_principal_123',
  '2026-09-03T12:02:00.000Z'
);
chain.push(block2);

// Verify chain integrity
const verifyValid = verifyLedgerChain(chain);
assert.strictEqual(verifyValid.valid, true);

// Tamper test: Alter block 1 payload
const tamperedChain = JSON.parse(JSON.stringify(chain)) as LedgerBlock[];
tamperedChain[1].payload = { purposes: ['essential'] }; // Tampered!
const verifyTampered = verifyLedgerChain(tamperedChain);
assert.strictEqual(verifyTampered.valid, false);
assert.strictEqual(verifyTampered.invalidIndex, 1);
assert.ok(verifyTampered.error?.includes('tampered'));

console.log('--- ALL @dpdp/shared self-tests passed successfully! ---');
