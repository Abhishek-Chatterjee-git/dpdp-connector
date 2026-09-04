import { pathToFileURL } from 'node:url';
import { EnterpriseDatabase } from './db.js';
import { EcomServer } from './server.js';
import { AdminPortalServer } from './admin-server.js';

export { EnterpriseDatabase } from './db.js';
export { EcomServer } from './server.js';
export { AdminPortalServer } from './admin-server.js';
export { CustomerAuthService } from './auth.js';

async function main() {
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

  // Keep process running
  process.on('SIGINT', async () => {
    console.log('\nStopping servers...');
    await ecomServer.stop();
    await adminServer.stop();
    process.exit(0);
  });
}

// Robust execution check across Windows, macOS, Linux
if (
  process.argv[1] &&
  (import.meta.url === pathToFileURL(process.argv[1]).href ||
   process.argv[1].replace(/\\/g, '/').endsWith('src/index.ts') ||
   process.argv[1].replace(/\\/g, '/').endsWith('dist/index.js'))
) {
  main().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}
