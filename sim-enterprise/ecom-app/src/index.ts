import { EnterpriseDatabase } from './db.js';
import { EcomServer } from './server.js';
import { AdminPortalServer } from './admin-server.js';

export { EnterpriseDatabase } from './db.js';
export { EcomServer } from './server.js';
export { AdminPortalServer } from './admin-server.js';
export { CustomerAuthService } from './auth.js';

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = new EnterpriseDatabase();
  const ecomPort = parseInt(process.env.ECOM_PORT || '3000', 10);
  const adminPort = parseInt(process.env.ADMIN_PORT || '3001', 10);

  const ecomServer = new EcomServer({ port: ecomPort }, db);
  const adminServer = new AdminPortalServer(adminPort, db);

  await ecomServer.start();
  await adminServer.start();

  console.log('===============================================================');
  console.log(`🛍️ Customer Storefront : http://localhost:${ecomPort}`);
  console.log(`🔒 Enterprise Admin Portal: http://localhost:${adminPort}`);
  console.log('===============================================================');
}
