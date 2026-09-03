import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { URL } from 'node:url';
import {
  AgentRegistrationRequest,
  AgentRegistrationResponse,
  AgentStatus,
  AgentTask,
  DiscoveryReport,
  DsrTask,
  DsrExecutionReceipt,
} from '@dpdp/shared';
import { AgentConfig, loadAgentConfig } from './config.js';
import { DatabaseAdapter, SqliteAdapter, PostgresAdapter } from './db/connector.js';
import { PiiDiscoveryScanner } from './discovery/scanner.js';
import { InMemoryConsentCache } from './consent/cache.js';
import { DsrExecutor } from './dsr/executor.js';

export class ZoneAgentDaemon {
  private config: AgentConfig;
  private adapter: DatabaseAdapter;
  private consentCache: InMemoryConsentCache;
  private scanner: PiiDiscoveryScanner;
  private dsrExecutor: DsrExecutor;
  private status: AgentStatus = 'ACTIVE';
  private agentToken: string = '';
  private lastDdlChecksum: string = '';
  private server: Server | null = null;
  private isRunning: boolean = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private ddlCheckTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<AgentConfig>, customAdapter?: DatabaseAdapter) {
    this.config = { ...loadAgentConfig(), ...config };

    if (customAdapter) {
      this.adapter = customAdapter;
    } else if (this.config.dbType === 'POSTGRES') {
      this.adapter = new PostgresAdapter(this.config.dbConnectionString);
    } else {
      this.adapter = new SqliteAdapter(this.config.dbConnectionString);
    }

    this.consentCache = new InMemoryConsentCache();
    this.scanner = new PiiDiscoveryScanner(this.adapter, {
      agentId: this.config.agentId,
      targetId: `target-${this.config.dbType.toLowerCase()}`,
      targetType: this.config.dbType,
      targetUriMasked: this.config.dbConnectionString.replace(/:[^:@]+@/, ':****@'),
      sampleLimit: this.config.sampleRowLimit,
    });
    this.dsrExecutor = new DsrExecutor(
      this.adapter,
      this.config.agentId,
      this.config.agentSecret
    );
  }

  /**
   * Starts the agent HTTP listener and background loops.
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    await this.adapter.connect();

    // 1. Start local HTTP API for hot-path apps and sidecar calls
    await this.startHttpServer();

    // 2. Initial Discovery Scan
    await this.runInitialScan();

    // 3. Register with Control Plane (outbound)
    await this.registerWithControlPlane();

    // 4. Start Heartbeat & DDL Check loops
    this.startBackgroundLoops();

    console.log(`[Agent Daemon] Zone Agent '${this.config.agentId}' running on port ${this.config.agentPort}`);
  }

  /**
   * Stops the agent gracefully.
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.ddlCheckTimer) clearInterval(this.ddlCheckTimer);

    if (this.server) {
      await new Promise<void>((resolve) => this.server?.close(() => resolve()));
      this.server = null;
    }

    await this.adapter.close();
    console.log('[Agent Daemon] Zone Agent stopped gracefully.');
  }

  getConsentCache(): InMemoryConsentCache {
    return this.consentCache;
  }

  getDiscoveryScanner(): PiiDiscoveryScanner {
    return this.scanner;
  }

  getDsrExecutor(): DsrExecutor {
    return this.dsrExecutor;
  }

  private async startHttpServer(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((req, res) => this.handleHttpRequest(req, res));
      this.server.listen(this.config.agentPort, () => {
        resolve();
      });
    });
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = new URL(req.url || '/', `http://localhost:${this.config.agentPort}`);
    const pathname = parsedUrl.pathname;
    const method = req.method?.toUpperCase();

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // 1. Health & Status
      if (method === 'GET' && pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            agentId: this.config.agentId,
            agentStatus: this.status,
            cacheStats: this.consentCache.getStats(),
            ddlChecksum: this.lastDdlChecksum,
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      // 2. Hot-Path Consent Check: GET /consent/check?principal_id=...&purpose=...
      if (method === 'GET' && (pathname === '/consent/check' || pathname === '/api/v1/consent/check')) {
        const principalId = parsedUrl.searchParams.get('principal_id') || parsedUrl.searchParams.get('userId') || '';
        const purposeId = parsedUrl.searchParams.get('purpose') || parsedUrl.searchParams.get('purposeId') || 'essential';

        if (!principalId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required query parameter: principal_id' }));
          return;
        }

        const checkResult = this.consentCache.check(principalId, purposeId);
        const statusCode = checkResult.allowed ? 200 : 403;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(checkResult));
        return;
      }

      // 3. Set/Seed Consent Cache: POST /consent/cache/set
      if (method === 'POST' && pathname === '/consent/cache/set') {
        const body = await this.readJsonBody(req);
        if (!body.principalId || !body.purposes) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required fields: principalId, purposes' }));
          return;
        }

        this.consentCache.set(
          body.principalId,
          body.noticeVersion || 'v1.0',
          body.purposes,
          body.ttlMs
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Consent cached successfully' }));
        return;
      }

      // 4. Invalidate Consent Cache: POST /consent/cache/invalidate
      if (method === 'POST' && pathname === '/consent/cache/invalidate') {
        const body = await this.readJsonBody(req);
        if (!body.principalId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required field: principalId' }));
          return;
        }

        const evicted = this.consentCache.invalidate(body.principalId, body.purposesWithdrawn);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, evicted }));
        return;
      }

      // 5. On-Demand Discovery Trigger: POST /discovery/trigger
      if (method === 'POST' && pathname === '/discovery/trigger') {
        const report = await this.runInitialScan();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, report }));
        return;
      }

      // Not Found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err?.message || 'Internal Server Error' }));
    }
  }

  private readJsonBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          reject(new Error('Invalid JSON payload'));
        }
      });
      req.on('error', reject);
    });
  }

  private async runInitialScan(): Promise<DiscoveryReport> {
    this.status = 'SCANNING';
    try {
      const report = await this.scanner.scan();
      this.lastDdlChecksum = report.overallDdlChecksum;
      this.status = 'DORMANT'; // Returns to dormant state after scan

      // If control plane is reachable, submit report
      await this.submitDiscoveryReport(report);
      return report;
    } catch (err) {
      this.status = 'ERROR';
      console.error('[Agent Daemon] Discovery scan error:', err);
      throw err;
    }
  }

  private async registerWithControlPlane(): Promise<void> {
    try {
      const payload: AgentRegistrationRequest = {
        agentId: this.config.agentId,
        agentName: this.config.agentName,
        version: '1.0.0',
        environment: this.config.environment,
        targetEndpoints: [this.config.dbConnectionString.replace(/:[^:@]+@/, ':****@')],
      };

      const res = await fetch(`${this.config.controlPlaneUrl}/api/v1/agent/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = (await res.json()) as AgentRegistrationResponse;
        this.agentToken = data.agentToken;
        console.log(`[Agent Daemon] Registered with Control Plane. Token: ${this.agentToken.slice(0, 8)}...`);
      }
    } catch (err) {
      console.warn('[Agent Daemon] Control plane not currently reachable for registration, will retry on heartbeat.');
    }
  }

  private startBackgroundLoops(): void {
    // Heartbeat loop
    this.heartbeatTimer = setInterval(async () => {
      await this.sendHeartbeat();
    }, this.config.heartbeatIntervalMs);

    // DDL checksum dormancy watcher loop
    this.ddlCheckTimer = setInterval(async () => {
      await this.checkDdlDrift();
    }, this.config.ddlCheckIntervalMs);
  }

  private async sendHeartbeat(): Promise<void> {
    try {
      const res = await fetch(`${this.config.controlPlaneUrl}/api/v1/agent/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.agentToken}`,
        },
        body: JSON.stringify({
          agentId: this.config.agentId,
          status: this.status,
          ddlChecksum: this.lastDdlChecksum,
          cacheStats: this.consentCache.getStats(),
          timestamp: new Date().toISOString(),
        }),
      });

      if (res.ok) {
        const tasks = (await res.json()) as { tasks?: AgentTask[] };
        if (tasks.tasks && tasks.tasks.length > 0) {
          for (const task of tasks.tasks) {
            await this.processIncomingTask(task);
          }
        }
      }
    } catch (err) {
      // Control plane offline / transient failure - silent continue
    }
  }

  private async checkDdlDrift(): Promise<void> {
    try {
      const currentChecksum = await this.adapter.getDdlChecksum();
      if (this.lastDdlChecksum && currentChecksum !== this.lastDdlChecksum) {
        console.log('[Agent Daemon] Schema drift detected! Triggering discovery re-scan...');
        await this.runInitialScan();
      } else {
        // Schema unchanged - remain in low-memory dormant sleep
        this.status = 'DORMANT';
      }
    } catch (err) {
      console.error('[Agent Daemon] Failed to check DDL checksum:', err);
    }
  }

  private async processIncomingTask(task: AgentTask): Promise<void> {
    console.log(`[Agent Daemon] Processing task: ${task.type} (${task.taskId})`);

    switch (task.type) {
      case 'TASK_CONSENT_INVALIDATE': {
        const { principalId, purposesWithdrawn } = task.data;
        this.consentCache.invalidate(principalId, purposesWithdrawn);
        console.log(`[Agent Daemon] Invalided cache for principal: ${principalId}`);
        break;
      }
      case 'TASK_DISCOVERY_TRIGGER': {
        await this.runInitialScan();
        break;
      }
      case 'TASK_DSR_EXECUTE': {
        const dsrTask = task.data as DsrTask;
        const receipt = await this.dsrExecutor.executeTask(dsrTask);
        await this.submitDsrProof(receipt);
        break;
      }
    }
  }

  private async submitDiscoveryReport(report: DiscoveryReport): Promise<void> {
    try {
      await fetch(`${this.config.controlPlaneUrl}/api/v1/agent/discovery/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.agentToken}`,
        },
        body: JSON.stringify(report),
      });
      console.log(`[Agent Daemon] Discovery metadata submitted to Control Plane (${report.tables.length} tables).`);
    } catch (err) {
      // Control plane not available yet
    }
  }

  private async submitDsrProof(receipt: DsrExecutionReceipt): Promise<void> {
    try {
      await fetch(`${this.config.controlPlaneUrl}/api/v1/agent/dsr/proof`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.agentToken}`,
        },
        body: JSON.stringify(receipt),
      });
      console.log(`[Agent Daemon] DSR execution receipt submitted for task ${receipt.taskId}`);
    } catch (err) {
      console.error('[Agent Daemon] Failed to submit DSR receipt:', err);
    }
  }
}
