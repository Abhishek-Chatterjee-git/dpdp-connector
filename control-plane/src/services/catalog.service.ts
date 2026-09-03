import { DiscoveryReport, TableMetadata, ColumnMetadata } from '@dpdp/shared';
import { ControlPlaneStorage } from '../storage/db.js';
import { LedgerService } from './ledger.service.js';

export interface DataMapTableSummary {
  agentId: string;
  targetId: string;
  tableName: string;
  columns: ColumnMetadata[];
  rowCountEstimate: number;
  ddlChecksum: string;
  updatedAt: string;
  piiColumnsCount: number;
}

export class CatalogService {
  private storage: ControlPlaneStorage;
  private ledgerService: LedgerService;

  constructor(storage: ControlPlaneStorage, ledgerService: LedgerService) {
    this.storage = storage;
    this.ledgerService = ledgerService;
  }

  ingestDiscoveryReport(report: DiscoveryReport): void {
    const db = this.storage.getDb();
    const now = new Date().toISOString();

    for (const table of report.tables) {
      db.prepare(`
        INSERT INTO discovered_tables (
          agent_id, target_id, table_name, columns_json, row_count_estimate, ddl_checksum, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(agent_id, target_id, table_name) DO UPDATE SET
          columns_json = excluded.columns_json,
          row_count_estimate = excluded.row_count_estimate,
          ddl_checksum = excluded.ddl_checksum,
          updated_at = excluded.updated_at
      `).run(
        report.agentId,
        report.targetId,
        table.tableName,
        JSON.stringify(table.columns),
        table.rowCountEstimate,
        table.ddlChecksum,
        now
      );
    }

    this.ledgerService.appendEvent('DISCOVERY_SCHEMA_INGESTED', 'tenant-default', {
      agentId: report.agentId,
      targetId: report.targetId,
      targetType: report.targetType,
      tableCount: report.tables.length,
      overallDdlChecksum: report.overallDdlChecksum,
    });
  }

  getDataMap(): DataMapTableSummary[] {
    const db = this.storage.getDb();
    const rows = db.prepare('SELECT * FROM discovered_tables ORDER BY table_name ASC').all() as unknown as {
      agent_id: string;
      target_id: string;
      table_name: string;
      columns_json: string;
      row_count_estimate: number;
      ddl_checksum: string;
      updated_at: string;
    }[];

    return rows.map((r) => {
      const columns = JSON.parse(r.columns_json) as ColumnMetadata[];
      const piiColumnsCount = columns.filter((c) => c.detectedPii && c.detectedPii.piiType !== 'UNKNOWN').length;

      return {
        agentId: r.agent_id,
        targetId: r.target_id,
        tableName: r.table_name,
        columns,
        rowCountEstimate: r.row_count_estimate,
        ddlChecksum: r.ddl_checksum,
        updatedAt: r.updated_at,
        piiColumnsCount,
      };
    });
  }

  updateColumnPurpose(
    tableName: string,
    columnName: string,
    purposeTags: string[],
    overridePii?: string
  ): boolean {
    const db = this.storage.getDb();
    const row = db
      .prepare('SELECT * FROM discovered_tables WHERE table_name = ?')
      .get(tableName) as unknown as { id: number; columns_json: string } | undefined;

    if (!row) return false;

    const columns = JSON.parse(row.columns_json) as ColumnMetadata[];
    const targetCol = columns.find((c) => c.name === columnName);
    if (!targetCol) return false;

    targetCol.purposeTags = purposeTags;
    if (overridePii) {
      targetCol.manualOverridePii = overridePii as any;
    }

    db.prepare('UPDATE discovered_tables SET columns_json = ? WHERE id = ?').run(
      JSON.stringify(columns),
      row.id
    );

    return true;
  }
}
