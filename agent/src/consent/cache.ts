import { ConsentCheckResponse, PrincipalConsentState } from '@dpdp/shared';

interface CachedConsent {
  noticeVersion: string;
  purposes: Set<string>;
  cachedAt: number;
  expiresAt: number;
}

export class InMemoryConsentCache {
  private cache = new Map<string, CachedConsent>();
  private defaultTtlMs: number;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(defaultTtlMs: number = 5 * 60 * 1000) {
    // 5-minute default TTL
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Evaluates consent on the hot path (< 1ms).
   */
  check(principalId: string, purposeId: string): ConsentCheckResponse {
    const checkedAt = new Date().toISOString();
    const entry = this.cache.get(principalId);

    if (!entry) {
      this.misses++;
      return {
        allowed: false,
        reason: 'consent_not_cached_or_withdrawn',
        checkedAt,
      };
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(principalId);
      this.misses++;
      return {
        allowed: false,
        reason: 'consent_cache_expired',
        checkedAt,
      };
    }

    // Check purpose match (or wildcard '*')
    if (entry.purposes.has('*') || entry.purposes.has(purposeId)) {
      this.hits++;
      return {
        allowed: true,
        reason: 'consent_active',
        noticeVersion: entry.noticeVersion,
        checkedAt,
      };
    }

    this.misses++;
    return {
      allowed: false,
      reason: `purpose_${purposeId}_not_consented`,
      noticeVersion: entry.noticeVersion,
      checkedAt,
    };
  }

  /**
   * Stores or updates consent in the local memory cache.
   */
  set(
    principalId: string,
    noticeVersion: string,
    purposes: string[],
    ttlMs?: number
  ): void {
    const now = Date.now();
    const ttl = ttlMs ?? this.defaultTtlMs;

    this.cache.set(principalId, {
      noticeVersion,
      purposes: new Set(purposes),
      cachedAt: now,
      expiresAt: now + ttl,
    });
  }

  /**
   * Instantly invalidates/evicts consent upon withdrawal notice from Control Plane.
   */
  invalidate(principalId: string, purposesWithdrawn?: string[]): boolean {
    if (!this.cache.has(principalId)) {
      return false;
    }

    if (!purposesWithdrawn || purposesWithdrawn.includes('*') || purposesWithdrawn.length === 0) {
      // Evict entire principal
      this.cache.delete(principalId);
      this.evictions++;
      return true;
    }

    // Partial purpose withdrawal
    const entry = this.cache.get(principalId)!;
    for (const p of purposesWithdrawn) {
      entry.purposes.delete(p);
    }
    this.evictions++;

    if (entry.purposes.size === 0) {
      this.cache.delete(principalId);
    }

    return true;
  }

  /**
   * Clears all cached items.
   */
  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; hits: number; misses: number; evictions: number } {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }
}
