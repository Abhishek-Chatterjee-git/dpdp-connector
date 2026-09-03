import { Socket } from 'node:net';

export interface DiscoveredEndpoint {
  targetId: string;
  host: string;
  port: number;
  serviceType: 'POSTGRES' | 'MYSQL' | 'MONGODB' | 'REDIS' | 'IMAP_MAIL' | 'SMTP_MAIL' | 'SQLITE' | 'UNKNOWN';
  status: 'ONLINE' | 'OFFLINE' | 'FILTERED';
  responseTimeMs: number;
  details?: string;
}

export interface NetworkProbeConfig {
  targetHosts: string[];
  portsToScan?: number[];
  timeoutMs?: number;
}

const DEFAULT_PORT_MAP: Record<number, DiscoveredEndpoint['serviceType']> = {
  5432: 'POSTGRES',
  3306: 'MYSQL',
  27017: 'MONGODB',
  6379: 'REDIS',
  993: 'IMAP_MAIL',
  143: 'IMAP_MAIL',
  587: 'SMTP_MAIL',
  465: 'SMTP_MAIL',
};

export class NetworkProbeEngine {
  private timeoutMs: number;

  constructor(timeoutMs: number = 2000) {
    this.timeoutMs = timeoutMs;
  }

  async probeEndpoint(host: string, port: number): Promise<DiscoveredEndpoint> {
    const startTime = performance.now();
    const serviceType = DEFAULT_PORT_MAP[port] || 'UNKNOWN';
    const targetId = `${serviceType.toLowerCase()}_${host.replace(/[^a-zA-Z0-9]/g, '_')}_${port}`;

    return new Promise((resolve) => {
      const socket = new Socket();
      socket.setTimeout(this.timeoutMs);

      socket.on('connect', () => {
        const responseTimeMs = Math.round(performance.now() - startTime);
        socket.destroy();
        resolve({
          targetId,
          host,
          port,
          serviceType,
          status: 'ONLINE',
          responseTimeMs,
          details: `Active connection established on port ${port}`,
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          targetId,
          host,
          port,
          serviceType,
          status: 'FILTERED',
          responseTimeMs: this.timeoutMs,
          details: 'Connection timed out',
        });
      });

      socket.on('error', (err) => {
        socket.destroy();
        resolve({
          targetId,
          host,
          port,
          serviceType,
          status: 'OFFLINE',
          responseTimeMs: Math.round(performance.now() - startTime),
          details: err.message,
        });
      });

      socket.connect(port, host);
    });
  }

  async scanNetwork(config: NetworkProbeConfig): Promise<DiscoveredEndpoint[]> {
    const ports = config.portsToScan || [5432, 3306, 27017, 6379, 993, 143];
    const results: DiscoveredEndpoint[] = [];

    for (const host of config.targetHosts) {
      const promises = ports.map((port) => this.probeEndpoint(host, port));
      const hostResults = await Promise.all(promises);
      results.push(...hostResults);
    }

    return results;
  }
}
