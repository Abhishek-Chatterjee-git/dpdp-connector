import { randomUUID } from 'node:crypto';
import {
  DsrRequest,
  DsrType,
  DsrStatus,
  DsrTask,
  DsrExecutionReceipt,
} from '@dpdp/shared';
import { ControlPlaneStorage } from '../storage/db.js';
import { LedgerService } from './ledger.service.js';
import { AgentService } from './agent.service.js';
import { CatalogService } from './catalog.service.js';

export class DsrService {
  private storage: ControlPlaneStorage;
  private ledgerService: LedgerService;
  private agentService: AgentService;
  private catalogService: CatalogService;

  constructor(
    storage: ControlPlaneStorage,
    ledgerService: LedgerService,
    agentService: AgentService,
    catalogService: CatalogService
  ) {
    this.storage = storage;
    this.ledgerService = ledgerService;
    this.agentService = agentService;
    this.catalogService = catalogService;
  }

  /**
   * Initiates a DSR Erasure Saga across all discovered stores.
   */
  async createDsrRequest(
    principalId: string,
    requestType: DsrType = 'ERASURE',
    requestedBy: string = 'data_principal'
  ): Promise<DsrRequest> {
    const db = this.storage.getDb();
    const dsrId = `dsr_${randomUUID().slice(0, 8)}`;
    const now = new Date();
    const submittedAt = now.toISOString();

    // 72-hour statutory SLA under DPDP rules
    const slaDeadline = new Date(now.getTime() + 72 * 3600 * 1000).toISOString();

    // Build saga execution plan based on data map
    const dataMap = this.catalogService.getDataMap();
    const tasks: DsrTask[] = [];

    for (const table of dataMap) {
      // Find candidate filter column (id, email, user_id)
      let filterCol = table.columns.find(
        (c) =>
          c.name.toLowerCase() === 'id' ||
          c.name.toLowerCase() === 'user_id' ||
          c.name.toLowerCase() === 'email' ||
          (c.detectedPii && c.detectedPii.piiType === 'EMAIL')
      );

      if (!filterCol && table.columns.length > 0) {
        filterCol = table.columns[0];
      }

      if (filterCol) {
        const taskId = `task_dsr_${randomUUID().slice(0, 8)}`;
        const dsrTask: DsrTask = {
          taskId,
          dsrId,
          agentId: table.agentId,
          targetId: table.targetId,
          action: 'DELETE',
          tableName: table.tableName,
          filterColumn: filterCol.name,
          filterValue: principalId,
        };

        tasks.push(dsrTask);

        // Queue task to agent
        this.agentService.queueTask(table.agentId, 'TASK_DSR_EXECUTE', dsrTask);
      }
    }

    db.prepare(`
      INSERT INTO dsr_requests (
        dsr_id, principal_id, request_type, status, submitted_at, completed_at, sla_deadline, requested_by, tasks_json, proofs_json
      ) VALUES (?, ?, ?, 'IN_PROGRESS', ?, NULL, ?, ?, ?, '[]')
    `).run(
      dsrId,
      principalId,
      requestType,
      submittedAt,
      slaDeadline,
      requestedBy,
      JSON.stringify(tasks)
    );

    // Ledger DSR submission
    this.ledgerService.appendEvent(
      'DSR_SUBMITTED',
      'tenant-default',
      {
        dsrId,
        requestType,
        taskCount: tasks.length,
        slaDeadline,
        requestedBy,
      },
      principalId
    );

    return {
      dsrId,
      principalId,
      requestType,
      submittedAt,
      status: 'IN_PROGRESS',
      slaDeadline,
      requestedBy,
    };
  }

  processDsrReceipt(receipt: DsrExecutionReceipt): boolean {
    const db = this.storage.getDb();
    const row = db
      .prepare('SELECT * FROM dsr_requests WHERE dsr_id = ?')
      .get(receipt.dsrId) as unknown as {
      dsr_id: string;
      principal_id: string;
      tasks_json: string;
      proofs_json: string;
    } | undefined;

    if (!row) return false;

    const tasks = JSON.parse(row.tasks_json) as DsrTask[];
    const proofs = JSON.parse(row.proofs_json || '[]') as DsrExecutionReceipt[];

    proofs.push(receipt);

    const isAllCompleted = proofs.length >= tasks.length;
    const newStatus: DsrStatus = isAllCompleted ? 'COMPLETED' : 'IN_PROGRESS';
    const completedAt = isAllCompleted ? new Date().toISOString() : null;

    db.prepare(`
      UPDATE dsr_requests 
      SET proofs_json = ?, status = ?, completed_at = ?
      WHERE dsr_id = ?
    `).run(JSON.stringify(proofs), newStatus, completedAt, receipt.dsrId);

    // Ledger completion proof
    this.ledgerService.appendEvent(
      'DSR_ERASURE_COMPLETED',
      'tenant-default',
      {
        dsrId: receipt.dsrId,
        taskId: receipt.taskId,
        targetId: receipt.targetId,
        recordsAffected: receipt.recordsAffected,
        agentSignature: receipt.agentSignature,
        completedAt: receipt.completedAt,
        status: receipt.status,
      },
      row.principal_id
    );

    return true;
  }

  getDsrRequests(): any[] {
    const db = this.storage.getDb();
    const rows = db.prepare('SELECT * FROM dsr_requests ORDER BY submitted_at DESC').all() as unknown as {
      dsr_id: string;
      principal_id: string;
      request_type: string;
      status: string;
      submitted_at: string;
      completed_at: string | null;
      sla_deadline: string;
      requested_by: string;
      tasks_json: string;
      proofs_json: string;
    }[];

    return rows.map((r) => ({
      dsrId: r.dsr_id,
      principalId: r.principal_id,
      requestType: r.request_type,
      status: r.status,
      submittedAt: r.submitted_at,
      completedAt: r.completed_at || undefined,
      slaDeadline: r.sla_deadline,
      requestedBy: r.requested_by,
      tasks: JSON.parse(r.tasks_json),
      proofs: JSON.parse(r.proofs_json || '[]'),
    }));
  }
}
