import { createHmac } from 'node:crypto';
import { DsrTask, DsrExecutionReceipt, canonicalJson } from '@dpdp/shared';
import { DatabaseAdapter } from '../db/connector.js';

export class DsrExecutor {
  private adapter: DatabaseAdapter;
  private agentId: string;
  private agentSecret: string;

  constructor(adapter: DatabaseAdapter, agentId: string, agentSecret: string) {
    this.adapter = adapter;
    this.agentId = agentId;
    this.agentSecret = agentSecret;
  }

  /**
   * Executes a local DSR task (atomic deletion or anonymization) and signs the completion receipt.
   */
  async executeTask(task: DsrTask): Promise<DsrExecutionReceipt> {
    const completedAt = new Date().toISOString();
    let recordsAffected = 0;
    let status: 'SUCCESS' | 'FAILED' = 'SUCCESS';
    let errorMessage: string | undefined;

    try {
      await this.adapter.connect();

      if (task.action === 'DELETE') {
        recordsAffected = await this.adapter.executeDelete(
          task.tableName,
          task.filterColumn,
          task.filterValue
        );
      } else if (task.action === 'ANONYMIZE') {
        const masks = task.anonymizeMasks || {
          name: 'ANONYMIZED_USER',
          email: 'anon@deleted.local',
          phone: '0000000000',
          aadhaar: '000000000000',
          pan: 'XXXXX0000X',
        };
        recordsAffected = await this.adapter.executeAnonymize(
          task.tableName,
          task.filterColumn,
          task.filterValue,
          masks
        );
      } else {
        throw new Error(`Unsupported DSR action: ${task.action}`);
      }
    } catch (err: any) {
      status = 'FAILED';
      errorMessage = err?.message || String(err);
      console.error(`[DSR Executor] Task ${task.taskId} failed:`, err);
    }

    // Generate cryptographic agent signature
    const signaturePayload = {
      taskId: task.taskId,
      dsrId: task.dsrId,
      agentId: this.agentId,
      targetId: task.targetId,
      status,
      recordsAffected,
      completedAt,
    };

    const agentSignature = createHmac('sha256', this.agentSecret)
      .update(canonicalJson(signaturePayload))
      .digest('hex');

    return {
      taskId: task.taskId,
      dsrId: task.dsrId,
      agentId: this.agentId,
      targetId: task.targetId,
      status,
      recordsAffected,
      completedAt,
      errorMessage,
      agentSignature,
    };
  }
}
