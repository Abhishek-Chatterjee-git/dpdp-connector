import { randomUUID, createHash } from 'node:crypto';
import {
  AgentRegistrationRequest,
  AgentRegistrationResponse,
  AgentStatus,
  AgentTask,
  AgentTaskType,
} from '@dpdp/shared';
import { ControlPlaneStorage } from '../storage/db.js';
import { LedgerService } from './ledger.service.js';

export interface RegisteredAgentRecord {
  agentId: string;
  agentName: string;
  version: string;
  environment: string;
  agentToken: string;
  status: AgentStatus;
  lastHeartbeat: string;
  ddlChecksum?: string;
  targetEndpoints: string[];
  createdAt: string;
}

export class AgentService {
  private storage: ControlPlaneStorage;
  private ledgerService: LedgerService;

  constructor(storage: ControlPlaneStorage, ledgerService: LedgerService) {
    this.storage = storage;
    this.ledgerService = ledgerService;
  }

  registerAgent(req: AgentRegistrationRequest): AgentRegistrationResponse {
    const db = this.storage.getDb();
    const token = `dpdp_token_${createHash('sha256').update(req.agentId + Date.now()).digest('hex').slice(0, 24)}`;
    const now = new Date().toISOString();

    const existing = db
      .prepare('SELECT agent_id FROM agents WHERE agent_id = ?')
      .get(req.agentId);

    if (existing) {
      db.prepare(`
        UPDATE agents 
        SET agent_name = ?, version = ?, environment = ?, agent_token = ?, status = 'ACTIVE', last_heartbeat = ?, target_endpoints = ?
        WHERE agent_id = ?
      `).run(
        req.agentName,
        req.version,
        req.environment,
        token,
        now,
        JSON.stringify(req.targetEndpoints),
        req.agentId
      );
    } else {
      db.prepare(`
        INSERT INTO agents (
          agent_id, agent_name, version, environment, agent_token, status, last_heartbeat, target_endpoints, created_at
        ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
      `).run(
        req.agentId,
        req.agentName,
        req.version,
        req.environment,
        token,
        now,
        JSON.stringify(req.targetEndpoints),
        now
      );

      this.ledgerService.appendEvent('AGENT_REGISTERED', 'tenant-default', {
        agentId: req.agentId,
        agentName: req.agentName,
        environment: req.environment,
        targetEndpoints: req.targetEndpoints,
      });
    }

    return {
      success: true,
      agentToken: token,
      heartbeatIntervalSec: 5,
    };
  }

  processHeartbeat(
    agentId: string,
    status: AgentStatus,
    ddlChecksum?: string,
    cacheStats?: any
  ): { tasks: AgentTask[] } {
    const db = this.storage.getDb();
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE agents 
      SET status = ?, last_heartbeat = ?, ddl_checksum = COALESCE(?, ddl_checksum)
      WHERE agent_id = ?
    `).run(status, now, ddlChecksum || null, agentId);

    // Pull pending tasks for this agent
    const tasks = this.pullPendingTasks(agentId);
    return { tasks };
  }

  getAgents(): RegisteredAgentRecord[] {
    const db = this.storage.getDb();
    const rows = db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all() as unknown as {
      agent_id: string;
      agent_name: string;
      version: string;
      environment: string;
      agent_token: string;
      status: AgentStatus;
      last_heartbeat: string;
      ddl_checksum: string | null;
      target_endpoints: string;
      created_at: string;
    }[];

    const now = Date.now();

    return rows.map((r) => {
      // If no heartbeat for > 20s, mark as OFFLINE
      const lastHbTime = new Date(r.last_heartbeat).getTime();
      let effectiveStatus = r.status;
      if (now - lastHbTime > 20000 && r.status !== 'ERROR') {
        effectiveStatus = 'OFFLINE';
      }

      return {
        agentId: r.agent_id,
        agentName: r.agent_name,
        version: r.version,
        environment: r.environment,
        agentToken: r.agent_token,
        status: effectiveStatus,
        lastHeartbeat: r.last_heartbeat,
        ddlChecksum: r.ddl_checksum || undefined,
        targetEndpoints: JSON.parse(r.target_endpoints),
        createdAt: r.created_at,
      };
    });
  }

  queueTask(agentId: string, taskType: AgentTaskType, data: any): string {
    const db = this.storage.getDb();
    const taskId = `task_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO pending_tasks (task_id, agent_id, task_type, task_data_json, status, created_at)
      VALUES (?, ?, ?, ?, 'PENDING', ?)
    `).run(taskId, agentId, taskType, JSON.stringify(data), now);

    return taskId;
  }

  pullPendingTasks(agentId: string): AgentTask[] {
    const db = this.storage.getDb();
    const rows = db
      .prepare("SELECT * FROM pending_tasks WHERE agent_id = ? AND status = 'PENDING'")
      .all(agentId) as unknown as {
      task_id: string;
      agent_id: string;
      task_type: AgentTaskType;
      task_data_json: string;
      created_at: string;
    }[];

    if (rows.length > 0) {
      db.prepare("UPDATE pending_tasks SET status = 'DISPATCHED' WHERE agent_id = ? AND status = 'PENDING'").run(
        agentId
      );
    }

    return rows.map((r) => ({
      taskId: r.task_id,
      type: r.task_type,
      data: JSON.parse(r.task_data_json),
      createdAt: r.created_at,
    }));
  }
}
