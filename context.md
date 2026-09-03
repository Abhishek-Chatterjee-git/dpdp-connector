# Context: DPDP Act 2025 Compliance Connector Platform

## 1. Background & Vision
India's **Digital Personal Data Protection Act (DPDP Act 2025)** mandates strict governance, consent lifecycles, and Data Subject Rights (DSR) fulfillment across data fiduciaries and processors.

Enterprise compliance cannot be achieved by shipping sensitive customer data to a central compliance SaaS. Therefore, this platform uses a **Two-Plane Federated Architecture**:
1. **Control Plane (DPO Dashboard & Central Metadata Registry)**: Holds metadata, schema catalogs, consent ledgers, compliance scores, rulepacks, and orchestrates compliance workflows. No raw customer personal data is ever stored here.
2. **Zone Agents (Plug-and-Play Local Scanners & Enforcers)**: Lightweight standalone daemons running next to enterprise data (in-VPC, on-prem, or container sidecar). Agents inspect databases and microservices locally, cache consent for sub-millisecond hot-path enforcement, execute DSR sagas, and communicate outbound-only to the Control Plane.

---

## 2. Core Operational Pillars
1. **Continuous Data Discovery & PII Classification**:
   - Local DB sampling (read-replica only) with regex + checksum/algorithm validation (Aadhaar Verhoeff algorithm, PAN format, Phone, Email, Payment cards via Luhn, UPI IDs).
   - Schema drift detection via DDL checksums. Agents stay dormant in low-memory sleep until a schema change, DSR task, or DPO manual trigger occurs.
2. **Real-time Consent Enforcement & Hot-Path Cache**:
   - Any enterprise application checks consent via a sub-millisecond local agent endpoint (`GET /consent/check?principal_id=...&purpose=...`).
   - Control plane pushes instant cache eviction on consent withdrawal.
3. **Data Subject Rights (DSR) Erasure Saga**:
   - Coordinated distributed deletion/anonymization across heterogeneous data stores (PostgreSQL, NoSQL, CRM, Analytics).
   - Tamper-evident cryptographic erasure receipts ledgered at the Control Plane.
4. **Third-Party Risk Management (TPRM)**:
   - Vendor DPA tracking, unmapped egress data flow detection, and cross-border transfer alerts.
5. **Tamper-Evident Evidence Ledger**:
   - Append-only hash chain (`row_hash = SHA256(prev_hash || canonical_json(event))`) for immutable audit readiness.

---

## 3. Demo E-Commerce Enterprise & Testing Environment (Cyber-Lab)
- **E-Commerce Web App** ([`sim-enterprise/ecom-app/`](file:///C:/Users/Abhishek/Desktop/my_Compliance/sim-enterprise/ecom-app)):
  - Built following [`ecom_Design.md`](file:///C:/Users/Abhishek/Desktop/my_Compliance/ecom_Design.md) (Shopifi dual-track design with cinematic dark hero + paper-light transactional storefront).
  - Customer Signup / Login with multi-category personal data (Name, Email, Phone, Aadhaar, PAN, Address).
  - DPDP Consent Notice & Privacy Policy during onboarding (granular purpose checkboxes: Essential, Marketing, Analytics).
  - Profile & Payment Settings (Mock Card/UPI/KYC data).
  - Dedicated User Privacy & Consent Withdrawal Portal (granular purpose withdrawal, Right to be Forgotten / Account Erasure).
  - Gated promotional SMS action calling the Zone Agent hot-path consent check.
- **Control Plane DPO Dashboard** ([`control-plane/`](file:///C:/Users/Abhishek/Desktop/my_Compliance/control-plane)):
  - Built following [`ui_design.md`](file:///C:/Users/Abhishek/Desktop/my_Compliance/ui_design.md) (Linear dark system `#010102`).
  - Real-time fleet health, live compliance scorecard, interactive data map, and block explorer with cryptographic verification.
- **Docker Compose Orchestration**:
  - One-command spin-up (`docker compose up --build`) of Control Plane (4000), Zone Agent (5000), and E-commerce App (3000).
