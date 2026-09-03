# AI Evidence Classification — Handoff

> **Architecture update (2026-08-25):** The previous client-side Groq
> implementation has been **superseded**. AI classification is now performed
> server-side by `DPDPOS_backend`. The CLI sends a flag; the backend owns
> execution, credentials, and aiContext storage. Sections marked ~~struck
> through~~ document the old design for historical reference only.

## 1. Objective

Add optional AI-powered post-processing to the DPDP compliance scanner so that each regex-matched finding can be classified as genuine evidence, a passing reference, or explicit negative evidence. This enriches the deterministic scanner output with contextual understanding.

**Current approach:** The CLI requests server-side AI classification by sending a flag in the evidence submission payload. The backend owns the Groq integration, credentials, and aiContext storage. The CLI never calls an AI provider directly.

## 2. Architecture (Current)

```
dpdp scan <path> --ai
  │
  ├─ 1. Deterministic scanner runs (unchanged)
  │     └─ produces EvidenceBundle with Finding[]
  │
  ├─ 2. ScanState.extra.requestAiClassification = true
  │
  └─ 3. dpdp submit
        └─ POST /api/v1/assessments/:id/cli/evidence/batch
           payload:
             {
               scanJobId,
               findings,
               requestAiClassification: true     ← only when --ai
             }
        │
        └─ DPDPOS_backend
              ├─ receives payload
              ├─ triggers server-side AI provider (Groq)
              ├─ stores aiContext in ScanJob
              └─ returns aiClassificationStatus in response
                    │
                    └─ CLI surfaces status:
                         COMPLETED → "AI classification: completed"
                         FAILED    → "AI classification: failed (evidence submission succeeded)"
                         SKIPPED   → "AI classification: skipped"
```

Key principle: **The CLI never calls Groq, never holds a Groq API key, and never generates aiContext.**

## 3. What AI Does

The AI (executed server-side by the backend) classifies each finding into one of three categories:

- **positive_evidence** — the code or document actually implements or contains the DPDP concept matched by the regex (e.g., a consent withdrawal handler, a data erasure endpoint).
- **reference_only** — the code mentions the concept but does not implement it (e.g., a TODO comment about consent, a variable name, a documentation reference).
- **negative_evidence** — the code explicitly states the concept is NOT present or NOT implemented (e.g., "consent not yet implemented").

Each classification includes a reasoning string and a confidence score (0.0–1.0).

The backend has its own server-side AI configuration (API key, model, base URL). These are managed by the backend infrastructure and are not exposed to or configured by the CLI.

## 4. What AI Does NOT Do

- Does **not** determine compliance or non-compliance.
- Does **not** produce PASS/FAIL verdicts.
- Does **not** assign scores or risk ratings.
- Does **not** identify violations or regulatory breaches.
- Does **not** modify the evidence findings submitted to the backend.
- Does **not** replace the deterministic scanner — it only enriches its output.

## 5. Data Boundary

What is sent to the backend in the evidence submission payload:

- `scanJobId` — the backend scan job identifier.
- `findings` — the deterministic `Finding[]` array (unchanged).
- `requestAiClassification` — boolean flag, present only when `--ai` is used.

What is **never** sent:

- AI API keys or credentials.
- Groq configuration.
- Source code context (the backend handles this independently).
- CONFIG file contents.

The feature is **opt-in** (`--ai` flag). Without it, no `requestAiClassification` field is included in the payload, and the backend skips AI classification entirely.

## 6. CLI Implementation

### Files

| File | Purpose |
|------|---------|
| `src/cli/commands/scan.ts` | CLI `--ai` flag: when present, stores `requestAiClassification: true` in `ScanState.extra` |
| `src/cli/commands/submit.ts` | Reads `extra.requestAiClassification` and includes it in the evidence batch payload; surfaces `aiClassificationStatus` from backend response |
| `src/cli/commands/status.ts` | Surfaces `aiClassificationStatus` from backend scan status response |
| `src/cli/commands/configure.ts` | Assessment configuration only — no AI/Groq configuration |

### What was removed

The following client-side AI code has been deleted:

- `src/ai/classify.ts` — `classifyFindings()`, `createProviderFromEnv()`, `createOpenAiCompatibleProvider()`, context extraction, prompt construction, response parsing
- `src/ai/classify.test.ts` — all client-side AI tests
- `src/storage/env-file.ts` — `.env` parser/writer, `loadEnvFileIntoProcess()`, `buildGroqEnvVars()`, `hasGroqKey()`
- `src/storage/env-file.test.ts` — env-file tests
- `.env.example` — Groq configuration template
- Groq API key prompting from `dpdp configure`

### Payload Contract

**Without `--ai`:**

```json
{
  "scanJobId": "scan-xxxxx",
  "findings": [
    {
      "sourceType": "CODE",
      "location": "src/index.ts:12",
      "findingType": "consent_reference",
      "excerpt": "// TODO: implement consent",
      "confidence": 0.85,
      "controlCandidates": ["DPDP-CONSENT-COLLECT"]
    }
  ]
}
```

**With `--ai`:**

```json
{
  "scanJobId": "scan-xxxxx",
  "findings": [
    {
      "sourceType": "CODE",
      "location": "src/index.ts:12",
      "findingType": "consent_reference",
      "excerpt": "// TODO: implement consent",
      "confidence": 0.85,
      "controlCandidates": ["DPDP-CONSENT-COLLECT"]
    }
  ],
  "requestAiClassification": true
}
```

