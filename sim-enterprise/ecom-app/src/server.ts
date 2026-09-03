import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { EcomDatabase } from './db.js';
import { CustomerAuthService } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface EcomServerConfig {
  port: number;
  agentUrl: string;
  controlPlaneUrl: string;
}

export const STORE_CATALOG = [
  {
    id: 'prod_vase_01',
    title: 'Hand-thrown Terracotta Indigo Vase',
    category: 'Home & Living',
    price: 2499.00,
    rating: 4.9,
    emoji: '🏺',
    description: 'Sculpted by master potters from Jaipur using organic earthen clay and natural botanical indigo glaze.',
    stock: 12,
  },
  {
    id: 'prod_mug_02',
    title: 'Wabi-Sabi Ceramic Teaware (Set of 2)',
    category: 'Kitchen & Dining',
    price: 1499.00,
    rating: 4.8,
    emoji: '🍵',
    description: 'Double-fired stoneware mugs featuring unique reactive glaze finishes. Microwave and dishwasher safe.',
    stock: 25,
  },
  {
    id: 'prod_blanket_03',
    title: 'Pure Cashmere Organic Throw Blanket',
    category: 'Textiles & Apparel',
    price: 4999.00,
    rating: 5.0,
    emoji: '🧣',
    description: 'Hand-loomed in the Himalayan valleys from ethically gathered grade-A mountain cashmere wool.',
    stock: 8,
  },
  {
    id: 'prod_lamp_04',
    title: 'Hammered Brass Moroccan Table Lantern',
    category: 'Lighting & Decor',
    price: 3299.00,
    rating: 4.7,
    emoji: '🏮',
    description: 'Intricately perforated brass casing creates warm, mesmerizing ambient geometric shadow projections.',
    stock: 15,
  }
];

export class EcomServer {
  private config: EcomServerConfig;
  private db: EcomDatabase;
  private authService: CustomerAuthService | null = null;
  private server: Server | null = null;
  private publicDir: string;

  constructor(config?: Partial<EcomServerConfig>, db?: EcomDatabase) {
    this.config = {
      port: parseInt(process.env.ECOM_PORT || '3000', 10),
      agentUrl: process.env.AGENT_URL || 'http://127.0.0.1:5000',
      controlPlaneUrl: process.env.CONTROL_PLANE_URL || 'http://127.0.0.1:4000',
      ...config,
    };
    this.db = db || new EcomDatabase();
    this.publicDir = join(__dirname, '../public');
  }

