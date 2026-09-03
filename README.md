# DPDP Act Compliance Connector & Enterprise Governance Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-24%2B-green.svg)](https://nodejs.org)
[![DPDP Act 2025](https://img.shields.io/badge/Compliance-DPDP%20Act%202025-blue.svg)](https://www.meity.gov.in)
[![Architecture](https://img.shields.io/badge/Architecture-Two--Plane%20Federated-purple.svg)](./design.md)

An enterprise-grade, platform-independent compliance connector and Data Protection Officer (DPO) governance platform built for India's **Digital Personal Data Protection Act, 2025 (DPDP Act)**.

---

## 🏛️ System Architecture: Two-Plane Federated Model

```
+------------------------------------------------------------------------------------------------+
|                        CENTRAL CONTROL PLANE & DPO CONSOLE (Port 4000)                         |
|  - Linear Dark Web Console (#010102) with RBAC Authentication & Officer Profile Switching     |
|  - Central Metadata Catalog & Schema Registry (Zero Raw Personal Data Egress)                  |
|  - Consent Lifecycle Manager & DSR Saga Orchestration Engine (72-hour Statutory SLA)           |
|  - Immutable Append-Only Audit Ledger Chained with RFC-8785 Canonical JSON & SHA-256           |
+-----------------------------------------------+------------------------------------------------+
                                                ^
                           Outbound mTLS / HTTP Metadata & Tasks Only
                                                |
+-----------------------------------------------+------------------------------------------------+
|                    ZONE AGENT (In-VPC Sidecar / Daemon - Port 5000)                            |
|  - Outbound-Only Communication (Zero Inbound Firewall Ports Needed)                            |
|  - Network & Service Auto-Discovery Probe Engine (PostgreSQL, MySQL, MongoDB, IMAP Mail)       |
|  - High-Speed In-Memory RAM Consent Cache (Sub-ms Hot-Path GET /consent/check < 1ms)           |
|  - Local PII Classifier: Algorithmic Verhoeff (Aadhaar), Luhn (Cards), Regex (PAN/Phone/Email) |
|  - Distributed DSR Saga Execution Worker with HMAC-signed Cryptographic Proof Receipts         |
|  - Schema Drift Watcher (DDL Checksum Hash) & Low-Memory Sleep Dormancy                        |
+-----------------------------------------------+------------------------------------------------+
                                                |
                                Internal Network Connection
                                                v
+------------------------------------------------------------------------------------------------+
|                     ENTERPRISE STOREFRONT APPLICATION (Port 3000)                              |
|  - Shopifi Dual-Track UI (Cinematic Dark Hero + Paper-Light Storefront)                        |
|  - Customer Authentication (SHA-256 Credentials & Session Management)                          |
|  - Statutory DPDP Consent Notice & Purpose Checkboxes during Signup (v2.1)                     |
|  - Dedicated Statutory Privacy Policy Page (/privacy-notice)                                   |
|  - Dedicated Self-Service Customer Privacy & Rights Portal (/privacy-center):                  |
|      * Real-time Consent Purpose Toggles (Immediate RAM Cache Eviction)                        |
|      * Right to Access Machine-Readable Personal Data Export (DPDP Section 11)                 |
|      * Statutory Right to Erasure / Account Deletion Saga (DPDP Section 12)                    |
|  - Transparent Backend DPDP Gating: Hot-path check on marketing communications & orders        |
+------------------------------------------------------------------------------------------------+
```

---

## 🚀 Key Features

1. **Zero-PII Egress Architecture**:
   - Customer personal data (names, payment cards, Aadhaar, emails, phones) **never leaves** the enterprise VPC/database.
   - The Zone Agent runs locally next to the database, extracts schema metadata, masks sensitive previews, and transmits only schema definitions to the Control Plane.

2. **Algorithmic Indian PII Classification**:
   - **Aadhaar**: 12-digit format with **Verhoeff Dihedral Group D5** checksum algorithm validation.
   - **Payment Cards**: 16-digit card validation with **Luhn (Mod 10)** algorithm.
   - **PAN, Phone, Email, UPI**: Strict format pattern verification.

3. **Sub-Millisecond Hot-Path Consent Gating (`< 1ms`)**:
   - Enterprise microservices query the local Zone Agent on localhost:
     `GET http://localhost:5000/consent/check?principal_id=usr_101&purpose=marketing_promo`
   - Answered from RAM cache in $< 1\text{ms}$.

4. **Event-Driven Instant Cache Invalidation**:
   - When a user withdraws consent in the customer privacy portal, the Control Plane records the withdrawal and pushes an eviction task on the next heartbeat tick, invalidating the local agent cache immediately.

5. **Distributed DSR Erasure Saga (Right to be Forgotten)**:
   - Coordinated distributed deletion across database tables under DPDP Section 12.
   - Zone agent executes atomic `DELETE`, signs an HMAC cryptographic proof receipt, and logs completion on the Control Plane audit ledger.

6. **Cryptographically Chained Tamper-Evident Audit Ledger**:
   - Every compliance event is serialized using deterministic canonical JSON (RFC-8785) and chained:
     $$\text{Block Hash} = \text{SHA256}(\text{prev\_hash} + ":" + \text{canonical\_json}(\text{event}))$$
   - One-click cryptographic verification button in DPO portal verifies mathematical chain integrity.

---

## 📦 Project Structure

```
.
├── shared/                       # Shared contracts, crypto ledger & PII classifiers
│   ├── src/
│   │   ├── types.ts              # Agent, Catalog, Consent, DSR, and Ledger types
│   │   ├── crypto/ledger.ts      # Canonical JSON & SHA-256 hash-chaining
│   │   ├── pii/verhoeff.ts       # Aadhaar Verhoeff algorithm
│   │   ├── pii/luhn.ts           # Payment Card Luhn algorithm
│   │   └── pii/classifiers.ts    # Regex & algorithmic PII detectors
│   └── src/test.ts               # Unit tests
│
├── agent/                        # Plug-and-play Zone Agent daemon
│   ├── src/
│   │   ├── config.ts             # Environment & settings resolver
│   │   ├── db/connector.ts       # SQLite (node:sqlite) & PostgreSQL adapters
│   │   ├── discovery/scanner.ts  # Local schema inspector & statistical sampler
│   │   ├── discovery/probe.ts    # Subnet probe (PostgreSQL, MySQL, IMAP, Mongo)
│   │   ├── consent/cache.ts      # Sub-millisecond in-memory hot-path cache
│   │   ├── dsr/executor.ts       # Atomic deletion/anonymize worker & HMAC signer
│   │   └── daemon.ts             # HTTP server & outbound heartbeat loop
│   ├── Dockerfile
│   └── src/test.ts               # Unit & integration tests
│
├── control-plane/                # Central Control Plane & DPO Dashboard
│   ├── src/
│   │   ├── storage/db.ts         # Control plane metadata storage
│   │   ├── services/             # Agent, Catalog, Consent, DSR, Ledger, Auth, Compliance
│   │   └── server.ts             # REST API & static dashboard server
│   ├── public/                   # Linear Dark Theme UI (HTML/Tailwind/JS)
│   ├── Dockerfile
│   └── src/test.ts               # Unit & integration tests
│
├── sim-enterprise/ecom-app/      # Demo Enterprise E-Commerce Storefront
│   ├── src/
│   │   ├── db.ts                 # Storefront database & seed data
│   │   ├── auth.ts               # Customer credentials & session service
│   │   └── server.ts             # Customer API, privacy portal & marketing gate
│   ├── public/                   # Shopifi Dual-Track UI (Store, /privacy-notice, /privacy-center)
│   ├── Dockerfile
│   └── src/test.ts               # Unit & integration tests
│
├── sequence-diagram/             # Mermaid sequence diagrams and workflows
│   ├── WORKFLOWS.md              # 5 core operational sequence diagrams
│   └── AGENT_DEPLOYMENT.md       # Agent enrollment & multi-VM network topology
│
├── scripts/demo-e2e.ts           # Complete end-to-end multi-tier POC demonstration
├── docker-compose.yml            # Multi-container orchestration
└── .env.proxmox.example          # Proxmox / multi-VM configuration template
```

---

## ⚡ Quick Start

### 1. Run with Docker Compose
```bash
docker compose up --build
```
Access the services:
- **DPO Governance Console & Control Plane**: [http://localhost:4000](http://localhost:4000)
  - Demo Admin: `dpo@enterprise-corp.in` / `Compliance@2025`
  - Demo Auditor: `auditor@compliance-audit.org` / `Auditor@2025`
- **Zone Agent Daemon**: [http://localhost:5000](http://localhost:5000)
- **Enterprise Storefront**: [http://localhost:3000](http://localhost:3000)
- **Statutory DPDP Notice**: [http://localhost:3000/privacy-notice](http://localhost:3000/privacy-notice)
- **Customer Privacy Portal**: [http://localhost:3000/privacy-center](http://localhost:3000/privacy-center)

---

### 2. Run Natively via Node Workspaces
```bash
# Install dependencies
npm install

# Run all self-tests
npm run test:shared
npm run test:agent
npm run test:cp
npm run test:ecom

# Run full end-to-end 3-tier lifecycle demonstration
npm run demo
```

---

## 🖥️ Proxmox Multi-VM Deployment

For virtualized multi-VM testing (e.g. Proxmox VE):

1. **VM 1 (Control Plane - `192.168.1.100`)**:
   ```bash
   docker run -d --name dpdp-control-plane -p 4000:4000 \
     -e CONTROL_PLANE_PORT=4000 -e NODE_ENV=production \
     -v /var/data/control_plane:/app/data dpdp-control-plane
   ```

2. **VM 3 (Database & Agent - `192.168.1.102`)**:
   ```bash
   docker run -d --name dpdp-zone-agent -p 5000:5000 \
     -e AGENT_ID="agent-proxmox-01" \
     -e CONTROL_PLANE_URL="http://192.168.1.100:4000" \
     -e PROBE_SUBNET="192.168.1.0/24" \
     -e DB_TYPE="POSTGRES" \
     -e DB_CONNECTION_STRING="postgres://app_user:Pass@127.0.0.1:5432/enterprise_ecom" \
     dpdp-zone-agent
   ```

3. **VM 2 (Storefront App - `192.168.1.101`)**:
   ```bash
   docker run -d --name dpdp-ecom-app -p 3000:3000 \
     -e ECOM_PORT=3000 \
     -e AGENT_URL="http://192.168.1.102:5000" \
     -e CONTROL_PLANE_URL="http://192.168.1.100:4000" \
     dpdp-ecom-app
   ```

See [`.env.proxmox.example`](./.env.proxmox.example) for configuration details.

---

## 📜 License
MIT License. Built for Digital Personal Data Protection Act (DPDP Act 2025) compliance.
