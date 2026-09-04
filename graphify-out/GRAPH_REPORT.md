# Graph Report - my_Compliance  (2026-09-04)

## Corpus Check
- Large corpus: 90 files · ~1,183,283 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 579 nodes · 912 edges · 33 communities (25 shown, 8 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 55 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Module 0
- Module 1
- Module 2
- Module 3
- Module 4
- Module 5
- Module 6
- Module 7
- Module 8
- Module 9
- Module 10
- Module 11
- Module 12
- Module 13
- Module 14
- Module 15
- Module 16
- Module 17
- Module 18
- Module 19
- Module 20
- Module 21
- Module 22
- Module 23
- Module 24
- Module 25
- Module 26
- Module 27
- Module 28
- Module 29
- Module 30
- Module 31
- Module 32

## God Nodes (most connected - your core abstractions)
1. `ControlPlaneStorage` - 29 edges
2. `LedgerService` - 28 edges
3. `ZoneAgentDaemon` - 26 edges
4. `AgentService` - 21 edges
5. `DatabaseAdapter` - 20 edges
6. `ControlPlaneServer` - 20 edges
7. `SqliteAdapter` - 16 edges
8. `CatalogService` - 16 edges
9. `EnterpriseDatabase` - 16 edges
10. `ConsentService` - 15 edges

## Surprising Connections (you probably didn't know these)
- `ZoneAgentDaemon` --references--> `AgentConfig`  [EXTRACTED]
  agent/src/daemon.ts → agent/src/config.ts
- `ZoneAgentDaemon` --references--> `InMemoryConsentCache`  [EXTRACTED]
  agent/src/daemon.ts → agent/src/consent/cache.ts
- `ZoneAgentDaemon` --references--> `DatabaseAdapter`  [EXTRACTED]
  agent/src/daemon.ts → agent/src/db/connector.ts
- `ZoneAgentDaemon` --references--> `PiiDiscoveryScanner`  [EXTRACTED]
  agent/src/daemon.ts → agent/src/discovery/scanner.ts
- `ZoneAgentDaemon` --references--> `DsrExecutor`  [EXTRACTED]
  agent/src/daemon.ts → agent/src/dsr/executor.ts

## Import Cycles
- None detected.

## Communities (33 total, 8 thin omitted)

### Community 0 - "Module 0"
Cohesion: 0.09
Nodes (16): ControlPlaneServer, __dirname, __filename, AgentService, RegisteredAgentRecord, DpoAuthService, DpoUser, SessionToken (+8 more)

### Community 1 - "Module 1"
Cohesion: 0.05
Nodes (51): canonicalJson(), computeBlockHash(), createLedgerBlock(), hashPrincipalId(), sha256(), verifyLedgerChain(), classifyByColumnName(), classifyColumnSample() (+43 more)

### Community 2 - "Module 2"
Cohesion: 0.08
Nodes (24): dependencies, @dpdp/shared, pg, description, devDependencies, tsx, @types/node, @types/pg (+16 more)

### Community 3 - "Module 3"
Cohesion: 0.09
Nodes (22): devDependencies, tsx, typescript, tsx, typescript, name, private, scripts (+14 more)

### Community 4 - "Module 4"
Cohesion: 0.09
Nodes (21): aadhaarCol, adapter, cache, cardCol, checkData, daemon, db, emailCol (+13 more)

### Community 5 - "Module 5"
Cohesion: 0.10
Nodes (20): dependencies, @dpdp/shared, description, devDependencies, tsx, @types/node, typescript, @dpdp/shared (+12 more)

### Community 6 - "Module 6"
Cohesion: 0.17
Nodes (16): closeDsrModal(), fetchAgents(), fetchConsents(), fetchDataMap(), fetchDsr(), fetchLedger(), fetchOverview(), getEventBadgeClass() (+8 more)

### Community 7 - "Module 7"
Cohesion: 0.10
Nodes (20): dependencies, @dpdp/shared, description, devDependencies, tsx, @types/node, typescript, @dpdp/shared (+12 more)

### Community 8 - "Module 8"
Cohesion: 0.18
Nodes (17): addToCart(), cart, catalogProducts, checkExistingSession(), checkoutCart(), closeLoginModal(), closeSignupModal(), fetchCatalog() (+9 more)

### Community 9 - "Module 9"
Cohesion: 0.18
Nodes (3): DatabaseAdapter, PiiDiscoveryScanner, DsrExecutor

### Community 10 - "Module 10"
Cohesion: 0.11
Nodes (18): agentAdapter, agentDaemon, checkUserRow, completedDsr, compOverview, cpServer, cpStorage, dataMap (+10 more)

### Community 11 - "Module 11"
Cohesion: 0.11
Nodes (17): dependencies, description, devDependencies, tsx, @types/node, typescript, tsx, @types/node (+9 more)

### Community 12 - "Module 12"
Cohesion: 0.12
Nodes (16): authData, completedDsr, dataMap, dsrList, dsrTask, enrollData, hbData, hbData2 (+8 more)

### Community 13 - "Module 13"
Cohesion: 0.15
Nodes (11): __dirname, __filename, CustomerSession, CustomerUser, EmployeeRecord, OrderRecord, ProductRecord, UserRecord (+3 more)

### Community 15 - "Module 15"
Cohesion: 0.14
Nodes (13): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, rootDir (+5 more)

### Community 16 - "Module 16"
Cohesion: 0.14
Nodes (13): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, rootDir (+5 more)

### Community 17 - "Module 17"
Cohesion: 0.14
Nodes (13): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, rootDir (+5 more)

### Community 18 - "Module 18"
Cohesion: 0.14
Nodes (13): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, rootDir (+5 more)

### Community 19 - "Module 19"
Cohesion: 0.17
Nodes (11): adminOrdersData, adminServer, catData, catData2, db, ecomServer, erasureData, exportData (+3 more)

### Community 20 - "Module 20"
Cohesion: 0.35
Nodes (4): AgentConfig, loadAgentConfig(), CachedConsent, ScannerOptions

### Community 22 - "Module 22"
Cohesion: 0.18
Nodes (3): DatabaseSync, node:sqlite, StatementSync

### Community 23 - "Module 23"
Cohesion: 0.18
Nodes (3): DatabaseSync, node:sqlite, StatementSync

### Community 24 - "Module 24"
Cohesion: 0.18
Nodes (3): DatabaseSync, node:sqlite, StatementSync

### Community 26 - "Module 26"
Cohesion: 0.36
Nodes (8): closeAddProductModal(), fetchCustomers(), fetchEmployees(), fetchInventory(), fetchOrders(), submitNewProduct(), switchTab(), updateStockPrompt()

### Community 29 - "Module 29"
Cohesion: 0.29
Nodes (4): DEFAULT_PORT_MAP, DiscoveredEndpoint, NetworkProbeConfig, NetworkProbeEngine

## Knowledge Gaps
- **242 isolated node(s):** `name`, `version`, `type`, `description`, `main` (+237 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 308 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ZoneAgentDaemon` connect `Module 14` to `Module 4`, `Module 9`, `Module 10`, `Module 20`, `Module 28`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `ControlPlaneStorage` connect `Module 0` to `Module 10`, `Module 12`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `EcomServer` connect `Module 27` to `Module 32`, `Module 10`, `Module 13`, `Module 19`, `Module 31`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **What connects `name`, `version`, `type` to the rest of the system?**
  _242 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Module 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08998435054773082 - nodes in this community are weakly interconnected._
- **Should `Module 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05323653962492438 - nodes in this community are weakly interconnected._
- **Should `Module 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._