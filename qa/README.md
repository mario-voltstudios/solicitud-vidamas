# Solicitud VidaMás — Automated QA Suite

## Quick Start

```bash
# From repo root
npm run qa              # run tests, print results
npm run qa:coverage     # run with coverage report
npm run qa:ci           # CI mode: JSON output to qa/artifacts/
./qa/run-qa.sh          # full run: tests + markdown report
```

## Structure

```
qa/
├── README.md                    # this file
├── jest.config.js               # Jest config (ts-jest, @/ alias)
├── run-qa.sh                    # full runner script → reports/
├── tests/
│   ├── helpers.ts               # shared test data factories
│   ├── dependencia-rules.test.ts   # doc requirements per dependencia
│   ├── intake-status.test.ts       # status derivation logic
│   ├── types-validation.test.ts    # validators + entity extractors + constants
│   └── release-folder-rules.test.ts # folio/TC rules integrity
├── reports/
│   └── report-YYYY-MM-DD.md     # human-readable pass/fail report
└── artifacts/
    └── jest-results-YYYY-MM-DD.json  # raw Jest JSON output
```

## Coverage: 91 tests, 4 suites

| Suite | Tests | What it covers |
|-------|-------|----------------|
| dependencia-rules | 33 | normalizeDependencia, getDependenciaRequirements, getMissingRequiredDocs for all dependencias + CLABE |
| intake-status | 10 | deriveIntakeStatus — pending_docs / pending_verification / ready_for_emision |
| types-validation | 34 | validateBeneficiarios, validateContratante, validateAsegurado, misma_persona mirror, extractors, constants |
| release-folder-rules | 14 | matchFoliosByDependencia, matchTipoContratacion, FOLIO_RULES integrity |

## Remaining Manual Checks

| Check | Priority |
|-------|----------|
| Wizard step navigation (next/back buttons) | P1 |
| File upload → Supabase Storage | P1 |
| INE OCR (Anthropic Vision API) | P1 |
| Form submit → Supabase row insert | P1 |
| Airtable 6-field write | P2 |
| Google Sheets/Drive backup | P2 |
| Folio generation (live sequence) | P2 |
| Agent clave lookup | P2 |
| Firma canvas capture | P3 |
