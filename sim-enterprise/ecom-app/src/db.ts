import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';

export interface ProductRecord {
  id: string;
  title: string;
  category: string;
  price: number;
  stock: number;
  description: string;
  emoji: string;
  created_at: string;
}

export interface UserRecord {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  aadhaar_no?: string | null;
  pan_no?: string | null;
  street_address?: string | null;
  city?: string | null;
  consent_purposes: string; // JSON array string
  created_at: string;
}

export interface OrderRecord {
  id: string;
  user_id: string;
  items: string; // JSON array string
  total_amount: number;
  shipping_address: string;
  status: string;
  created_at: string;
}

export interface EmployeeRecord {
  id: string;
  full_name: string;
  email: string;
  department: string;
  role: string;
  salary: number;
  pan_no: string;
  created_at: string;
}

export class EnterpriseDatabase {
  private sqliteDb: DatabaseSync | null = null;
  private pgPool: pg.Pool | null = null;
  private isPostgres = false;
  private dbPath: string;

  constructor(dbPath: string = process.env.DB_PATH || 'enterprise_data.sqlite') {
    this.dbPath = dbPath;
    const connStr = process.env.DB_CONNECTION_STRING;
    if (connStr && connStr.startsWith('postgres')) {
      this.isPostgres = true;
      this.pgPool = new pg.Pool({ connectionString: connStr });
    }
  }

  async init(): Promise<void> {
    if (this.sqliteDb || (this.isPostgres && this.pgPool)) {
      return;
    }
    if (this.isPostgres && this.pgPool) {
      await this.initPostgres();
    } else {
      this.initSqlite();
    }
  }

  private initSqlite(): void {
    this.sqliteDb = new DatabaseSync(this.dbPath);
    this.sqliteDb.exec('PRAGMA journal_mode = WAL;');

    // Products table
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        stock INTEGER NOT NULL,
        description TEXT NOT NULL,
        emoji TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    // Customer Users table
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        aadhaar_no TEXT,
        pan_no TEXT,
        street_address TEXT,
        city TEXT,
        consent_purposes TEXT NOT NULL DEFAULT '["essential"]',
        created_at TEXT NOT NULL
      );
    `);

    // Customer Credentials table
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS customer_credentials (
        user_id TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // Customer Orders table
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        items TEXT NOT NULL,
        total_amount REAL NOT NULL,
        shipping_address TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'CONFIRMED',
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // Employees table (Internal HR)
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        department TEXT NOT NULL,
        role TEXT NOT NULL,
        salary REAL NOT NULL,
        pan_no TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    // Admin / Employee Credentials
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS admin_credentials (
        employee_id TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE
      );
    `);

    this.seedInitialProductsAndAdmin();
  }

  private initPostgres(): Promise<void> {
    // Schema creation for PostgreSQL
    return this.pgPool!.query(`
      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        stock INTEGER NOT NULL,
        description TEXT NOT NULL,
        emoji VARCHAR(32) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        phone VARCHAR(32) NOT NULL,
        aadhaar_no VARCHAR(32),
        pan_no VARCHAR(32),
        street_address TEXT,
        city VARCHAR(100),
        consent_purposes TEXT NOT NULL DEFAULT '["essential"]',
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customer_credentials (
        user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        password_hash VARCHAR(255) NOT NULL,
        salt VARCHAR(255) NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        items TEXT NOT NULL,
        total_amount NUMERIC(10,2) NOT NULL,
        shipping_address TEXT NOT NULL,
        status VARCHAR(64) NOT NULL DEFAULT 'CONFIRMED',
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS employees (
        id VARCHAR(64) PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        department VARCHAR(100) NOT NULL,
        role VARCHAR(100) NOT NULL,
        salary NUMERIC(12,2) NOT NULL,
        pan_no VARCHAR(32) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_credentials (
        employee_id VARCHAR(64) PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
        password_hash VARCHAR(255) NOT NULL,
        salt VARCHAR(255) NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
    `).then(() => this.seedInitialProductsAndAdmin());
  }

  private seedInitialProductsAndAdmin(): void {
    const now = new Date().toISOString();

    // 1. Seed Initial Catalog Products
    const countRow = this.sqliteDb
      ? (this.sqliteDb.prepare('SELECT COUNT(*) as count FROM products').get() as any)
      : { count: 0 };

    if (countRow && countRow.count === 0) {
      const catalog = [
        {
          id: 'prod_vase_01',
          title: 'Hand-thrown Terracotta Indigo Vase',
          category: 'Home & Living',
          price: 2499.00,
          stock: 15,
          description: 'Sculpted by master potters from Jaipur using organic earthen clay and natural botanical indigo glaze.',
          emoji: '🏺',
        },
        {
          id: 'prod_mug_02',
          title: 'Wabi-Sabi Ceramic Teaware (Set of 2)',
          category: 'Kitchen & Dining',
          price: 1499.00,
          stock: 28,
          description: 'Double-fired stoneware mugs featuring unique reactive glaze finishes. Microwave and dishwasher safe.',
          emoji: '🍵',
        },
        {
          id: 'prod_blanket_03',
          title: 'Pure Cashmere Organic Throw Blanket',
          category: 'Textiles & Apparel',
          price: 4999.00,
          stock: 10,
          description: 'Hand-loomed in the Himalayan valleys from ethically gathered grade-A mountain cashmere wool.',
          emoji: '🧣',
        },
        {
          id: 'prod_lamp_04',
          title: 'Hammered Brass Moroccan Table Lantern',
          category: 'Lighting & Decor',
          price: 3299.00,
          stock: 20,
          description: 'Intricately perforated brass casing creates warm, mesmerizing ambient geometric shadow projections.',
          emoji: '🏮',
        },
      ];

      for (const p of catalog) {
        if (this.sqliteDb) {
          this.sqliteDb.prepare(`
            INSERT INTO products (id, title, category, price, stock, description, emoji, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(p.id, p.title, p.category, p.price, p.stock, p.description, p.emoji, now);
        }
      }
    }

    // 2. Seed Default Staff Admin (for Employee / Inventory Portal)
    const empCount = this.sqliteDb
      ? (this.sqliteDb.prepare('SELECT COUNT(*) as count FROM employees').get() as any)
      : { count: 0 };

    if (empCount && empCount.count === 0) {
      const empId = 'emp_admin_01';
      if (this.sqliteDb) {
        this.sqliteDb.prepare(`
          INSERT INTO employees (id, full_name, email, department, role, salary, pan_no, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(empId, 'Rajesh Kumar (Store Manager)', 'admin@artisan-crafts.in', 'Operations', 'STORE_MANAGER', 85000, 'ABCDE1234F', now);

        const salt = randomBytes(16).toString('hex');
        const hash = createHash('sha256').update('Admin@2025' + salt).digest('hex');
        this.sqliteDb.prepare(`
          INSERT INTO admin_credentials (employee_id, password_hash, salt, updated_at)
          VALUES (?, ?, ?, ?)
        `).run(empId, hash, salt, now);
      }
    }
  }

  getDb(): DatabaseSync {
    if (!this.sqliteDb) throw new Error('SQLite database not initialized');
    return this.sqliteDb;
  }

  async close(): Promise<void> {
    if (this.sqliteDb) {
      this.sqliteDb.close();
      this.sqliteDb = null;
    }
    if (this.pgPool) {
      await this.pgPool.end();
      this.pgPool = null;
    }
  }
}
