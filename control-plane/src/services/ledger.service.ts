import {
  LedgerBlock,
  LedgerEventType,
  createLedgerBlock,
  verifyLedgerChain,
  hashPrincipalId,
} from '@dpdp/shared';
import { ControlPlaneStorage } from '../storage/db.js';

export class LedgerService {
  private storage: ControlPlaneStorage;

  constructor(storage: ControlPlaneStorage) {
    this.storage = storage;
  }

  /**
   * Appends an event to the append-only cryptographic audit ledger.
   */
  appendEvent<T>(
    eventType: LedgerEventType,
    tenantId: string = 'tenant-default',
    payload: T,
    principalId?: string
  ): LedgerBlock<T> {
    const db = this.storage.getDb();
    const latest = this.getLatestBlock();
    const principalIdHash = principalId ? hashPrincipalId(principalId) : undefined;

    const newBlock = createLedgerBlock(
      latest,
      eventType,
      tenantId,
      payload,
      principalIdHash
    );

    db.prepare(`
      INSERT INTO audit_ledger (
        block_index, timestamp, event_type, tenant_id, principal_id_hash, payload_json, prev_hash, block_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newBlock.index,
      newBlock.timestamp,
      newBlock.eventType,
      newBlock.tenantId,
      newBlock.principalIdHash || null,
      JSON.stringify(newBlock.payload),
      newBlock.prevHash,
      newBlock.hash
    );

    return newBlock;
  }

  getLatestBlock(): LedgerBlock | null {
    const db = this.storage.getDb();
    const row = db
      .prepare('SELECT * FROM audit_ledger ORDER BY block_index DESC LIMIT 1')
      .get() as unknown as {
      block_index: number;
      timestamp: string;
      event_type: LedgerEventType;
      tenant_id: string;
      principal_id_hash: string | null;
      payload_json: string;
      prev_hash: string;
      block_hash: string;
    } | undefined;

    if (!row) return null;

    return {
      index: row.block_index,
      timestamp: row.timestamp,
      eventType: row.event_type,
      tenantId: row.tenant_id,
      principalIdHash: row.principal_id_hash || undefined,
      payload: JSON.parse(row.payload_json),
      prevHash: row.prev_hash,
      hash: row.block_hash,
    };
  }

  getAllBlocks(): LedgerBlock[] {
    const db = this.storage.getDb();
    const rows = db
      .prepare('SELECT * FROM audit_ledger ORDER BY block_index ASC')
      .all() as unknown as {
      block_index: number;
      timestamp: string;
      event_type: LedgerEventType;
      tenant_id: string;
      principal_id_hash: string | null;
      payload_json: string;
      prev_hash: string;
      block_hash: string;
    }[];

    return rows.map((row) => ({
      index: row.block_index,
      timestamp: row.timestamp,
      eventType: row.event_type,
      tenantId: row.tenant_id,
      principalIdHash: row.principal_id_hash || undefined,
      payload: JSON.parse(row.payload_json),
      prevHash: row.prev_hash,
      hash: row.block_hash,
    }));
  }

  verifyIntegrity(): { valid: boolean; error?: string; invalidIndex?: number; totalBlocks: number } {
    const blocks = this.getAllBlocks();
    const result = verifyLedgerChain(blocks);
    return {
      ...result,
      totalBlocks: blocks.length,
    };
  }
}
