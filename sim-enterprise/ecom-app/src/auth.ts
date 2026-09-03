import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export interface CustomerUser {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  aadhaarNo?: string;
  panNo?: string;
  streetAddress?: string;
  city?: string;
  createdAt: string;
}

export interface CustomerSession {
  token: string;
  userId: string;
  email: string;
  fullName: string;
  expiresAt: number;
}

export class CustomerAuthService {
  private db: DatabaseSync;
  private sessions: Map<string, CustomerSession> = new Map();

  constructor(db: DatabaseSync) {
    this.db = db;
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS customer_credentials (
        user_id TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // Seed credentials for initial demo customer usr_aarav
    const existingCred = this.db
      .prepare('SELECT user_id FROM customer_credentials WHERE user_id = ?')
      .get('usr_aarav');

    if (!existingCred) {
      const salt = randomBytes(16).toString('hex');
      const hash = this.hashPassword('Aarav@2025', salt);
      const now = new Date().toISOString();
      this.db.prepare(`
        INSERT INTO customer_credentials (user_id, password_hash, salt, updated_at)
        VALUES (?, ?, ?, ?)
      `).run('usr_aarav', hash, salt, now);
    }
  }

  private hashPassword(password: string, salt: string): string {
    return createHash('sha256').update(password + salt).digest('hex');
  }

  setPassword(userId: string, passwordPlain: string): void {
    const salt = randomBytes(16).toString('hex');
    const hash = this.hashPassword(passwordPlain, salt);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO customer_credentials (user_id, password_hash, salt, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        password_hash = excluded.password_hash,
        salt = excluded.salt,
        updated_at = excluded.updated_at
    `).run(userId, hash, salt, now);
  }

  login(email: string, passwordPlain: string): { success: boolean; session?: CustomerSession; user?: CustomerUser; error?: string } {
    const userRow = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as unknown as any;
    if (!userRow) {
      return { success: false, error: 'User account not found' };
    }

    const credRow = this.db
      .prepare('SELECT * FROM customer_credentials WHERE user_id = ?')
      .get(userRow.id) as unknown as { password_hash: string; salt: string } | undefined;

    if (!credRow) {
      // Default demo fallback if credentials not yet set
      if (passwordPlain !== 'Password@123' && passwordPlain !== 'Aarav@2025') {
        return { success: false, error: 'Invalid customer password' };
      }
    } else {
      const computed = this.hashPassword(passwordPlain, credRow.salt);
      if (computed !== credRow.password_hash) {
        return { success: false, error: 'Invalid customer password' };
      }
    }

    const token = `cust_sess_${randomBytes(24).toString('hex')}`;
    const expiresAt = Date.now() + 7 * 24 * 3600 * 1000; // 7 days

    const user: CustomerUser = {
      id: userRow.id,
      email: userRow.email,
      fullName: userRow.full_name,
      phone: userRow.phone,
      aadhaarNo: userRow.aadhaar_no || undefined,
      panNo: userRow.pan_no || undefined,
      streetAddress: userRow.street_address || undefined,
      city: userRow.city || undefined,
      createdAt: userRow.created_at,
    };

    const session: CustomerSession = {
      token,
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      expiresAt,
    };

    this.sessions.set(token, session);
    return { success: true, session, user };
  }

  verifySession(token: string): CustomerSession | null {
    if (!token) return null;
    const s = this.sessions.get(token);
    if (!s) return null;
    if (Date.now() > s.expiresAt) {
      this.sessions.delete(token);
      return null;
    }
    return s;
  }

  logout(token: string): boolean {
    return this.sessions.delete(token);
  }
}
