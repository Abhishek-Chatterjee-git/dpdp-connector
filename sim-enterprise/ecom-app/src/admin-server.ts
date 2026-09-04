import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { EnterpriseDatabase } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class AdminPortalServer {
  private port: number;
  private db: EnterpriseDatabase;
  private server: Server | null = null;
  private publicDir: string;
  private adminSessions: Map<string, { employeeId: string; email: string; role: string; expiresAt: number }> = new Map();

  constructor(port: number = parseInt(process.env.ADMIN_PORT || '3001', 10), db?: EnterpriseDatabase) {
    this.port = port;
    this.db = db || new EnterpriseDatabase();
    this.publicDir = join(__dirname, '../public-admin');
  }

  async start(): Promise<void> {
    await this.db.init();

    return new Promise((resolve) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(this.port, () => {
        console.log(`[Admin Portal] Enterprise Admin & Operations Dashboard running at http://0.0.0.0:${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server?.close(() => resolve()));
      this.server = null;
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = new URL(req.url || '/', `http://localhost:${this.port}`);
    const pathname = parsedUrl.pathname;
    const method = req.method?.toUpperCase();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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
      console.error('[Admin Portal] Error:', err);
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

    // 1. Admin Login: POST /api/admin/auth/login
    if (method === 'POST' && pathname === '/api/admin/auth/login') {
      const body = await this.readJsonBody(req);
      const email = body.email || 'admin@artisan-crafts.in';
      const password = body.password || '';

      const emp = await this.db.get('SELECT * FROM employees WHERE email = ?', [email]) as any;
      if (!emp) return json({ error: 'Staff account not found' }, 401);

      const cred = await this.db.get('SELECT * FROM admin_credentials WHERE employee_id = ?', [emp.id]) as any;
      if (!cred) return json({ error: 'No credentials configured' }, 401);

      const computed = createHash('sha256').update(password + cred.salt).digest('hex');
      if (computed !== cred.password_hash) {
        return json({ error: 'Invalid staff password' }, 401);
      }

      const token = `admin_sess_${randomBytes(24).toString('hex')}`;
      this.adminSessions.set(token, {
        employeeId: emp.id,
        email: emp.email,
        role: emp.role,
        expiresAt: Date.now() + 24 * 3600 * 1000,
      });

      return json({
        success: true,
        token,
        employee: {
          id: emp.id,
          fullName: emp.full_name,
          email: emp.email,
          department: emp.department,
          role: emp.role,
        },
      });
    }

    // 2. List Inventory: GET /api/admin/inventory
    if (method === 'GET' && pathname === '/api/admin/inventory') {
      const products = await this.db.all('SELECT * FROM products ORDER BY created_at DESC');
      return json({ products });
    }

    // 3. Add Product: POST /api/admin/inventory/add
    if (method === 'POST' && pathname === '/api/admin/inventory/add') {
      const body = await this.readJsonBody(req);
      const id = `prod_${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();

      await this.db.run(
        `INSERT INTO products (id, title, category, price, stock, description, emoji, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          body.title,
          body.category || 'General',
          parseFloat(body.price) || 0,
          parseInt(body.stock, 10) || 0,
          body.description || '',
          body.emoji || '📦',
          now,
        ]
      );

      return json({ success: true, id, message: 'Product added to inventory' });
    }

    // 4. Update Stock: PUT /api/admin/inventory/update-stock
    if (method === 'PUT' && pathname === '/api/admin/inventory/update-stock') {
      const body = await this.readJsonBody(req);
      await this.db.run('UPDATE products SET stock = ? WHERE id = ?', [parseInt(body.stock, 10), body.productId]);
      return json({ success: true, message: 'Stock updated' });
    }

    // 5. List Orders: GET /api/admin/orders
    if (method === 'GET' && pathname === '/api/admin/orders') {
      const orders = await this.db.all(`
        SELECT o.*, u.full_name as customer_name, u.email as customer_email, u.phone as customer_phone
        FROM orders o
        JOIN users u ON o.user_id = u.id
        ORDER BY o.created_at DESC
      `);

      return json({
        orders: orders.map((o: any) => ({
          ...o,
          items: typeof o.items === 'string' ? JSON.parse(o.items || '[]') : o.items,
        })),
      });
    }

    // 6. List Customers: GET /api/admin/customers
    if (method === 'GET' && pathname === '/api/admin/customers') {
      const customers = await this.db.all('SELECT id, email, full_name, phone, city, consent_purposes, created_at FROM users ORDER BY created_at DESC');
      return json({
        customers: customers.map((c: any) => ({
          ...c,
          consentPurposes: typeof c.consent_purposes === 'string' ? JSON.parse(c.consent_purposes || '[]') : c.consent_purposes,
        })),
      });
    }

    // 7. List Employees: GET /api/admin/employees
    if (method === 'GET' && pathname === '/api/admin/employees') {
      const employees = await this.db.all('SELECT id, full_name, email, department, role, salary, pan_no, created_at FROM employees ORDER BY created_at ASC');
      return json({ employees });
    }

    json({ error: 'Admin API route not found' }, 404);
  }

  private serveStaticFile(pathname: string, res: ServerResponse): void {
    let cleanPath = pathname;
    if (cleanPath === '/' || cleanPath === '') cleanPath = '/index.html';

    let filePath = join(this.publicDir, cleanPath);
    if (!existsSync(filePath)) {
      filePath = join(this.publicDir, 'index.html');
    }

    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Admin Dashboard UI not found');
      return;
    }

    const ext = extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
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
