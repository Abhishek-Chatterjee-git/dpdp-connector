import { ControlPlaneServer } from './server.js';

export * from './storage/db.js';
export * from './services/ledger.service.js';
export * from './services/agent.service.js';
export * from './services/catalog.service.js';
export * from './services/consent.service.js';
export * from './services/dsr.service.js';
export * from './services/compliance.service.js';
export * from './server.js';

// If run directly
if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  const port = parseInt(process.env.CONTROL_PLANE_PORT || '4000', 10);
  const server = new ControlPlaneServer(port);

  server.start().catch((err) => {
    console.error('Fatal error starting Control Plane:', err);
    process.exit(1);
  });

  process.on('SIGINT', async () => {
    console.log('\nShutting down Control Plane...');
    await server.stop();
    process.exit(0);
  });
}
