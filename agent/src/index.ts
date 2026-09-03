import { ZoneAgentDaemon } from './daemon.js';

export * from './config.js';
export * from './db/connector.js';
export * from './discovery/scanner.js';
export * from './discovery/probe.js';
export * from './consent/cache.js';
export * from './dsr/executor.js';
export * from './daemon.js';

// If run directly via CLI / container
if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  const daemon = new ZoneAgentDaemon();
  daemon.start().catch((err) => {
    console.error('Fatal error starting Zone Agent:', err);
    process.exit(1);
  });

  process.on('SIGINT', async () => {
    console.log('\nShutting down Zone Agent...');
    await daemon.stop();
    process.exit(0);
  });
}
