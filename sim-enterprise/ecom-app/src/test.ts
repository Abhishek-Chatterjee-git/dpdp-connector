import assert from 'node:assert';
import { EnterpriseDatabase } from './db.js';
import { EcomServer } from './server.js';
import { AdminPortalServer } from './admin-server.js';

console.log('--- Running @dpdp/ecom-app (Production Enterprise App Suite) self-test ---');

const ecomTestPort = 3088;
const adminTestPort = 3089;
const db = new EnterpriseDatabase(':memory:');

const ecomServer = new EcomServer({ port: ecomTestPort }, db);
const adminServer = new AdminPortalServer(adminTestPort, db);

await ecomServer.start();
await adminServer.start();

// 1. Test Product Catalog
console.log('Test 1: Artisan Catalog Fetch from Database');
const catRes = await fetch(`http://127.0.0.1:${ecomTestPort}/api/catalog/products`);
assert.strictEqual(catRes.status, 200);
const catData = (await catRes.json()) as any;
assert.ok(catData.products.length >= 4);
const initialStock = catData.products[0].stock;

// 2. Test Customer Registration with DPDP Notice
console.log('Test 2: Customer Signup & DPDP Statutory Notice Acceptance');
const signupRes = await fetch(`http://127.0.0.1:${ecomTestPort}/api/auth/signup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fullName: 'Ananya Sharma',
    email: 'ananya.sharma@test.in',
    password: 'SecurePassword@2025',
    phone: '9876543210',
    streetAddress: '12 Indiranagar 100ft Road',
    city: 'Bengaluru',
    consents: ['essential', 'marketing_promo'],
  }),
});

assert.strictEqual(signupRes.status, 200);
const signupData = (await signupRes.json()) as any;
assert.strictEqual(signupData.success, true);
assert.strictEqual(signupData.user.fullName, 'Ananya Sharma');
assert.ok(signupData.session.token);

const userId = signupData.user.id;

// 3. Test Customer Login
console.log('Test 3: Customer Login with Password Authentication');
const loginRes = await fetch(`http://127.0.0.1:${ecomTestPort}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'ananya.sharma@test.in',
    password: 'SecurePassword@2025',
  }),
});

assert.strictEqual(loginRes.status, 200);
const loginData = (await loginRes.json()) as any;
assert.strictEqual(loginData.user.email, 'ananya.sharma@test.in');

// 4. Test Shopping Cart Checkout & Stock Decrement
console.log('Test 4: Customer Order Checkout & Database Persistence');
const orderRes = await fetch(`http://127.0.0.1:${ecomTestPort}/api/cart/checkout`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId,
    items: [{ id: catData.products[0].id, title: catData.products[0].title, price: catData.products[0].price, qty: 2 }],
    totalAmount: catData.products[0].price * 2,
    shippingAddress: '12 Indiranagar 100ft Road, Bengaluru',
  }),
});

assert.strictEqual(orderRes.status, 200);
const orderData = (await orderRes.json()) as any;
assert.strictEqual(orderData.status, 'CONFIRMED');
assert.ok(orderData.orderId);

// Verify stock decremented
const catRes2 = await fetch(`http://127.0.0.1:${ecomTestPort}/api/catalog/products`);
const catData2 = (await catRes2.json()) as any;
assert.strictEqual(catData2.products[0].stock, initialStock - 2);

// 5. Test Admin Portal Inventory & Order Management
console.log('Test 5: Admin Portal Inventory & Order Viewing');
const adminOrdersRes = await fetch(`http://127.0.0.1:${adminTestPort}/api/admin/orders`);
assert.strictEqual(adminOrdersRes.status, 200);
const adminOrdersData = (await adminOrdersRes.json()) as any;
assert.ok(adminOrdersData.orders.length >= 1);
assert.strictEqual(adminOrdersData.orders[0].customer_email, 'ananya.sharma@test.in');

// 6. Test Admin Add Product
console.log('Test 6: Admin Adding Product to Catalog');
const addProdRes = await fetch(`http://127.0.0.1:${adminTestPort}/api/admin/inventory/add`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Kashmiri Walnut Wood Carved Box',
    category: 'Home & Living',
    emoji: '🪵',
    price: 3899.00,
    stock: 12,
    description: 'Handcrafted seasoned walnut wood with traditional chinar leaf motif.',
  }),
});
assert.strictEqual(addProdRes.status, 200);

// 7. Test Right to Access Data Export (DPDP Section 11)
console.log('Test 7: Customer Data Portability Export');
const exportRes = await fetch(`http://127.0.0.1:${ecomTestPort}/api/privacy/data-export?userId=${userId}`);
assert.strictEqual(exportRes.status, 200);
const exportData = (await exportRes.json()) as any;
assert.strictEqual(exportData.profile.email, 'ananya.sharma@test.in');
assert.strictEqual(exportData.orderHistory.length, 1);

// 8. Test Right to Erasure
console.log('Test 8: Customer Right to Erasure Execution');
const erasureRes = await fetch(`http://127.0.0.1:${ecomTestPort}/api/privacy/dsr/erasure`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId }),
});
assert.strictEqual(erasureRes.status, 200);
const erasureData = (await erasureRes.json()) as any;
assert.strictEqual(erasureData.status, 'COLD_RETENTION_QUARANTINE');

await ecomServer.stop();
await adminServer.stop();

console.log('--- ALL @dpdp/ecom-app production application tests passed successfully! ---');
