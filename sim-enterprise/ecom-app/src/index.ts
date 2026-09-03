import { EcomServer } from './server.js';

export * from './db.js';
export * from './server.js';

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  const server = new EcomServer();
  server.start().catch((err) => {
    console.error('Fatal error starting E-Commerce App:', err);
    process.exit(1);
  });

  process.on('SIGINT', async () => {
    console.log('\nShutting down E-Commerce App...');
    await server.stop();
    process.exit(0);
  });
}
