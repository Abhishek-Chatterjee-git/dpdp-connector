import assert from 'node:assert';
import { EcomDatabase } from './db.js';
import { EcomServer } from './server.js';

console.log('--- Running @dpdp/ecom-app self-test ---');

const testPort = 3055;
const db = new EcomDatabase(':memory:');
const server = new EcomServer(
  {
    port: testPort,
    agentUrl: 'http://127.0.0.1:9999', // dummy
    controlPlaneUrl: 'http://127.0.0.1:9998', // dummy
  },
  db
);

await server.start();

// 1. Test Demo User Login
console.log('Test 1: Demo Customer Login');
const loginRes = await fetch(`http://127.0.0.1:${testPort}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'aarav.sharma@example.com' }),
});

assert.strictEqual(loginRes.status, 200);
const loginData = (await loginRes.json()) as any;
assert.strictEqual(loginData.user.fullName, 'Aarav Sharma');
assert.ok(loginData.user.paymentMethods.length > 0);
assert.ok(loginData.user.orders.length > 0);

// 2. Test Customer Signup with DPDP Consent
console.log('Test 2: Customer Signup with DPDP Notice');
const signupRes = await fetch(`http://127.0.0.1:${testPort}/api/auth/signup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fullName: 'Priya Patel',
    email: 'priya.patel@test.in',
    phone: '9876543211',
    panNo: 'ABCDE5678G',
    streetAddress: '45 Residency Road',
    city: 'Bengaluru',
    consents: ['essential', 'marketing_promo'],
  }),
});

assert.strictEqual(signupRes.status, 200);
const signupData = (await signupRes.json()) as any;
assert.strictEqual(signupData.success, true);
assert.strictEqual(signupData.user.fullName, 'Priya Patel');

// Verify stored in DB
const priyaUser = db.getDb().prepare('SELECT * FROM users WHERE email = ?').get('priya.patel@test.in') as any;
assert.ok(priyaUser);
assert.strictEqual(priyaUser.phone, '9876543211');

// 3. Test Product Catalog
console.log('Test 3: Artisan Catalog Fetch');
const catRes = await fetch(`http://127.0.0.1:${testPort}/api/catalog/products`);
assert.strictEqual(catRes.status, 200);
const catData = (await catRes.json()) as any;
assert.ok(catData.products.length >= 3);

// 4. Test Shopping Cart Checkout & DPDP Statutory Receipt
console.log('Test 4: Shopping Cart Checkout Order Placement');
const orderRes = await fetch(`http://127.0.0.1:${testPort}/api/cart/checkout`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'usr_aarav',
    items: [{ id: 'prod_vase_01', title: 'Handmade Terracotta Vase', price: 2499.00, qty: 1 }],
    totalAmount: 2499.00,
    shippingAddress: '14 MG Road, Bengaluru',
  }),
});
assert.strictEqual(orderRes.status, 200);
const orderData = (await orderRes.json()) as any;
assert.strictEqual(orderData.status, 'ORDER_CONFIRMED');
assert.ok(orderData.dpdpReceipt);

// 5. Test Right to Access Data Export (DPDP Section 11)
console.log('Test 5: Right to Access Personal Data Export');
const exportRes = await fetch(`http://127.0.0.1:${testPort}/api/privacy/data-export?userId=usr_aarav`);
assert.strictEqual(exportRes.status, 200);
const exportData = (await exportRes.json()) as any;
assert.strictEqual(exportData.dataPrincipalId, 'usr_aarav');
assert.ok(exportData.profile);
assert.ok(exportData.paymentInstruments);

// 6. Test Gated Marketing Action (Zone Agent Block fallback)
console.log('Test 6: Gated Marketing Action Handling');
const promoRes = await fetch(`http://127.0.0.1:${testPort}/api/marketing/send-promo-sms`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'usr_aarav' }),
});

// Since agent is offline on dummy port, expect 403 fallback with DPDP notice
assert.strictEqual(promoRes.status, 403);
const promoData = (await promoRes.json()) as any;
assert.strictEqual(promoData.code, 'DPDP_CONSENT_VIOLATION_BLOCKED');

await server.stop();
console.log('--- ALL @dpdp/ecom-app self-tests passed successfully! ---');
