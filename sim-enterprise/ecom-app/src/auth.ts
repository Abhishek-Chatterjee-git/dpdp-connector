import { createHash, randomBytes } from 'node:crypto';
import { EnterpriseDatabase } from './db.js';

export interface CustomerUser {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  aadhaarNo?: string;
  panNo?: string;
  streetAddress?: string;
  city?: string;
  consentPurposes: string[];
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
  private db: EnterpriseDatabase;
  private sessions: Map<string, CustomerSession> = new Map();

  constructor(db: EnterpriseDatabase) {
    this.db = db;
  }

  private hashPassword(password: string, salt: string): string {
    return createHash('sha256').update(password + salt).digest('hex');
  }

  async setPassword(userId: string, passwordPlain: string): Promise<void> {
    const salt = randomBytes(16).toString('hex');
    const hash = this.hashPassword(passwordPlain, salt);
    const now = new Date().toISOString();

    const existing = await this.db.get('SELECT user_id FROM customer_credentials WHERE user_id = ?', [userId]);
    if (existing) {
      await this.db.run(
        'UPDATE customer_credentials SET password_hash = ?, salt = ?, updated_at = ? WHERE user_id = ?',
        [hash, salt, now, userId]
      );
    } else {
      await this.db.run(
        'INSERT INTO customer_credentials (user_id, password_hash, salt, updated_at) VALUES (?, ?, ?, ?)',
        [userId, hash, salt, now]
      );
    }
  }

  async login(email: string, passwordPlain: string): Promise<{ success: boolean; session?: CustomerSession; user?: CustomerUser; error?: string }> {
    const userRow = await this.db.get('SELECT * FROM users WHERE email = ?', [email]) as any;
    if (!userRow) {
      return { success: false, error: 'User account not found' };
    }

    const credRow = await this.db.get('SELECT * FROM customer_credentials WHERE user_id = ?', [userRow.id]) as any;
    if (!credRow) {
      return { success: false, error: 'No password set for this account' };
    }

    const computed = this.hashPassword(passwordPlain, credRow.salt);
    if (computed !== credRow.password_hash) {
      return { success: false, error: 'Invalid email or password' };
    }

    const token = `cust_sess_${randomBytes(24).toString('hex')}`;
    const expiresAt = Date.now() + 7 * 24 * 3600 * 1000; // 7 days

    let consentPurposes: string[] = ['essential'];
    try {
      if (userRow.consent_purposes) {
        consentPurposes = typeof userRow.consent_purposes === 'string'
          ? JSON.parse(userRow.consent_purposes)
          : userRow.consent_purposes;
      }
    } catch {
      consentPurposes = ['essential'];
    }

    const user: CustomerUser = {
      id: userRow.id,
      email: userRow.email,
      fullName: userRow.full_name,
      phone: userRow.phone,
      aadhaarNo: userRow.aadhaar_no || undefined,
      panNo: userRow.pan_no || undefined,
      streetAddress: userRow.street_address || undefined,
      city: userRow.city || undefined,
      consentPurposes,
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
