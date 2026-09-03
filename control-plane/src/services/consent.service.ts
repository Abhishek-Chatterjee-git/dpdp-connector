import { PrincipalConsentState } from '@dpdp/shared';
import { ControlPlaneStorage } from '../storage/db.js';
import { LedgerService } from './ledger.service.js';
import { AgentService } from './agent.service.js';

export class ConsentService {
  private storage: ControlPlaneStorage;
  private ledgerService: LedgerService;
  private agentService: AgentService;

  constructor(
    storage: ControlPlaneStorage,
    ledgerService: LedgerService,
    agentService: AgentService
  ) {
    this.storage = storage;
    this.ledgerService = ledgerService;
    this.agentService = agentService;
  }

  recordConsent(
    principalId: string,
    noticeVersion: string,
    purposes: string[],
    channel: string = 'web_signup'
  ): PrincipalConsentState {
    const db = this.storage.getDb();
    const timestamp = new Date().toISOString();

    db.prepare(`
      INSERT INTO consents (
        principal_id, notice_version, consented_purposes, status, channel, timestamp, withdrawn_at
      ) VALUES (?, ?, ?, 'ACTIVE', ?, ?, NULL)
      ON CONFLICT(principal_id) DO UPDATE SET
        notice_version = excluded.notice_version,
        consented_purposes = excluded.consented_purposes,
        status = 'ACTIVE',
        channel = excluded.channel,
        timestamp = excluded.timestamp,
        withdrawn_at = NULL
    `).run(
      principalId,
      noticeVersion,
      JSON.stringify(purposes),
      channel,
      timestamp
    );

    // Append to cryptographic audit ledger
    this.ledgerService.appendEvent(
      'CONSENT_GRANTED',
      'tenant-default',
      {
        noticeVersion,
        consentedPurposes: purposes,
        channel,
      },
      principalId
    );

    return {
      principalId,
      noticeVersion,
      consentedPurposes: purposes,
      timestamp,
      channel,
    };
  }

  withdrawConsent(
    principalId: string,
    purposesWithdrawn: string[] = ['*'],
    reason: string = 'user_requested_withdrawal'
  ): { success: boolean; status: string; invalidatedAgentsCount: number } {
    const db = this.storage.getDb();
    const row = db
      .prepare('SELECT * FROM consents WHERE principal_id = ?')
      .get(principalId) as unknown as {
      principal_id: string;
      notice_version: string;
      consented_purposes: string;
      status: string;
    } | undefined;

    if (!row) {
      return { success: false, status: 'NOT_FOUND', invalidatedAgentsCount: 0 };
    }

    const currentPurposes = JSON.parse(row.consented_purposes) as string[];
    const now = new Date().toISOString();

    let updatedPurposes: string[] = [];
    let newStatus = 'WITHDRAWN';

    if (!purposesWithdrawn.includes('*')) {
      updatedPurposes = currentPurposes.filter((p) => !purposesWithdrawn.includes(p));
      newStatus = updatedPurposes.length > 0 ? 'PARTIAL' : 'WITHDRAWN';
    }

    db.prepare(`
      UPDATE consents 
      SET consented_purposes = ?, status = ?, withdrawn_at = ?
      WHERE principal_id = ?
    `).run(JSON.stringify(updatedPurposes), newStatus, now, principalId);

    // Ledger withdrawal
    this.ledgerService.appendEvent(
      'CONSENT_WITHDRAWN',
      'tenant-default',
      {
        purposesWithdrawn,
        remainingPurposes: updatedPurposes,
        reason,
      },
      principalId
    );

    // Fan-out cache invalidation task to all active agents
    const agents = this.agentService.getAgents();
    let count = 0;
    for (const agent of agents) {
      if (agent.status === 'ACTIVE' || agent.status === 'DORMANT') {
        this.agentService.queueTask(agent.agentId, 'TASK_CONSENT_INVALIDATE', {
          principalId,
          purposesWithdrawn,
          timestamp: now,
        });
        count++;
      }
    }

    this.ledgerService.appendEvent('CACHE_INVALIDATION_PUSHED', 'tenant-default', {
      principalId,
      dispatchedAgentCount: count,
    });

    return {
      success: true,
      status: newStatus,
      invalidatedAgentsCount: count,
    };
  }

  getConsent(principalId: string): any {
    const db = this.storage.getDb();
    const row = db
      .prepare('SELECT * FROM consents WHERE principal_id = ?')
      .get(principalId) as unknown as {
      principal_id: string;
      notice_version: string;
      consented_purposes: string;
      status: string;
      channel: string;
      timestamp: string;
      withdrawn_at: string | null;
    } | undefined;

    if (!row) return null;

    return {
      principalId: row.principal_id,
      noticeVersion: row.notice_version,
      consentedPurposes: JSON.parse(row.consented_purposes),
      status: row.status,
      channel: row.channel,
      timestamp: row.timestamp,
      withdrawnAt: row.withdrawn_at || undefined,
    };
  }

  getAllConsents(): any[] {
    const db = this.storage.getDb();
    const rows = db.prepare('SELECT * FROM consents ORDER BY timestamp DESC').all() as unknown as {
      principal_id: string;
      notice_version: string;
      consented_purposes: string;
      status: string;
      channel: string;
      timestamp: string;
      withdrawn_at: string | null;
    }[];

    return rows.map((r) => ({
      principalId: r.principal_id,
      noticeVersion: r.notice_version,
      consentedPurposes: JSON.parse(r.consented_purposes),
      status: r.status,
      channel: r.channel,
      timestamp: r.timestamp,
      withdrawnAt: r.withdrawn_at || undefined,
    }));
  }
}
