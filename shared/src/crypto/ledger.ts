import { createHash } from 'node:crypto';
import { LedgerBlock, LedgerEventType } from '../types.js';

/**
 * Deterministic canonical JSON serialization.
 * Recursively sorts object keys so that equivalent objects always produce identical JSON strings.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }

  const keys = Object.keys(obj).sort();
  const pairs = keys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ':' + canonicalJson(val);
  });

  return '{' + pairs.join(',') + '}';
}

/**
 * Computes a SHA-256 hex digest of a UTF-8 string.
 */
export function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Creates a pseudonymized hash for a principal ID to maintain privacy in audit logs.
 */
export function hashPrincipalId(principalId: string, salt: string = 'dpdp-audit-salt'): string {
  return sha256(`${salt}:${principalId}`);
}

/**
 * Computes the cryptographic block hash for a ledger block.
 * hash = SHA256(prevHash + canonicalJson({ index, timestamp, eventType, tenantId, principalIdHash, payload }))
 */
export function computeBlockHash(
  prevHash: string,
  index: number,
  timestamp: string,
  eventType: LedgerEventType,
  tenantId: string,
  payload: unknown,
  principalIdHash?: string
): string {
  const content = canonicalJson({
    index,
    timestamp,
    eventType,
    tenantId,
    principalIdHash: principalIdHash ?? null,
    payload,
  });
  return sha256(`${prevHash}:${content}`);
}

/**
 * Appends a new block to an existing ledger chain (or creates genesis block if chain is empty).
 */
export function createLedgerBlock<T>(
  prevBlock: LedgerBlock | null,
  eventType: LedgerEventType,
  tenantId: string,
  payload: T,
  principalIdHash?: string,
  overrideTimestamp?: string
): LedgerBlock<T> {
  const index = prevBlock ? prevBlock.index + 1 : 0;
  const prevHash = prevBlock ? prevBlock.hash : '0'.repeat(64); // 64-char zero hash for genesis
  const timestamp = overrideTimestamp ?? new Date().toISOString();

  const hash = computeBlockHash(
    prevHash,
    index,
    timestamp,
    eventType,
    tenantId,
    payload,
    principalIdHash
  );

  return {
    index,
    timestamp,
    eventType,
    tenantId,
    principalIdHash,
    payload,
    prevHash,
    hash,
  };
}

/**
 * Cryptographically verifies an entire audit ledger chain.
 * Checks:
 * 1. Genesis block has prevHash of 64 zeros and index 0.
 * 2. Consecutive indices (0, 1, 2, ...).
 * 3. Exact prevHash pointer matching.
 * 4. Recomputed block hash matches block.hash.
 */
export function verifyLedgerChain(blocks: LedgerBlock[]): {
  valid: boolean;
  error?: string;
  invalidIndex?: number;
} {
  if (blocks.length === 0) {
    return { valid: true };
  }

  const GENESIS_PREV_HASH = '0'.repeat(64);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // Verify index sequence
    if (block.index !== i) {
      return {
        valid: false,
        error: `Invalid index: expected ${i}, found ${block.index}`,
        invalidIndex: i,
      };
    }

    // Verify prevHash linkage
    if (i === 0) {
      if (block.prevHash !== GENESIS_PREV_HASH) {
        return {
          valid: false,
          error: `Genesis block prevHash must be 64 zeros`,
          invalidIndex: 0,
        };
      }
    } else {
      const prev = blocks[i - 1];
      if (block.prevHash !== prev.hash) {
        return {
          valid: false,
          error: `Block ${i} prevHash (${block.prevHash}) does not match Block ${i - 1} hash (${prev.hash})`,
          invalidIndex: i,
        };
      }
    }

    // Recompute and verify current block hash
    const expectedHash = computeBlockHash(
      block.prevHash,
      block.index,
      block.timestamp,
      block.eventType,
      block.tenantId,
      block.payload,
      block.principalIdHash
    );

    if (block.hash !== expectedHash) {
      return {
        valid: false,
        error: `Block ${i} hash mismatch: tampered data detected (expected ${expectedHash}, found ${block.hash})`,
        invalidIndex: i,
      };
    }
  }

  return { valid: true };
}
