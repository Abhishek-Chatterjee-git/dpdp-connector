import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { URL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { ControlPlaneStorage } from './storage/db.js';
import { LedgerService } from './services/ledger.service.js';
import { AgentService } from './services/agent.service.js';
import { CatalogService } from './services/catalog.service.js';
import { ConsentService } from './services/consent.service.js';
import { DsrService } from './services/dsr.service.js';
import { ComplianceService } from './services/compliance.service.js';
import { DpoAuthService } from './services/auth.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ControlPlaneServer {
  private port: number;
  private storage: ControlPlaneStorage;
  private ledgerService: LedgerService;
  private agentService: AgentService;
  private catalogService: CatalogService;
  private consentService: ConsentService;
  private dsrService: DsrService;
  private complianceService: ComplianceService;
  private authService: DpoAuthService;
  private server: Server | null = null;
  private publicDir: string;

  constructor(port: number = 4000, storage?: ControlPlaneStorage) {
    this.port = port;
    this.storage = storage || new ControlPlaneStorage();
    this.ledgerService = new LedgerService(this.storage);
    this.agentService = new AgentService(this.storage, this.ledgerService);
    this.catalogService = new CatalogService(this.storage, this.ledgerService);
    this.consentService = new ConsentService(
      this.storage,
      this.ledgerService,
      this.agentService
    );
    this.dsrService = new DsrService(
      this.storage,
      this.ledgerService,
      this.agentService,
      this.catalogService
    );
    this.complianceService = new ComplianceService(
      this.catalogService,
      this.consentService,
      this.dsrService,
      this.ledgerService,
      this.agentService
    );
    this.authService = new DpoAuthService(this.storage, this.ledgerService);

    this.publicDir = join(__dirname, '../public');
  }

  async start(): Promise<void> {
    await this.storage.init();
    this.authService.init();

    return new Promise((resolve) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(this.port, () => {
        console.log(`[Control Plane] DPDP DPO Server & Dashboard running at http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server?.close(() => resolve()));
      this.server = null;
    }
    await this.storage.close();
  }

  getServices() {
    return {
      storage: this.storage,
      ledger: this.ledgerService,
      agent: this.agentService,
      catalog: this.catalogService,
      consent: this.consentService,
      dsr: this.dsrService,
      compliance: this.complianceService,
    };
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = new URL(req.url || '/', `http://localhost:${this.port}`);
    const pathname = parsedUrl.pathname;
    const method = req.method?.toUpperCase();

    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // --- API Routes ---
      if (pathname.startsWith('/api/')) {
        await this.handleApiRoutes(pathname, method || 'GET', req, res, parsedUrl);
        return;
      }

      // --- Static Web Dashboard ---
      this.serveStaticFile(pathname, res);
    } catch (err: any) {
      console.error('[Control Plane] Request error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err?.message || 'Internal Server Error' }));
    }
  }

  private async handleApiRoutes(
    pathname: string,
    method: string,
    req: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): Promise<void> {
    const json = (data: any, status: number = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    // 1. Agent Registration: POST /api/v1/agent/register
    if (method === 'POST' && pathname === '/api/v1/agent/register') {
      const body = await this.readJsonBody(req);
      const regRes = this.agentService.registerAgent(body);
      return json(regRes);
    }

    // 2. Agent Heartbeat & Task Exchange: POST /api/v1/agent/heartbeat
    if (method === 'POST' && pathname === '/api/v1/agent/heartbeat') {
      const body = await this.readJsonBody(req);
      const hbRes = this.agentService.processHeartbeat(
        body.agentId,
        body.status,
        body.ddlChecksum,
        body.cacheStats
      );
      return json(hbRes);
    }

    // 3. Agent Discovery Metadata Submit: POST /api/v1/agent/discovery/submit
    if (method === 'POST' && pathname === '/api/v1/agent/discovery/submit') {
      const body = await this.readJsonBody(req);
      this.catalogService.ingestDiscoveryReport(body);
      return json({ success: true, message: 'Discovery metadata ingested' });
    }

    // 4. Agent DSR Proof Submit: POST /api/v1/agent/dsr/proof
    if (method === 'POST' && pathname === '/api/v1/agent/dsr/proof') {
      const body = await this.readJsonBody(req);
      const success = this.dsrService.processDsrReceipt(body);
      return json({ success });
    }

    // 5. Consent Registration (User signup): POST /api/v1/consent/record
    if (method === 'POST' && pathname === '/api/v1/consent/record') {
      const body = await this.readJsonBody(req);
      const state = this.consentService.recordConsent(
        body.principalId,
        body.noticeVersion || 'v1.0',
        body.purposes || ['essential'],
        body.channel || 'web_signup'
      );
      return json({ success: true, consent: state });
    }

    // 6. Consent Withdrawal (User portal): POST /api/v1/consent/withdraw
    if (method === 'POST' && pathname === '/api/v1/consent/withdraw') {
      const body = await this.readJsonBody(req);
      const result = this.consentService.withdrawConsent(
        body.principalId,
        body.purposesWithdrawn || ['*'],
        body.reason || 'user_requested'
      );
      return json(result);
    }

    // 7. Get Principal Consent: GET /api/v1/consent/state?principal_id=...
    if (method === 'GET' && pathname === '/api/v1/consent/state') {
      const principalId = url.searchParams.get('principal_id') || '';
      const consent = this.consentService.getConsent(principalId);
      if (!consent) return json({ error: 'Consent not found' }, 404);
      return json(consent);
    }

    // 8. DPO Dashboard Overview: GET /api/v1/dpo/overview
    if (method === 'GET' && pathname === '/api/v1/dpo/overview') {
      const report = this.complianceService.getComplianceReport();
      const agents = this.agentService.getAgents();
      const dataMap = this.catalogService.getDataMap();
      const consents = this.consentService.getAllConsents().slice(0, 10);
      const dsrs = this.dsrService.getDsrRequests().slice(0, 10);
      const latestBlock = this.ledgerService.getLatestBlock();

      return json({
        compliance: report,
        agents,
        dataMap,
        recentConsents: consents,
        recentDsrs: dsrs,
        latestBlock,
      });
    }

    // 9. DPO Data Map: GET /api/v1/dpo/datamap
    if (method === 'GET' && pathname === '/api/v1/dpo/datamap') {
      return json({ tables: this.catalogService.getDataMap() });
    }

    // 10. DPO Update Column Purpose: POST /api/v1/dpo/datamap/update-column
    if (method === 'POST' && pathname === '/api/v1/dpo/datamap/update-column') {
      const body = await this.readJsonBody(req);
      const success = this.catalogService.updateColumnPurpose(
        body.tableName,
        body.columnName,
        body.purposeTags,
        body.overridePii
      );
      return json({ success });
    }

    // 11. DPO Trigger Rescan: POST /api/v1/dpo/agent/trigger-scan
    if (method === 'POST' && pathname === '/api/v1/dpo/agent/trigger-scan') {
      const body = await this.readJsonBody(req);
      const taskId = this.agentService.queueTask(body.agentId, 'TASK_DISCOVERY_TRIGGER', {});
      return json({ success: true, taskId });
    }

    // 12. DPO Create DSR Request: POST /api/v1/dpo/dsr/create
    if (method === 'POST' && pathname === '/api/v1/dpo/dsr/create') {
      const body = await this.readJsonBody(req);
      const dsr = await this.dsrService.createDsrRequest(
        body.principalId,
        body.requestType || 'ERASURE',
        body.requestedBy || 'DPO_PORTAL'
      );
      return json({ success: true, dsr });
    }

    // 13. DPO Audit Ledger: GET /api/v1/dpo/ledger
    if (method === 'GET' && pathname === '/api/v1/dpo/ledger') {
      const blocks = this.ledgerService.getAllBlocks();
      const integrity = this.ledgerService.verifyIntegrity();
      return json({ blocks, integrity });
    }

    // 14. DPO Ledger Verify: POST /api/v1/dpo/ledger/verify
    if (method === 'POST' && pathname === '/api/v1/dpo/ledger/verify') {
      const result = this.ledgerService.verifyIntegrity();
      return json(result);
    }

    // 15. DPO Auth Login: POST /api/v1/dpo/auth/login
    if (method === 'POST' && pathname === '/api/v1/dpo/auth/login') {
      const body = await this.readJsonBody(req);
      const authRes = this.authService.authenticate(body.username || body.email, body.password);
      if (!authRes.success) {
        return json({ error: authRes.error }, 401);
      }
      return json(authRes);
    }

    // 16. DPO Auth Session Verify: GET /api/v1/dpo/auth/me
    if (method === 'GET' && pathname === '/api/v1/dpo/auth/me') {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const user = this.authService.verifySession(token);
      if (!user) return json({ error: 'Unauthorized or expired session' }, 401);
      return json({ user });
    }

    // 17. DPO Agent Enrollment Script Generator: GET /api/v1/dpo/enrollment-script
    if (method === 'GET' && pathname === '/api/v1/dpo/enrollment-script') {
      const agentId = url.searchParams.get('agent_id') || `agent-vpc-${Date.now().toString(36)}`;
      const targetSubnet = url.searchParams.get('subnet') || '192.168.1.0/24';
      const cpHost = req.headers.host || `localhost:${this.port}`;
      const cpUrl = `http://${cpHost}`;

      const dockerCommand = `docker run -d --name dpdp-zone-agent \\\n  --restart unless-stopped \\\n  -e AGENT_ID="${agentId}" \\\n  -e AGENT_NAME="Proxmox-VPC-Zone-Agent" \\\n  -e CONTROL_PLANE_URL="${cpUrl}" \\\n  -e PROBE_SUBNET="${targetSubnet}" \\\n  -p 5000:5000 \\\n  dpdp-zone-agent:latest`;

      const bashScript = `#!/usr/bin/env bash\n# DPDP Zone Agent Auto-Enrollment Script\nexport AGENT_ID="${agentId}"\nexport CONTROL_PLANE_URL="${cpUrl}"\nexport PROBE_SUBNET="${targetSubnet}"\n\necho "Enrolling DPDP Zone Agent: $AGENT_ID with Control Plane at $CONTROL_PLANE_URL..."\n${dockerCommand}\n`;

      return json({
        agentId,
        controlPlaneUrl: cpUrl,
        dockerCommand,
        bashScript,
      });
    }

    // 18. Public Statutory Notice: GET /api/v1/public/notice/current
    if (method === 'GET' && pathname === '/api/v1/public/notice/current') {
      return json({
        version: 'v2.1_dpdp2025',
        title: 'Statutory Digital Personal Data Protection Notice',
        publishedAt: '2025-01-01T00:00:00.000Z',
        statutoryAuthority: 'Data Protection Board of India',
        purposes: [
          { code: 'essential', label: 'Order Processing & Statutory Invoicing', mandatory: true },
          { code: 'marketing_promo', label: 'Discount Deals & Direct Marketing SMS', mandatory: false },
          { code: 'third_party_analytics', label: 'Storefront Optimization & Analytics', mandatory: false },
        ],
        dpoContact: {
          name: 'Ananya Iyer',
          email: 'dpo@enterprise-corp.in',
          office: 'Cyber Governance Cell, Bengaluru',
        },
      });
    }

    json({ error: 'API endpoint not found' }, 404);
  }

  private serveStaticFile(pathname: string, res: ServerResponse): void {
    let filePath = join(this.publicDir, pathname === '/' ? 'index.html' : pathname);

    if (!existsSync(filePath)) {
      filePath = join(this.publicDir, 'index.html');
    }

    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('DPO Dashboard files not found');
      return;
    }

    const ext = extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const content = readFileSync(filePath);

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
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
}
