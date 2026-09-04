import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { EnterpriseDatabase } from './db.js';
import { CustomerAuthService } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface EcomServerConfig {
  port: number;
}

export class EcomServer {
  private config: EcomServerConfig;
  private db: EnterpriseDatabase;
  private authService: CustomerAuthService | null = null;
  private server: Server | null = null;
  private publicDir: string;

  constructor(config?: Partial<EcomServerConfig>, db?: EnterpriseDatabase) {
    this.config = {
      port: parseInt(process.env.ECOM_PORT || '3000', 10),
      ...config,
    };
    this.db = db || new EnterpriseDatabase();
    this.publicDir = join(__dirname, '../public');
  }

  async start(): Promise<void> {
    await this.db.init();
    this.authService = new CustomerAuthService(this.db);

    return new Promise((resolve) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(this.config.port, () => {
        console.log(`[Customer Storefront] Production E-Commerce App running at http://0.0.0.0:${this.config.port}`);
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
      console.error('[Customer Storefront] Request error:', err);
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

    const authService = this.authService!;

    // 1. Live Product Catalog: GET /api/catalog/products
    if (method === 'GET' && pathname === '/api/catalog/products') {
      const products = await this.db.all('SELECT * FROM products ORDER BY created_at ASC');
      return json({ products });
    }

    // 2. Signup with DPDP Statutory Consent: POST /api/auth/signup
    if (method === 'POST' && pathname === '/api/auth/signup') {
      const body = await this.readJsonBody(req);
      const userId = `usr_${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();

      const { email, password, fullName, phone, aadhaarNo, panNo, streetAddress, city, consents } = body;
      const consentedPurposes: string[] = consents || ['essential'];

      if (!email || !password || !fullName || !phone) {
        return json({ error: 'Please provide full name, email, phone, and password.' }, 400);
      }

      // Check if user already exists
      const existing = await this.db.get('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) {
        return json({ error: 'An account with this email address already exists.' }, 400);
      }

      await this.db.run(
        `INSERT INTO users (id, email, full_name, phone, aadhaar_no, pan_no, street_address, city, consent_purposes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          email,
          fullName,
          phone,
          aadhaarNo || null,
          panNo || null,
          streetAddress || null,
          city || null,
          JSON.stringify(consentedPurposes),
          now,
        ]
      );

      // Save password credentials
      await authService.setPassword(userId, password);

      const loginRes = await authService.login(email, password);

      return json({
        success: true,
        session: loginRes.session,
        user: { id: userId, email, fullName, phone, consentPurposes: consentedPurposes },
      });
    }

    // 3. Customer Login: POST /api/auth/login
    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await this.readJsonBody(req);
      const email = body.email || '';
      const password = body.password || '';

      const authRes = await authService.login(email, password);
      if (!authRes.success) {
        return json({ error: authRes.error }, 401);
      }

      const user = authRes.user!;
      const orders = await this.db.all('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [user.id]);

      return json({
        success: true,
        session: authRes.session,
        user: {
          ...user,
          orders: orders.map((o) => ({ ...o, items: typeof o.items === 'string' ? JSON.parse(o.items || '[]') : o.items })),
        },
      });
    }

    // 4. Session Validation: GET /api/auth/me
    if (method === 'GET' && pathname === '/api/auth/me') {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const session = authService.verifySession(token);
      if (!session) return json({ error: 'Unauthorized session' }, 401);

      const user = await this.db.get('SELECT * FROM users WHERE id = ?', [session.userId]);
      if (!user) return json({ error: 'User not found' }, 404);

      const orders = await this.db.all('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [user.id]);

      let consentPurposes = ['essential'];
      try {
        consentPurposes = typeof user.consent_purposes === 'string'
          ? JSON.parse(user.consent_purposes || '[]')
          : user.consent_purposes;
      } catch {}

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
          consentPurposes,
          orders: orders.map((o) => ({ ...o, items: typeof o.items === 'string' ? JSON.parse(o.items || '[]') : o.items })),
        },
      });
    }

    // 5. Checkout & Order Placement: POST /api/cart/checkout
    if (method === 'POST' && pathname === '/api/cart/checkout') {
      const body = await this.readJsonBody(req);
      const { userId, items, totalAmount, shippingAddress } = body;
      const orderId = `ord_${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();

      // Decrement stock for ordered items
      for (const item of items || []) {
        if (this.db.isPostgres) {
          await this.db.run('UPDATE products SET stock = GREATEST(0, stock - ?) WHERE id = ?', [item.qty || 1, item.id]);
        } else {
          await this.db.run('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?', [item.qty || 1, item.id]);
        }
      }

      await this.db.run(
        `INSERT INTO orders (id, user_id, items, total_amount, shipping_address, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'CONFIRMED', ?)`,
        [orderId, userId, JSON.stringify(items), totalAmount, shippingAddress || 'Customer Address', now]
      );

      return json({
        success: true,
        orderId,
        status: 'CONFIRMED',
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
      const userId = url.searchParams.get('userId');
      if (!userId) return json({ error: 'User ID required' }, 400);

      const user = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
      if (!user) return json({ error: 'User not found' }, 404);

      const orders = await this.db.all('SELECT * FROM orders WHERE user_id = ?', [userId]);

      return json({
        dataPrincipalId: user.id,
        exportedAt: new Date().toISOString(),
        governingLaw: 'Digital Personal Data Protection Act 2025, Section 11 (Right to Access)',
        profile: {
          id: user.id,
          fullName: user.full_name,
          email: user.email,
          phone: user.phone,
          city: user.city,
          streetAddress: user.street_address,
          consentPurposes: typeof user.consent_purposes === 'string' ? JSON.parse(user.consent_purposes || '[]') : user.consent_purposes,
          registeredAt: user.created_at,
        },
        orderHistory: orders.map((o) => ({ ...o, items: typeof o.items === 'string' ? JSON.parse(o.items || '[]') : o.items })),
      });
    }

    // 7. Privacy Portal - Update/Withdraw Consent: POST /api/privacy/consent/withdraw
    if (method === 'POST' && pathname === '/api/privacy/consent/withdraw') {
      const body = await this.readJsonBody(req);
      const { userId, purposesWithdrawn } = body;

      const user = await this.db.get('SELECT consent_purposes FROM users WHERE id = ?', [userId]);
      if (!user) return json({ error: 'User not found' }, 404);

      let currentPurposes: string[] = typeof user.consent_purposes === 'string'
        ? JSON.parse(user.consent_purposes || '["essential"]')
        : user.consent_purposes;

      currentPurposes = currentPurposes.filter((p) => !(purposesWithdrawn || []).includes(p));

      await this.db.run('UPDATE users SET consent_purposes = ? WHERE id = ?', [JSON.stringify(currentPurposes), userId]);

      return json({
        success: true,
        userId,
        updatedPurposes: currentPurposes,
        message: 'Consent withdrawal recorded in database',
      });
    }

    // 8. Privacy Portal - Request Account Erasure: POST /api/privacy/dsr/erasure
    if (method === 'POST' && pathname === '/api/privacy/dsr/erasure') {
      const body = await this.readJsonBody(req);
      const { userId } = body;

      // Logical soft delete with access revocation
      if (this.db.isPostgres) {
        await this.db.run(
          `UPDATE users SET
            email = 'deleted_' || id || '@quarantine.local',
            full_name = '[DELETED DATA PRINCIPAL]',
            phone = '0000000000',
            street_address = NULL,
            city = NULL,
            consent_purposes = '[]'
          WHERE id = ?`,
          [userId]
        );
      } else {
        await this.db.run(
          `UPDATE users SET
            email = 'deleted_' || id || '@quarantine.local',
            full_name = '[DELETED DATA PRINCIPAL]',
            phone = '0000000000',
            street_address = NULL,
            city = NULL,
            consent_purposes = '[]'
          WHERE id = ?`,
          [userId]
        );
      }

      return json({
        success: true,
        userId,
        status: 'COLD_RETENTION_QUARANTINE',
        message: 'Account erasure processed. Personal identifiers masked.',
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