The `findings` array is never modified by the `--ai` flag.

### AI Classification Status Handling

The backend returns `aiClassificationStatus` in its response to the evidence batch submission and the scan status endpoint. The CLI surfaces this:

| Backend Status | CLI Output |
|----------------|------------|
| `COMPLETED` | `AI classification: completed` |
| `FAILED` | `AI classification: failed (evidence submission succeeded)` |
| `SKIPPED` | `AI classification: skipped` |
| *(absent)* | *(no AI-related output)* |

**AI failure does not fail evidence submission.** The submission is treated as successful regardless of the AI classification status.

## 7. Storage

The `ScanState.extra` field stores the `requestAiClassification` flag set by the CLI:

```typescript
// Set by scan --ai:
extra: { requestAiClassification: true }

// Not set when scanning without --ai:
extra: undefined
```

**No storage or evidence schema changes.** The `extra` field on `ScanState` already existed for capability-specific state (used by VAPT).

**aiContext is stored by the backend**, not the CLI. The backend owns `ScanJob.aiContext`. The CLI never reads, writes, or forwards aiContext — it only surfaces the classification status.

## 8. Failure Behavior

AI-related failures **never** prevent normal evidence submission:

- No `--ai` flag → no `requestAiClassification` in payload, backend skips AI.
- Backend AI status `FAILED` → CLI reports the failure, evidence submission is still marked successful.
- Backend AI status `SKIPPED` → CLI reports it, submission proceeds normally.
- Backend unreachable → submission fails with network error (same as without `--ai`).

In all cases, the deterministic scanner output is unaffected.

## 9. Testing

### Automated Tests

- **139/139 tests passing**
- TypeScript typecheck: clean
- Build: clean (`npm run build`)

### Test Coverage for New Behavior

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | scan without --ai | No `requestAiClassification` or `aiContext` in payload; findings unchanged |
| 2 | scan --ai | `requestAiClassification=true` in payload; no `aiContext`; findings unchanged |
| 3 | AI status COMPLETED | CLI reports "AI classification: completed" |
| 4 | AI status FAILED | Submission succeeds; reports "AI classification: failed (evidence submission succeeded)" |
| 5 | AI status SKIPPED | CLI handles cleanly |
| 6 | status surfaces aiClassificationStatus | Backend AI status printed |
| 7 | No GROQ_API_KEY required | Scan works without key set |
| 8 | No Groq HTTP request | Zero requests to groq.com |
| 9 | No API key in ScanState | ScanState file contains no GROQ references |
| 10 | No API key in Finding | Evidence file contains no GROQ references |
| 11 | No API key in backend payload | Submitted JSON contains no GROQ references |
| 12 | configure without --assessment | Clear error message |

## 10. Known Limitations

- **Advisory only**: AI classifications are informational enrichment, not compliance determinations.
- **Backend-owned**: The CLI cannot control which AI model the backend uses, or force a retry of a failed classification.
- **No local preview**: The CLI does not have access to aiContext for local display — it only surfaces the COMPLETED/FAILED/SKIPPED status.
- **Incomplete AI classification**: The backend model may occasionally return fewer classifications than the number of input findings. This is acceptable because AI is advisory enrichment and deterministic evidence collection remains authoritative.

## 11. Future Considerations

Possible areas for future investigation (not proposed for immediate implementation):

- **aiContext retrieval**: Exposing backend-stored aiContext in CLI output (e.g. `dpdp status --ai-context`).
- **Retry with backoff**: Backend-side retry for transient AI provider failures.
- **Classification confidence thresholds**: Allowing users to filter or highlight low-confidence classifications in the platform UI.
- **Prompt refinement**: Iterating on the classification prompt based on real-world accuracy feedback.

---

## Historical Reference: Old Client-Side Architecture (Superseded)

> ⚠️ The following describes the **previous** implementation that has been removed.
> It is preserved here for historical context only.

<details>
<summary>Click to expand superseded design</summary>

The original architecture ran AI classification entirely within the CLI:

- `dpdp scan --ai <path>` ran a deterministic scan, then called `classifyFindings()` locally.
- `classifyFindings()` grouped findings by source file, extracted context windows, and sent them to a Groq-compatible provider.
- The provider was configured via `GROQ_API_KEY` / `GROQ_BASE_URL` / `GROQ_MODEL` environment variables, loaded from a `.env` file managed by `dpdp configure`.
- Classification results were stored in `ScanState.extra.aiContext` and submitted to the backend alongside evidence.
- The CLI contained its own OpenAI-compatible HTTP provider (`createOpenAiCompatibleProvider()`), context extraction, prompt construction, and response parsing.

**Why it changed:** Moving AI execution to the backend centralizes credentials, simplifies the CLI, removes source-code-context transmission from the client, and allows the backend to manage AI configuration independently.

**Files removed:**
- `src/ai/classify.ts` — core classification logic
- `src/ai/classify.test.ts` — client-side AI tests
- `src/storage/env-file.ts` — `.env` management
- `src/storage/env-file.test.ts` — env-file tests
- `.env.example` — Groq configuration template

</details>
