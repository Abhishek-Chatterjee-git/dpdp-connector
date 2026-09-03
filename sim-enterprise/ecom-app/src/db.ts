import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { generateVerhoeffCheckDigit } from '@dpdp/shared';

export class EcomDatabase {
  private dbPath: string;
  private db: DatabaseSync | null = null;

  constructor(dbPath: string = './data/enterprise.sqlite') {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    if (!this.db) {
      if (this.dbPath !== ':memory:') {
        const dir = dirname(this.dbPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
      }
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.migrateAndSeed();
    }
  }

  getDb(): DatabaseSync {
    if (!this.db) throw new Error('E-commerce database not initialized');
    return this.db;
  }

  private migrateAndSeed(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        aadhaar_no TEXT,
        pan_no TEXT,
        street_address TEXT,
        city TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payment_methods (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        card_number TEXT NOT NULL,
        upi_id TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        items TEXT NOT NULL,
        total_amount REAL NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // Seed initial demo customer if empty
    const countRow = this.db.prepare('SELECT COUNT(*) as count FROM users').get() as unknown as { count: number };
    if (countRow && countRow.count === 0) {
      const aadhaar9 = '99991234567';
      const aadhaarCheck = generateVerhoeffCheckDigit(aadhaar9);
      const validAadhaar = `${aadhaar9}${aadhaarCheck}`;
      const now = new Date().toISOString();

      this.db.prepare(`
        INSERT INTO users (id, email, full_name, phone, aadhaar_no, pan_no, street_address, city, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'usr_aarav',
        'aarav.sharma@example.com',
        'Aarav Sharma',
        '9876543210',
        validAadhaar,
        'ABCDE1234F',
        '14 MG Road, Indiranagar',
        'Bengaluru',
        now
      );

      this.db.prepare(`
        INSERT INTO payment_methods (id, user_id, card_number, upi_id, is_default, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'pay_001',
        'usr_aarav',
        '4532015112830366',
        'aarav@okhdfcbank',
        1,
        now
      );

      this.db.prepare(`
        INSERT INTO orders (id, user_id, items, total_amount, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'ord_1001',
        'usr_aarav',
        'Handcrafted Ceramic Mug Set (x2)',
        1499.00,
        'DELIVERED',
        now
      );
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      try {
        this.db.close();
      } catch (e) {
        // already closed
      }
      this.db = null;
    }
  }
}
