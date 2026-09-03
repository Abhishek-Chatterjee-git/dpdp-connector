/**
 * Core domain types and contracts for DPDP Act Compliance Connector
 */

// --- PII Classifications ---
export type PiiType = 
  | 'AADHAAR'
  | 'PAN'
  | 'PHONE'
  | 'EMAIL'
  | 'CREDIT_CARD'
  | 'UPI_ID'
  | 'NAME'
  | 'ADDRESS'
  | 'BANK_ACCOUNT'
  | 'UNKNOWN';

export interface PiiDetectionResult {
  piiType: PiiType;
  confidence: number; // 0.0 to 1.0
  sampleCount: number;
  matchCount: number;
  sampleMasked?: string;
  reason?: string;
}

// --- Agent & Discovery Metadata ---
export interface AgentRegistrationRequest {
  agentId: string;
  agentName: string;
  version: string;
  environment: string; // 'production' | 'staging' | 'vpc-dev'
  targetEndpoints: string[]; // e.g. ['postgres://db.internal:5432/ecom']
}

export interface AgentRegistrationResponse {
  success: boolean;
  agentToken: string;
  heartbeatIntervalSec: number;
}

export type AgentStatus = 'ACTIVE' | 'DORMANT' | 'SCANNING' | 'ERROR' | 'OFFLINE';

export interface ColumnMetadata {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  detectedPii?: PiiDetectionResult;
  manualOverridePii?: PiiType;
  purposeTags?: string[];
}

export interface TableMetadata {
  tableName: string;
  schema?: string;
  columns: ColumnMetadata[];
  rowCountEstimate: number;
  ddlChecksum: string;
}

export interface DiscoveryReport {
  agentId: string;
  targetId: string;
  targetType: 'POSTGRES' | 'SQLITE' | 'MYSQL' | 'MONGODB' | 'REST_API';
  targetUriMasked: string;
  timestamp: string;
  tables: TableMetadata[];
  overallDdlChecksum: string;
}

// --- Consent & Notices ---
export interface ConsentPurpose {
  purposeId: string;
  name: string;
  description: string;
  isMandatory: boolean; // e.g. essential services vs marketing
  retentionDays?: number;
}

export interface ConsentNotice {
  noticeId: string;
  version: string;
  title: string;
  purposes: ConsentPurpose[];
  activeFrom: string;
}

export interface PrincipalConsentState {
  principalId: string; // User ID / Email
  noticeVersion: string;
  consentedPurposes: string[]; // List of purposeIds
  timestamp: string;
  ipAddress?: string;
  channel: string; // 'web_signup' | 'mobile_app' | 'checkout'
}

export interface ConsentCheckRequest {
  principalId: string;
  purposeId: string;
}

export interface ConsentCheckResponse {
  allowed: boolean;
  reason: string;
  noticeVersion?: string;
  checkedAt: string;
}

export interface ConsentWithdrawalEvent {
  principalId: string;
  purposesWithdrawn: string[]; // specific purposes, or ['*'] for full withdrawal
  timestamp: string;
  reason?: string;
}

// --- Data Subject Rights (DSR) & Sagas ---
export type DsrType = 'ERASURE' | 'ACCESS' | 'CORRECTION' | 'PORTABILITY';
export type DsrStatus = 'SUBMITTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'REJECTED';

export interface DsrRequest {
  dsrId: string;
  principalId: string;
  requestType: DsrType;
  submittedAt: string;
  status: DsrStatus;
  slaDeadline: string;
  requestedBy: string;
}

export interface DsrTask {
  taskId: string;
  dsrId: string;
  agentId: string;
  targetId: string;
  action: 'DELETE' | 'ANONYMIZE';
  tableName: string;
  filterColumn: string;
  filterValue: string;
  anonymizeMasks?: Record<string, string>; // column -> placeholder
}

export interface DsrExecutionReceipt {
  taskId: string;
  dsrId: string;
  agentId: string;
  targetId: string;
  status: 'SUCCESS' | 'FAILED';
  recordsAffected: number;
  completedAt: string;
  errorMessage?: string;
  agentSignature: string; // SHA-256 HMAC or RSA signature of receipt payload
}

// --- Tamper-Evident Audit Ledger ---
export type LedgerEventType = 
  | 'AGENT_REGISTERED'
  | 'DISCOVERY_SCHEMA_INGESTED'
  | 'SCHEMA_DRIFT_DETECTED'
  | 'CONSENT_GRANTED'
  | 'CONSENT_WITHDRAWN'
  | 'CACHE_INVALIDATION_PUSHED'
  | 'DSR_SUBMITTED'
  | 'DSR_TASK_DISPATCHED'
  | 'DSR_ERASURE_COMPLETED'
  | 'TPRM_VIOLATION_FLAGGED'
  | 'DPO_USER_PROVISIONED'
  | 'DPO_AUTHENTICATION_SUCCESS';

export interface LedgerBlock<T = any> {
  index: number;
  timestamp: string;
  eventType: LedgerEventType;
  tenantId: string;
  principalIdHash?: string; // SHA-256 of principal ID for privacy in audit logs
  payload: T;
  prevHash: string;
  hash: string;
}

// --- Agent Command / Task Polling ---
export type AgentTaskType = 
  | 'TASK_DISCOVERY_TRIGGER'
  | 'TASK_CONSENT_INVALIDATE'
  | 'TASK_DSR_EXECUTE';

export interface AgentTask {
  taskId: string;
  type: AgentTaskType;
  data: any;
  createdAt: string;
}
