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
  const appMode = (process.env.APP_MODE || 'all').toLowerCase();
  const ecomPort = parseInt(process.env.ECOM_PORT || '3000', 10);
  const adminPort = parseInt(process.env.ADMIN_PORT || '3001', 10);

  let ecomServer: EcomServer | null = null;
  let adminServer: AdminPortalServer | null = null;

  console.log('===============================================================');
  console.log(`🌐 Enterprise App Deployment Mode: ${appMode.toUpperCase()}`);

  if (appMode === 'storefront' || appMode === 'all') {
    ecomServer = new EcomServer({ port: ecomPort }, db);
    await ecomServer.start();
    console.log(`🛍️ Customer Storefront (DMZ) : http://0.0.0.0:${ecomPort}`);
  }

  if (appMode === 'admin' || appMode === 'all') {
    adminServer = new AdminPortalServer(adminPort, db);
    await adminServer.start();
    console.log(`🔒 Enterprise Admin Portal (Employee Net): http://0.0.0.0:${adminPort}`);
  }
  console.log('===============================================================');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nStopping servers...');
    if (ecomServer) await ecomServer.stop();
    if (adminServer) await adminServer.stop();
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
