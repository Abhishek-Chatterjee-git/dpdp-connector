import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { ColumnMetadata } from '@dpdp/shared';

export interface DatabaseAdapter {
  connect(): Promise<void>;
  getTableList(): Promise<string[]>;
  getTableSchema(tableName: string): Promise<ColumnMetadata[]>;
  getDdlChecksum(): Promise<string>;
  sampleRows(tableName: string, maxRows: number): Promise<Record<string, unknown>[]>;
  executeDelete(tableName: string, filterColumn: string, filterValue: string): Promise<number>;
  executeAnonymize(
    tableName: string,
    filterColumn: string,
    filterValue: string,
    masks: Record<string, string>
  ): Promise<number>;
  close(): Promise<void>;
}

/**
 * SQLite Database Adapter using native Node.js built-in DatabaseSync
 */
export class SqliteAdapter implements DatabaseAdapter {
  private dbPath: string;
  private db: DatabaseSync | null = null;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async connect(): Promise<void> {
    if (!this.db) {
      if (this.dbPath !== ':memory:') {
        const dir = dirname(this.dbPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
      }
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec('PRAGMA journal_mode = WAL;');
    }
  }

  getNativeDb(): DatabaseSync {
    if (!this.db) throw new Error('Database not connected');
    return this.db;
  }

  async getTableList(): Promise<string[]> {
    if (!this.db) throw new Error('Database not connected');
    const rows = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      .all() as unknown as { name: string }[];
    return rows.map((r) => r.name);
  }

  async getTableSchema(tableName: string): Promise<ColumnMetadata[]> {
    if (!this.db) throw new Error('Database not connected');
    const pragmaRows = this.db
      .prepare(`PRAGMA table_info("${tableName}")`)
      .all() as unknown as {
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: unknown;
      pk: number;
    }[];

    return pragmaRows.map((r) => ({
      name: r.name,
      dataType: r.type || 'TEXT',
      isNullable: r.notnull === 0,
      isPrimaryKey: r.pk > 0,
    }));
  }

  async getDdlChecksum(): Promise<string> {
    if (!this.db) throw new Error('Database not connected');
    const rows = this.db
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as unknown as { name: string; sql: string }[];

    const combinedSql = rows.map((r) => `${r.name}:${r.sql}`).join(';\n');
    return createHash('sha256').update(combinedSql, 'utf8').digest('hex');
  }

  async sampleRows(tableName: string, maxRows: number): Promise<Record<string, unknown>[]> {
    if (!this.db) throw new Error('Database not connected');
    return this.db
      .prepare(`SELECT * FROM "${tableName}" LIMIT ?`)
      .all(maxRows) as unknown as Record<string, unknown>[];
  }

  async executeDelete(tableName: string, filterColumn: string, filterValue: string): Promise<number> {
    if (!this.db) throw new Error('Database not connected');
    const stmt = this.db.prepare(`DELETE FROM "${tableName}" WHERE "${filterColumn}" = ?`);
    const info = stmt.run(filterValue) as { changes: number | bigint };
    return Number(info.changes);
  }

  async executeAnonymize(
    tableName: string,
    filterColumn: string,
    filterValue: string,
    masks: Record<string, string>
  ): Promise<number> {
    if (!this.db) throw new Error('Database not connected');
    const setClauses: string[] = [];
    const values: (string | number)[] = [];

    for (const [col, maskVal] of Object.entries(masks)) {
      setClauses.push(`"${col}" = ?`);
      values.push(maskVal);
    }

    if (setClauses.length === 0) return 0;

    values.push(filterValue);
    const sql = `UPDATE "${tableName}" SET ${setClauses.join(', ')} WHERE "${filterColumn}" = ?`;
    const stmt = this.db.prepare(sql);
    const info = stmt.run(...values) as { changes: number | bigint };
    return Number(info.changes);
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

/**
 * PostgreSQL Database Adapter
 */
export class PostgresAdapter implements DatabaseAdapter {
  private connectionString: string;
  private pool: pg.Pool | null = null;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  async connect(): Promise<void> {
    if (!this.pool) {
      this.pool = new pg.Pool({
        connectionString: this.connectionString,
        max: 5,
        idleTimeoutMillis: 10000,
      });
      const client = await this.pool.connect();
      client.release();
    }
  }

  async getTableList(): Promise<string[]> {
    if (!this.pool) throw new Error('Database not connected');
    const query = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    const res = await this.pool.query(query);
    return res.rows.map((r: { table_name: string }) => r.table_name);
  }

  async getTableSchema(tableName: string): Promise<ColumnMetadata[]> {
    if (!this.pool) throw new Error('Database not connected');
    const query = `
      SELECT 
        c.column_name, 
        c.data_type, 
        c.is_nullable,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_pk
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name = $1
      ) pk ON c.column_name = pk.column_name
      WHERE c.table_name = $1 AND c.table_schema = 'public'
      ORDER BY c.ordinal_position;
    `;
    const res = await this.pool.query(query, [tableName]);
    return res.rows.map((r: { column_name: string; data_type: string; is_nullable: string; is_pk: boolean }) => ({
      name: r.column_name,
      dataType: r.data_type,
      isNullable: r.is_nullable === 'YES',
      isPrimaryKey: r.is_pk,
    }));
  }

  async getDdlChecksum(): Promise<string> {
    if (!this.pool) throw new Error('Database not connected');
    const query = `
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, column_name;
    `;
    const res = await this.pool.query(query);
    const ddlString = res.rows
      .map((r: { table_name: string; column_name: string; data_type: string; is_nullable: string }) =>
        `${r.table_name}.${r.column_name}:${r.data_type}:${r.is_nullable}`
      )
      .join(';\n');
    return createHash('sha256').update(ddlString, 'utf8').digest('hex');
  }

  async sampleRows(tableName: string, maxRows: number): Promise<Record<string, unknown>[]> {
    if (!this.pool) throw new Error('Database not connected');
    const res = await this.pool.query(`SELECT * FROM "${tableName}" LIMIT $1`, [maxRows]);
    return res.rows;
  }

  async executeDelete(tableName: string, filterColumn: string, filterValue: string): Promise<number> {
    if (!this.pool) throw new Error('Database not connected');
    const query = `DELETE FROM "${tableName}" WHERE "${filterColumn}" = $1`;
    const res = await this.pool.query(query, [filterValue]);
    return res.rowCount || 0;
  }

  async executeAnonymize(
    tableName: string,
    filterColumn: string,
    filterValue: string,
    masks: Record<string, string>
  ): Promise<number> {
    if (!this.pool) throw new Error('Database not connected');
    const setClauses: string[] = [];
    const values: string[] = [];
    let idx = 1;

    for (const [col, maskVal] of Object.entries(masks)) {
      setClauses.push(`"${col}" = $${idx}`);
      values.push(maskVal);
      idx++;
    }

    if (setClauses.length === 0) return 0;

    values.push(filterValue);
    const query = `UPDATE "${tableName}" SET ${setClauses.join(', ')} WHERE "${filterColumn}" = $${idx}`;
    const res = await this.pool.query(query, values);
    return res.rowCount || 0;
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
