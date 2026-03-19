# CFDI Validation — Implementation Roadmap
Created: 2026-03-19

## What Was Built (Milestone 1)

### New files
| File | Purpose |
|---|---|
| `lib/cfdi/types.ts` | Core types: CFDIQRData, SATVerifyResult, CFDIExtraction, CFDIValidationResult |
| `lib/cfdi/qr-extractor.ts` | Parse SAT QR URLs + extract UUID from OCR text |
| `lib/cfdi/sat-validator.ts` | Pluggable SAT SOAP validator (stub + skeleton for real impl) |
| `lib/cfdi/validate-cfdi.ts` | Main pipeline: extract → dupe check → SAT verify → persist |
| `lib/cfdi/cfdi-to-finding.ts` | Map CFDIValidationResult → QualityFinding |
| `lib/cfdi/index.ts` | Module entry point |
| `sql/013_cfdi_extractions.sql` | DB migration: cfdi_extractions table + indexes + RLS |
| `qa/tests/cfdi-validation.test.ts` | 19 tests covering QR parsing, UUID extraction, finding mapping |

### Modified files
| File | Change |
|---|---|
| `lib/filtro-calidad/intake-hook.ts` | Added Rule F: CFDI validation hook wired in |

### Status
- ✅ QR URL parsing (primary path)
- ✅ UUID text extraction (fallback path)
- ✅ SAT SOAP validator scaffold (stub returns 'sat_unreachable' — safe no-op)
- ✅ Duplicate UUID detection (DB query against cfdi_extractions)
- ✅ Finding generation (hard stop: duplicate/cancelled; flag: not_found/unreachable/extraction_failed)
- ✅ Persistence to cfdi_extractions table
- ✅ Intake hook wired
- ✅ All 157 tests pass (19 new + 138 existing)

## What Remains

### Phase 2 — Real SAT Verification
Set `SAT_VALIDATOR_PROVIDER=sat_soap` in Vercel env to activate.

The SOAP call is implemented in `SATSOAPValidator.verify()` but needs:
- Integration test against the live SAT endpoint
- Rate limit handling (200 req/min) — add exponential backoff
- Circuit breaker: if SAT is down, fail open (flag, not stop)

### Phase 3 — Image QR Decoding
Currently `ocrText` must be passed in as pre-extracted text. To close the loop:

**Option A — Preferred:** Use OpenAI Vision / Claude vision to extract the QR URL directly from the talon image.
- Call: `POST /v1/messages` with the talon image
- Prompt: "Extract the SAT CFDI verification URL (starts with https://verificacfdi...) from this pay stub. Return only the URL."
- Expected latency: ~2s, cost: ~$0.002/image
- Wire into `lib/ocr/provider.ts` as `VisionOCRProvider`
- Then pass the returned text as `ocrText` to `validateCFDI()`

**Option B — QR Decoder:** Use a JS QR library (e.g. `jsqr`, `qrcode-reader`) to decode the QR bitmap from the image.
- Requires image preprocessing (crop, grayscale, resize)
- Works offline, lower cost, but brittle on low-quality scans
- Recommended as a fallback AFTER Vision API

**Option C — Textract / Google Document AI:** Call AWS Textract or Google Document AI.
- High accuracy, handles PDFs natively
- Higher cost (~$0.015/page)
- Use only for PDFs or when Vision API fails

### Phase 4 — Retro Runner Integration
The retro runner (`lib/filtro-calidad/retro-runner.ts`) currently does not run CFDI checks.
To add:
1. In `evaluateSolicitud()`, check if `sol.docs_talon` is set
2. Call `validateCFDI()` with the talon path
3. Push `cfdiValidationToFinding()` result into findings array

### Phase 5 — CFDI UUID in Solicitudes Table
For fully normalized dupe detection, consider adding:
```sql
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS cfdi_uuid text;
CREATE INDEX IF NOT EXISTS solicitudes_cfdi_uuid_idx ON solicitudes (cfdi_uuid) WHERE cfdi_uuid IS NOT NULL;
```
Then populate from `cfdi_extractions` on each successful extraction.
This makes dupe queries faster and doesn't require a join.

## Environment Variables
| Var | Default | Values |
|---|---|---|
| `SAT_VALIDATOR_PROVIDER` | `stub` | `stub`, `sat_soap` |

## Risk Notes
- SAT SOAP endpoint (`consultaqr.facturaelectronica.sat.gob.mx`) is a public service but has availability issues. Always fail open (flag, never block) on connectivity errors.
- OCR extraction from images is the current bottleneck — until Vision API is wired, `ocrText` must be provided externally.
- The `cfdi_extractions` table migration (013) must be run on ASTRO Supabase before the intake hook will successfully persist results. Until then, persistence fails silently (non-blocking per design).
