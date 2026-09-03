# Third-party (TPRM) CLI scan — separate from assessments

Assessment `dpdp scan` / `submit` feeds the readiness spine (use `dpdp scan . --ai` when the backend has `AI_API_KEY` for evidence classification).

**Vendor discovery** uses the same CLI login token pattern as Assessments.

## Commands

From **Vendors → Collect from CLI**, generate a token, then:

```bash
npm install -g dpdp-cli
dpdp login --token <CLI_TOKEN> --api http://127.0.0.1:3000
dpdp vendors scan .
dpdp vendors sync
```

`sync` uses the stored `dpdp_…` CLI token from `dpdp login` (no separate web JWT).

## After sync / manual create

1. Open **Vendors** in the UI  
2. Activate DRAFT rows, add **ACTIVE DPA** + diligence review  
3. Link sub-processors (SCRM) and acknowledge changes  
4. Link processing activities to the vendor  
5. Run **Validations** (`vendor-dpa-present`, `vendor-review-current`)

## vs assessment scan

| | `dpdp scan` / `--ai` | `dpdp vendors scan` |
|--|----------------------|---------------------|
| Needs assessment | Yes | No |
| Uses backend `AI_API_KEY` | Yes (on submit) | No |
| Auth | `dpdp login` CLI token | Same `dpdp login` CLI token |
| Purpose | Control readiness evidence | Third-party inventory bootstrap |
