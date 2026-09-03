# Architecture Decision Records (ADRs)

## ADR-001: Two-Plane Architecture with Zero Raw PII Egress
- **Status**: Accepted
- **Context**: Compliance platforms must ensure customer PII does not leave the corporate security perimeter (VPC/on-prem).
- **Decision**: Adopt a strict two-plane model:
  - **Control Plane**: Manages metadata, schemas, consent states, rulepacks, and audit ledgers. Receives 0 raw customer records.
  - **Zone Agents**: Deployed inside enterprise VPCs. Performs local PII detection, sub-ms consent verification, and DSR deletions.

---

## ADR-002: Deterministic SHA-256 Hash Chained Audit Ledger
- **Status**: Accepted
- **Context**: DPDP Act audits require proving evidence has not been tampered with or retroactively altered.
- **Decision**: Every audit event is serialized using deterministic RFC-8785 canonical JSON and chained with SHA-256 (`hash = SHA256(prev_hash + ":" + canonical_json(event))`). Genesis block has `prev_hash = '000...000'`.

---

## ADR-003: Algorithmic Verification for High-Risk Indian PII
- **Status**: Accepted
- **Context**: Regex alone has high false-positive rates for 12-digit numbers and 16-digit cards.
- **Decision**: 
  - Aadhaar: Regex check + Verhoeff Dihedral Group D5 checksum validation.
  - Payment Cards: Regex check + Luhn (Mod 10) algorithm.
  - PAN, Indian Phone Numbers, Email, UPI IDs: Strict regex pattern matching.

---

## ADR-004: Lightweight Schema Drift Watcher for Agent Dormancy
- **Status**: Accepted
- **Context**: Enterprise databases should not experience continuous query load or CPU spikes from compliance agents.
- **Decision**: Zone agents compute a fast DDL catalog hash (`SHA256(tables + columns + types)`). Agents remain in low-memory sleep and trigger full re-scans only when schema drift is detected or an explicit DPO trigger is received.

---

## ADR-005: In-Memory Hot-Path Consent Cache with Event-Driven Invalidation
- **Status**: Accepted
- **Context**: High-throughput microservices cannot tolerate network hops to a central cloud for every read/write operation.
- **Decision**: Zone agents maintain an in-memory consent cache answering `GET /consent/check` in $< 1\text{ms}$. When a user withdraws consent, the Control Plane pushes an invalidation event to all agents in the fleet.

---

## ADR-006: Distributed DSR Erasure Saga with HMAC Proof Receipts
- **Status**: Accepted
- **Context**: Right-to-erasure requires verified atomic deletion across diverse data stores with statutory proof.
- **Decision**: The Control Plane plans an erasure saga across cataloged stores and dispatches tasks to agents. Agents execute atomic `DELETE` queries, compute an HMAC-signed receipt (`DsrExecutionReceipt`), and return it to the Control Plane for ledgering.

---

## ADR-007: DPO Control Plane UI Design System (Linear Dark)
- **Status**: Accepted
- **Context**: The DPO needs a focused, low-fatigue telemetry console matching modern developer tool aesthetics.
- **Decision**: Built using [`ui_design.md`](file:///C:/Users/Abhishek/Desktop/my_Compliance/ui_design.md): Linear dark aesthetic `#010102`, 4-step surface ladder (`#0e1015`, `#161922`, `#1f232e`), Lavender-Blue `#5e6ad2` accents, hairline dividers, SF Mono/JetBrains Mono tokens, and live cryptographic verification triggers.

---

## ADR-008: E-Commerce Storefront Dual-Track UI Design System (Shopifi)
- **Status**: Accepted
- **Context**: The customer storefront needs to balance an editorial luxury brand feel with clear, accessible DPDP consent notices and self-service privacy controls.
- **Decision**: Built using [`ecom_Design.md`](file:///C:/Users/Abhishek/Desktop/my_Compliance/ecom_Design.md): Shopifi dual-track design system with pure black `#000000` cinematic hero and thin display typography (`font-feature-settings: "ss03"`), transitioning to paper-light `#fbfbf5` storefront and privacy portal with Aloe Mint `#c1fbd4` accents and pill-shaped CTA buttons.