  async start(): Promise<void> {
    await this.db.init();
    this.authService = new CustomerAuthService(this.db.getDb());

    return new Promise((resolve) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(this.config.port, () => {
        console.log(`[E-Commerce App] Production Storefront running at http://localhost:${this.config.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server?.close(() => resolve()));
      this.server = null;
    }
    await this.db.close();
  }

  getDb() {
    return this.db;
  }

  getAuthService() {
    return this.authService;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = new URL(req.url || '/', `http://localhost:${this.config.port}`);
    const pathname = parsedUrl.pathname;
    const method = req.method?.toUpperCase();

    // Standard CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (pathname.startsWith('/api/')) {
        await this.handleApi(pathname, method || 'GET', req, res, parsedUrl);
        return;
      }

      this.serveStaticFile(pathname, res);
    } catch (err: any) {
      console.error('[Ecom App] Request error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err?.message || 'Internal Server Error' }));
    }
  }

  private async handleApi(
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

    const db = this.db.getDb();
    const authService = this.authService!;

    // 1. Product Catalog: GET /api/catalog/products
    if (method === 'GET' && pathname === '/api/catalog/products') {
      return json({ products: STORE_CATALOG });
    }

    // 2. Signup with DPDP Statutory Consent: POST /api/auth/signup
    if (method === 'POST' && pathname === '/api/auth/signup') {
      const body = await this.readJsonBody(req);
      const userId = `usr_${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();

      const { email, password, fullName, phone, aadhaarNo, panNo, streetAddress, city, consents } = body;
      const consentedPurposes: string[] = consents || ['essential'];

      db.prepare(`
        INSERT INTO users (id, email, full_name, phone, aadhaar_no, pan_no, street_address, city, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        email,
        fullName,
        phone,
        aadhaarNo || null,
        panNo || null,
        streetAddress || null,
        city || null,
        now
      );

      // Save password credentials
      authService.setPassword(userId, password || 'Password@123');

      // Create initial payment method
      db.prepare(`
        INSERT INTO payment_methods (id, user_id, card_number, upi_id, is_default, created_at)
        VALUES (?, ?, ?, ?, 1, ?)
      `).run(`pay_${randomUUID().slice(0, 6)}`, userId, '4532015112830366', `${email.split('@')[0]}@okaxis`, now);

      // Sync consent with Control Plane
      try {
        await fetch(`${this.config.controlPlaneUrl}/api/v1/consent/record`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            principalId: userId,
            noticeVersion: 'v2.1_dpdp2025',
            purposes: consentedPurposes,
            channel: 'ecom_web_signup',
          }),
        });
      } catch (e) {
        console.warn('[Ecom App] Control plane sync warning:', e);
      }

      // Seed Zone Agent in-memory consent cache
      try {
        await fetch(`${this.config.agentUrl}/consent/cache/set`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            principalId: userId,
            noticeVersion: 'v2.1_dpdp2025',
            purposes: consentedPurposes,
          }),
        });
      } catch (e) {
        console.warn('[Ecom App] Agent cache seeding warning:', e);
      }

      const loginRes = authService.login(email, password || 'Password@123');

      return json({
        success: true,
        session: loginRes.session,
        user: { id: userId, email, fullName, phone, consentedPurposes },
      });
    }

    // 3. Customer Login: POST /api/auth/login
    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await this.readJsonBody(req);
      const email = body.email || 'aarav.sharma@example.com';
      const password = body.password || 'Aarav@2025';

      const authRes = authService.login(email, password);
      if (!authRes.success) {
        return json({ error: authRes.error }, 401);
      }

      const user = authRes.user!;
      const payments = db.prepare('SELECT * FROM payment_methods WHERE user_id = ?').all(user.id) as unknown as any[];
      const orders = db.prepare('SELECT * FROM orders WHERE user_id = ?').all(user.id) as unknown as any[];

      return json({
        success: true,
        session: authRes.session,
        user: {
          ...user,
          paymentMethods: payments,
          orders,
        },
      });
    }

    // 4. Session Validation: GET /api/auth/me
    if (method === 'GET' && pathname === '/api/auth/me') {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const session = authService.verifySession(token);
      if (!session) return json({ error: 'Unauthorized session' }, 401);

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.userId) as unknown as any;
      if (!user) return json({ error: 'User not found' }, 404);

      const payments = db.prepare('SELECT * FROM payment_methods WHERE user_id = ?').all(user.id) as unknown as any[];
      const orders = db.prepare('SELECT * FROM orders WHERE user_id = ?').all(user.id) as unknown as any[];

      return json({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          phone: user.phone,
          aadhaarNo: user.aadhaar_no,
          panNo: user.pan_no,
          streetAddress: user.street_address,
          city: user.city,
          paymentMethods: payments,
          orders,
        },
      });
    }

    // 5. Checkout & Order Placement: POST /api/cart/checkout
    if (method === 'POST' && pathname === '/api/cart/checkout') {
      const body = await this.readJsonBody(req);
      const { userId, items, totalAmount, shippingAddress } = body;
      const orderId = `ord_${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO orders (id, user_id, items, total_amount, status, created_at)
        VALUES (?, ?, ?, ?, 'ORDER_CONFIRMED', ?)
      `).run(orderId, userId, JSON.stringify(items), totalAmount, now);

      return json({
        success: true,
        orderId,
        status: 'ORDER_CONFIRMED',
        totalAmount,
        estimatedDelivery: new Date(Date.now() + 3 * 24 * 3600 * 1000).toDateString(),
        dpdpReceipt: {
          purpose: 'essential_fulfillment',
          statutoryNotice: 'v2.1_dpdp2025',
          timestamp: now,
        }
      });
    }

    // 6. Right to Access Data Export: GET /api/privacy/data-export
    if (method === 'GET' && pathname === '/api/privacy/data-export') {
      const userId = url.searchParams.get('userId') || 'usr_aarav';
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as any;
      if (!user) return json({ error: 'User not found' }, 404);

      const payments = db.prepare('SELECT * FROM payment_methods WHERE user_id = ?').all(userId) as unknown as any[];
      const orders = db.prepare('SELECT * FROM orders WHERE user_id = ?').all(userId) as unknown as any[];

      return json({
        dataPrincipalId: user.id,
        exportedAt: new Date().toISOString(),
        governingLaw: 'Digital Personal Data Protection Act 2025, Section 11 (Right to Access)',
        profile: user,
        paymentInstruments: payments,
        orderHistory: orders,
      });
    }

    // 7. Privacy Portal - Withdraw Consent: POST /api/privacy/consent/withdraw
    if (method === 'POST' && pathname === '/api/privacy/consent/withdraw') {
      const body = await this.readJsonBody(req);
      const { userId, purposesWithdrawn, reason } = body;

      try {
        const cpRes = await fetch(`${this.config.controlPlaneUrl}/api/v1/consent/withdraw`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            principalId: userId,
            purposesWithdrawn: purposesWithdrawn || ['marketing_promo'],
            reason: reason || 'customer_portal_withdrawal',
          }),
        });
        const result = await cpRes.json();
        return json(result);
      } catch (err: any) {
        return json({ error: 'Failed to communicate with Control Plane' }, 500);
      }
    }

    // 8. Privacy Portal - Right to Erasure Request: POST /api/privacy/dsr/erasure
    if (method === 'POST' && pathname === '/api/privacy/dsr/erasure') {
      const body = await this.readJsonBody(req);
      const { userId } = body;

      try {
        const dsrRes = await fetch(`${this.config.controlPlaneUrl}/api/v1/dpo/dsr/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            principalId: userId,
            requestType: 'ERASURE',
            requestedBy: 'DATA_PRINCIPAL_SELF_SERVICE',
          }),
        });
        const result = await dsrRes.json();
        return json(result);
      } catch (err: any) {
        return json({ error: 'Failed to dispatch DSR Erasure request' }, 500);
      }
    }

    // 9. Gated Promotional SMS Action: POST /api/marketing/send-promo-sms
    if (method === 'POST' && pathname === '/api/marketing/send-promo-sms') {
      const body = await this.readJsonBody(req);
      const userId = body.userId || 'usr_aarav';

      // --- HOT-PATH REAL-TIME CONSENT CHECK VIA ZONE AGENT (< 1ms) ---
      let consentAllowed = false;
      let checkReason = 'agent_unreachable';
      let latencyMs = 0;

      const startTime = performance.now();
      try {
        const agentCheckRes = await fetch(
          `${this.config.agentUrl}/consent/check?principal_id=${userId}&purpose=marketing_promo`
        );
        latencyMs = Math.round((performance.now() - startTime) * 100) / 100;

        if (agentCheckRes.ok) {
          const checkData = (await agentCheckRes.json()) as { allowed: boolean; reason: string };
          consentAllowed = checkData.allowed;
          checkReason = checkData.reason;
        } else {
          const checkData = (await agentCheckRes.json()) as { allowed: boolean; reason: string };
          consentAllowed = false;
          checkReason = checkData?.reason || 'consent_denied_or_withdrawn';
        }
      } catch (err) {
        console.error('[Ecom App] Zone Agent check error:', err);
        latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
        consentAllowed = false;
        checkReason = 'agent_connection_failed';
      }

      if (!consentAllowed) {
        return json(
          {
            success: false,
            code: 'DPDP_CONSENT_VIOLATION_BLOCKED',
            message: 'Action blocked by Zone Agent: Data Principal has not consented or has withdrawn consent for marketing promotions.',
            reason: checkReason,
            agentLatencyMs: latencyMs,
            statutoryBasis: 'Digital Personal Data Protection Act 2025, Section 6(1)',
          },
          403
        );
      }

      return json({
        success: true,
        message: 'Promotional 20% Discount SMS delivered successfully to customer!',
        agentLatencyMs: latencyMs,
        noticeVersion: 'v2.1_dpdp2025',
        timestamp: new Date().toISOString(),
      });
    }

    json({ error: 'API route not found' }, 404);
  }

  private serveStaticFile(pathname: string, res: ServerResponse): void {
    let cleanPath = pathname;
    if (cleanPath === '/' || cleanPath === '') cleanPath = '/index.html';
    if (cleanPath === '/privacy-notice') cleanPath = '/privacy-notice.html';
    if (cleanPath === '/privacy-center') cleanPath = '/privacy-center.html';

    let filePath = join(this.publicDir, cleanPath);

    if (!existsSync(filePath)) {
      filePath = join(this.publicDir, 'index.html');
    }

    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Storefront files not found');
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
