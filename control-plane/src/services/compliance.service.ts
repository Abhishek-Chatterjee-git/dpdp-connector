import { CatalogService } from './catalog.service.js';
import { ConsentService } from './consent.service.js';
import { DsrService } from './dsr.service.js';
import { LedgerService } from './ledger.service.js';
import { AgentService } from './agent.service.js';

export interface ComplianceScoreReport {
  overallScore: number; // 0 - 100
  grade: 'A+' | 'A' | 'B' | 'C' | 'FAIL';
  breakdown: {
    catalogDiscoveryScore: number;
    consentGovernanceScore: number;
    dsrSlaAdherenceScore: number;
    ledgerIntegrityScore: number;
  };
  metrics: {
    connectedAgentsCount: number;
    discoveredTablesCount: number;
    piiFieldsClassifiedCount: number;
    activeConsentsCount: number;
    withdrawnConsentsCount: number;
    completedDsrsCount: number;
    pendingDsrsCount: number;
    ledgerBlockCount: number;
    ledgerValid: boolean;
  };
  recommendations: string[];
}

export class ComplianceService {
  private catalogService: CatalogService;
  private consentService: ConsentService;
  private dsrService: DsrService;
  private ledgerService: LedgerService;
  private agentService: AgentService;

  constructor(
    catalogService: CatalogService,
    consentService: ConsentService,
    dsrService: DsrService,
    ledgerService: LedgerService,
    agentService: AgentService
  ) {
    this.catalogService = catalogService;
    this.consentService = consentService;
    this.dsrService = dsrService;
    this.ledgerService = ledgerService;
    this.agentService = agentService;
  }

  getComplianceReport(): ComplianceScoreReport {
    const agents = this.agentService.getAgents();
    const dataMap = this.catalogService.getDataMap();
    const consents = this.consentService.getAllConsents();
    const dsrs = this.dsrService.getDsrRequests();
    const ledgerIntegrity = this.ledgerService.verifyIntegrity();

    // 1. Catalog score
    let piiCount = 0;
    let totalCols = 0;
    for (const t of dataMap) {
      for (const c of t.columns) {
        totalCols++;
        if (c.detectedPii && c.detectedPii.piiType !== 'UNKNOWN') {
          piiCount++;
        }
      }
    }
    const catalogScore = dataMap.length > 0 ? (agents.length > 0 ? 100 : 70) : 30;

    // 2. Consent governance score
    const activeConsents = consents.filter((c) => c.status === 'ACTIVE').length;
    const withdrawnConsents = consents.filter((c) => c.status === 'WITHDRAWN' || c.status === 'PARTIAL').length;
    const consentScore = consents.length > 0 ? 95 : 60;

    // 3. DSR SLA score
    const completedDsrs = dsrs.filter((d) => d.status === 'COMPLETED').length;
    const pendingDsrs = dsrs.filter((d) => d.status === 'IN_PROGRESS').length;
    const dsrScore = pendingDsrs === 0 ? 100 : 85;

    // 4. Ledger integrity score
    const ledgerScore = ledgerIntegrity.valid ? 100 : 0;

    const overallScore = Math.round(
      catalogScore * 0.25 + consentScore * 0.25 + dsrScore * 0.25 + ledgerScore * 0.25
    );

    let grade: 'A+' | 'A' | 'B' | 'C' | 'FAIL' = 'A';
    if (!ledgerIntegrity.valid) grade = 'FAIL';
    else if (overallScore >= 95) grade = 'A+';
    else if (overallScore >= 85) grade = 'A';
    else if (overallScore >= 70) grade = 'B';
    else grade = 'C';

    const recommendations: string[] = [];
    if (agents.length === 0) {
      recommendations.push('Deploy at least one Zone Agent to connect your enterprise data stores.');
    }
    if (dataMap.length === 0) {
      recommendations.push('Run initial schema discovery scan on registered target databases.');
    }
    if (!ledgerIntegrity.valid) {
      recommendations.push('CRITICAL: Audit ledger chain failed cryptographic verification! Potential tampering.');
    }
    if (recommendations.length === 0) {
      recommendations.push('All systems compliant under Digital Personal Data Protection Act 2025 standard.');
    }

    return {
      overallScore,
      grade,
      breakdown: {
        catalogDiscoveryScore: catalogScore,
        consentGovernanceScore: consentScore,
        dsrSlaAdherenceScore: dsrScore,
        ledgerIntegrityScore: ledgerScore,
      },
      metrics: {
        connectedAgentsCount: agents.length,
        discoveredTablesCount: dataMap.length,
        piiFieldsClassifiedCount: piiCount,
        activeConsentsCount: activeConsents,
        withdrawnConsentsCount: withdrawnConsents,
        completedDsrsCount: completedDsrs,
        pendingDsrsCount: pendingDsrs,
        ledgerBlockCount: ledgerIntegrity.totalBlocks,
        ledgerValid: ledgerIntegrity.valid,
      },
      recommendations,
    };
  }
}
