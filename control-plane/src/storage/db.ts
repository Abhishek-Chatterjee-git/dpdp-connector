import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export class ControlPlaneStorage {
  private dbPath: string;
  private db: DatabaseSync | null = null;

  constructor(dbPath: string = './data/control_plane.sqlite') {
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
      this.applyMigrations();
    }
  }

  getDb(): DatabaseSync {
    if (!this.db) throw new Error('Control plane storage not initialized');
    return this.db;
  }

  private applyMigrations(): void {
    if (!this.db) return;

    this.db.exec(`
      -- Registered Agents
      CREATE TABLE IF NOT EXISTS agents (
        agent_id TEXT PRIMARY KEY,
        agent_name TEXT NOT NULL,
        version TEXT NOT NULL,
        environment TEXT NOT NULL,
        agent_token TEXT NOT NULL,
        status TEXT NOT NULL,
        last_heartbeat TEXT NOT NULL,
        ddl_checksum TEXT,
        target_endpoints TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      -- Discovered Schemas & Metadata
      CREATE TABLE IF NOT EXISTS discovered_tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        table_name TEXT NOT NULL,
        columns_json TEXT NOT NULL,
        row_count_estimate INTEGER NOT NULL,
        ddl_checksum TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(agent_id, target_id, table_name)
      );

      -- Principal Consents
      CREATE TABLE IF NOT EXISTS consents (
        principal_id TEXT PRIMARY KEY,
        notice_version TEXT NOT NULL,
        consented_purposes TEXT NOT NULL, -- JSON array
        status TEXT NOT NULL, -- ACTIVE, WITHDRAWN, PARTIAL
        channel TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        withdrawn_at TEXT
      );

      -- DSR Requests
      CREATE TABLE IF NOT EXISTS dsr_requests (
        dsr_id TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL,
        request_type TEXT NOT NULL,
        status TEXT NOT NULL,
        submitted_at TEXT NOT NULL,
        completed_at TEXT,
        sla_deadline TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        tasks_json TEXT NOT NULL,
        proofs_json TEXT
      );

      -- Append-Only Cryptographic Audit Ledger
      CREATE TABLE IF NOT EXISTS audit_ledger (
        block_index INTEGER PRIMARY KEY,
        timestamp TEXT NOT NULL,
        event_type TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        principal_id_hash TEXT,
        payload_json TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        block_hash TEXT NOT NULL
      );

      -- Pending Agent Tasks (Queue)
      CREATE TABLE IF NOT EXISTS pending_tasks (
        task_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        task_type TEXT NOT NULL,
        task_data_json TEXT NOT NULL,
        status TEXT NOT NULL, -- PENDING, DISPATCHED, COMPLETED, FAILED
        created_at TEXT NOT NULL
      );
    `);
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
