/**
 * Agent Configuration & Environment Resolver
 */

export interface AgentConfig {
  agentId: string;
  agentName: string;
  agentSecret: string;
  environment: string;
  controlPlaneUrl: string;
  agentPort: number;
  heartbeatIntervalMs: number;
  ddlCheckIntervalMs: number;
  dbType: 'SQLITE' | 'POSTGRES';
  dbConnectionString: string;
  sampleRowLimit: number;
}

export function loadAgentConfig(): AgentConfig {
  return {
    agentId: process.env.AGENT_ID || `agent-${process.pid}`,
    agentName: process.env.AGENT_NAME || 'Zone-Agent-Default',
    agentSecret: process.env.AGENT_SECRET || 'dev-agent-secret-key-12345',
    environment: process.env.NODE_ENV || 'development',
    controlPlaneUrl: process.env.CONTROL_PLANE_URL || 'http://127.0.0.1:4000',
    agentPort: parseInt(process.env.AGENT_PORT || '5000', 10),
    heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '5000', 10),
    ddlCheckIntervalMs: parseInt(process.env.DDL_CHECK_INTERVAL_MS || '15000', 10),
    dbType: (process.env.DB_TYPE?.toUpperCase() === 'POSTGRES' ? 'POSTGRES' : 'SQLITE') as 'SQLITE' | 'POSTGRES',
    dbConnectionString: process.env.DB_CONNECTION_STRING || './data/enterprise.sqlite',
    sampleRowLimit: parseInt(process.env.SAMPLE_ROW_LIMIT || '200', 10),
  };
}
