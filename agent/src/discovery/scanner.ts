import { DiscoveryReport, TableMetadata, ColumnMetadata, classifyColumnSample } from '@dpdp/shared';
import { DatabaseAdapter } from '../db/connector.js';

export interface ScannerOptions {
  agentId: string;
  targetId: string;
  targetType: 'SQLITE' | 'POSTGRES' | 'MYSQL' | 'MONGODB' | 'REST_API';
  targetUriMasked: string;
  sampleLimit?: number;
}

export class PiiDiscoveryScanner {
  private adapter: DatabaseAdapter;
  private options: ScannerOptions;

  constructor(adapter: DatabaseAdapter, options: ScannerOptions) {
    this.adapter = adapter;
    this.options = options;
  }

  /**
   * Performs non-blocking local schema discovery and PII sampling.
   */
  async scan(): Promise<DiscoveryReport> {
    await this.adapter.connect();

    const tableNames = await this.adapter.getTableList();
    const overallDdlChecksum = await this.adapter.getDdlChecksum();
    const tables: TableMetadata[] = [];
    const sampleLimit = this.options.sampleLimit || 200;

    for (const tableName of tableNames) {
      const columns = await this.adapter.getTableSchema(tableName);
      let sampleRows: Record<string, unknown>[] = [];

      try {
        sampleRows = await this.adapter.sampleRows(tableName, sampleLimit);
      } catch (err) {
        console.warn(`[Agent Scanner] Failed to sample rows from table '${tableName}':`, err);
      }

      // Classify each column using local sample values
      const enrichedColumns: ColumnMetadata[] = columns.map((col) => {
        const values = sampleRows
          .map((row) => row[col.name])
          .filter((v) => v !== null && v !== undefined && v !== '');

        const piiResult = classifyColumnSample(col.name, values);

        return {
          ...col,
          detectedPii: piiResult.piiType !== 'UNKNOWN' ? piiResult : undefined,
          purposeTags: this.inferPurposeTags(col.name, piiResult.piiType),
        };
      });

      tables.push({
        tableName,
        columns: enrichedColumns,
        rowCountEstimate: sampleRows.length,
        ddlChecksum: overallDdlChecksum,
      });
    }

    return {
      agentId: this.options.agentId,
      targetId: this.options.targetId,
      targetType: this.options.targetType,
      targetUriMasked: this.options.targetUriMasked,
      timestamp: new Date().toISOString(),
      tables,
      overallDdlChecksum,
    };
  }

  private inferPurposeTags(columnName: string, piiType: string): string[] {
    const norm = columnName.toLowerCase();
    const tags: string[] = [];

    if (norm.includes('auth') || norm.includes('password') || norm.includes('user_id') || norm.includes('id')) {
      tags.push('essential_identity');
    }
    if (norm.includes('email') || norm.includes('phone') || norm.includes('sms') || norm.includes('promo')) {
      tags.push('marketing_communication');
    }
    if (norm.includes('card') || norm.includes('payment') || norm.includes('upi') || norm.includes('billing')) {
      tags.push('payment_processing');
    }
    if (norm.includes('aadhaar') || norm.includes('pan') || norm.includes('kyc')) {
      tags.push('regulatory_kyc');
    }
    if (norm.includes('address') || norm.includes('city') || norm.includes('zip') || norm.includes('location')) {
      tags.push('order_delivery');
    }

    return tags.length > 0 ? tags : ['general_processing'];
  }
}
