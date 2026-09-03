import { createHash, randomBytes } from 'node:crypto';
import { ControlPlaneStorage } from '../storage/db.js';
import { LedgerService } from './ledger.service.js';

export interface DpoUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: 'DPO_ADMIN' | 'COMPLIANCE_AUDITOR' | 'SECURITY_ENGINEER';
  createdAt: string;
  lastLoginAt?: string;
}

export interface SessionToken {
  token: string;
  user: DpoUser;
  expiresAt: number;
}

export class DpoAuthService {
  private storage: ControlPlaneStorage;
  private ledgerService: LedgerService;
  private activeSessions: Map<string, SessionToken> = new Map();

  constructor(storage: ControlPlaneStorage, ledgerService: LedgerService) {
    this.storage = storage;
    this.ledgerService = ledgerService;
  }

  init(): void {
    const db = this.storage.getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS dpo_users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_login_at TEXT
      );
    `);

    // Seed default DPO Administrator if empty
    const adminCheck = db.prepare('SELECT COUNT(*) as count FROM dpo_users').get() as unknown as { count: number };
    if (adminCheck && adminCheck.count === 0) {
      this.createUser(
        'dpo_admin',
        'dpo@enterprise-corp.in',
        'Compliance@2025',
        'Ananya Iyer (Principal DPO)',
        'DPO_ADMIN'
      );
      this.createUser(
        'auditor_vikram',
        'auditor@compliance-audit.org',
        'Auditor@2025',
        'Vikram Malhotra (Lead Certifier)',
        'COMPLIANCE_AUDITOR'
      );
    }
  }

  private hashPassword(password: string, salt: string): string {
    return createHash('sha256').update(password + salt).digest('hex');
  }

  createUser(
    username: string,
    email: string,
    passwordPlain: string,
    fullName: string,
    role: 'DPO_ADMIN' | 'COMPLIANCE_AUDITOR' | 'SECURITY_ENGINEER' = 'DPO_ADMIN'
  ): DpoUser {
    const db = this.storage.getDb();
    const id = `usr_dpo_${randomBytes(4).toString('hex')}`;
    const salt = randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(passwordPlain, salt);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO dpo_users (id, username, email, password_hash, salt, full_name, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, username, email, passwordHash, salt, fullName, role, now);

    this.ledgerService.appendEvent('DPO_USER_PROVISIONED', 'tenant-default', {
      userId: id,
      username,
      email,
      role,
    });

    return { id, username, email, fullName, role, createdAt: now };
  }

  authenticate(usernameOrEmail: string, passwordPlain: string): { success: boolean; session?: SessionToken; error?: string } {
    const db = this.storage.getDb();
    const userRow = db
      .prepare('SELECT * FROM dpo_users WHERE username = ? OR email = ?')
      .get(usernameOrEmail, usernameOrEmail) as unknown as {
      id: string;
      username: string;
      email: string;
      password_hash: string;
      salt: string;
      full_name: string;
      role: 'DPO_ADMIN' | 'COMPLIANCE_AUDITOR' | 'SECURITY_ENGINEER';
      created_at: string;
      last_login_at: string | null;
    } | undefined;

    if (!userRow) {
      return { success: false, error: 'Invalid credentials or user does not exist' };
    }

    const calculatedHash = this.hashPassword(passwordPlain, userRow.salt);
    if (calculatedHash !== userRow.password_hash) {
      return { success: false, error: 'Invalid password' };
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE dpo_users SET last_login_at = ? WHERE id = ?').run(now, userRow.id);

    const token = `dpo_sess_${randomBytes(24).toString('hex')}`;
    const expiresAt = Date.now() + 24 * 3600 * 1000; // 24-hour session

    const user: DpoUser = {
      id: userRow.id,
      username: userRow.username,
      email: userRow.email,
      fullName: userRow.full_name,
      role: userRow.role,
      createdAt: userRow.created_at,
      lastLoginAt: now,
    };

    const session: SessionToken = { token, user, expiresAt };
    this.activeSessions.set(token, session);

    this.ledgerService.appendEvent('DPO_AUTHENTICATION_SUCCESS', 'tenant-default', {
      userId: user.id,
      username: user.username,
      role: user.role,
      loginTimestamp: now,
    });

    return { success: true, session };
  }

  verifySession(token: string): DpoUser | null {
    if (!token) return null;
    const session = this.activeSessions.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.activeSessions.delete(token);
      return null;
    }
    return session.user;
  }

  logout(token: string): boolean {
    return this.activeSessions.delete(token);
  }
}
