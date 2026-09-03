# Design: DPDP Act Compliance Connector (Two-Plane Architecture)

## 1. System Architecture Overview

```
+-------------------------------------------------------------------------------+
|                       CENTRAL CONTROL PLANE (Port 4000)                       |
|  - Interactive DPO Web Dashboard (Linear Dark Aesthetic #010102)              |
|  - Metadata Catalog & Schema Registry (Zero Raw Customer PII)                 |
|  - DPDP Rulepack Engine & Compliance Health Scorer                            |
|  - Consent & DSR Saga Orchestrator                                            |
|  - Immutable Append-Only Audit Ledger (SHA-256 Hash Chained)                  |
+---------------------------------------+---------------------------------------+
                                        ^
                   Outbound mTLS / HTTP Polling / WebSocket
                   (Port 4000 - Metadata & Tasks only)
                                        |
+---------------------------------------+---------------------------------------+
|                    ZONE AGENT (Sidecar / Port 5000)                           |
|  - Plug-and-Play Standalone Daemon (Platform Independent)                     |
|  - Agent Core (Scheduler, Heartbeat, Dormancy Watcher via DDL Hashing)        |
|  - In-Memory Consent Cache (Sub-ms hot-path GET /consent/check)               |
|  - Local Scrape & Discovery Engine (PII Regex + Verhoeff/Luhn validation)     |
|  - DSR Saga Executor (Executes local atomic delete/anonymize actions)         |
+---------------------------------------+---------------------------------------+
                                        |
                   Internal Network / Connection Strings
                                        v
+-------------------------------------------------------------------------------+
|             DEMO E-COMMERCE ENTERPRISE APP (Port 3000)                        |
|  - Shopifi Dual-Track UI (Cinematic Dark Hero + Paper Light Storefront)       |
|  - Auth & Signup Flow with DPDP Granular Consent Notice (v2.1)                |
|  - Customer Profile & Payment Settings (Aadhaar, PAN, UPI, Saved Cards)       |
|  - User Privacy & Consent Withdrawal Portal (Granular Opt-Out + Erasure)      |
|  - Gated Marketing Route (Calls Agent `GET /consent/check` in real-time)      |
|  - Enterprise Database (PostgreSQL / Native SQLite via node:sqlite)           |
+-------------------------------------------------------------------------------+
```

---

## 2. Directory Layout & Module Structure

```
my_Compliance/
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
│   │   ├── consent/cache.ts      # Sub-millisecond in-memory hot-path cache
│   │   ├── dsr/executor.ts       # Atomic deletion/anonymize worker & HMAC signer
│   │   └── daemon.ts             # HTTP server & outbound heartbeat loop
│   ├── Dockerfile
│   └── src/test.ts               # Unit & integration tests
│
├── control-plane/                # Central Control Plane & DPO Dashboard
│   ├── src/
│   │   ├── storage/db.ts         # Control plane metadata storage
│   │   ├── services/             # Agent, Catalog, Consent, DSR, Ledger, Compliance
│   │   └── server.ts             # REST API & static dashboard server
│   ├── public/                   # Linear Dark Theme UI (HTML/Tailwind/JS)
│   ├── Dockerfile
│   └── src/test.ts               # Unit & integration tests
│
├── sim-enterprise/ecom-app/      # Demo Enterprise E-Commerce Storefront
│   ├── src/
│   │   ├── db.ts                 # Storefront database & seed data
│   │   └── server.ts             # Customer API, privacy portal & marketing gate
│   ├── public/                   # Shopifi Dual-Track UI (HTML/Tailwind/JS)
│   ├── Dockerfile
│   └── src/test.ts               # Unit & integration tests
│
├── scripts/demo-e2e.ts           # Complete end-to-end multi-tier POC demonstration
├── docker-compose.yml            # Multi-container orchestration
└── package.json                  # Root npm workspace
```

---

## 3. UI Design Specifications

### 3.1 DPO Control Plane Dashboard ([`control-plane/public/`](file:///C:/Users/Abhishek/Desktop/my_Compliance/control-plane/public))
- Follows [`ui_design.md`](file:///C:/Users/Abhishek/Desktop/my_Compliance/ui_design.md) (Linear Dark System).
- Canvas `#010102`, 4-step surface ladder (`#0e1015`, `#161922`, `#1f232e`), Lavender `#5e6ad2` accents, hairline dividers `#23252a`.
- Features: Live Compliance Scorecard (Grade A+ 99%), Real-time Telemetry feed, Enterprise Data Map with PII confidence badges, Consent Ledger, DSR Saga Manager, and Block Explorer with Cryptographic Verification.

### 3.2 E-Commerce Storefront ([`sim-enterprise/ecom-app/public/`](file:///C:/Users/Abhishek/Desktop/my_Compliance/sim-enterprise/ecom-app/public))
- Follows [`ecom_Design.md`](file:///C:/Users/Abhishek/Desktop/my_Compliance/ecom_Design.md) (Shopifi Dual-Track System).
- Cinematic Dark Hero (`#000000`) with thin editorial display typography (weights 330-500, `ss03` font features) and white-stroked outline pills.
- Light Storefront & Privacy Center (`#fbfbf5`) with Aloe Mint (`#c1fbd4`) accents, soft stacked paper halo shadows, and solid black pill buttons (`rounded-full`).
- Features: User onboarding with DPDP Granular Consent Notice (v2.1), Customer Privacy & Consent Withdrawal Center, and Live DPDP Enforcement Test Bench (Promotional SMS Dispatcher).

---

## 4. Verification & Testing Commands

```bash
# Run all module test suites + end-to-end integration demo
npm run test:shared
npm run test:agent
npm run test:cp
npm run test:ecom
npm run test:e2e
```
