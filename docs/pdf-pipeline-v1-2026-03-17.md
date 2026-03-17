# PDF Pipeline v1 — 2026-03-17

## What was added
- `pdf-lib` dependency
- `lib/pdf-generator.ts`
- `POST /api/solicitudes/[id]/pdf`

## What v1 does
1. Loads the official GNP solicitud template from `../emisiones-ref/gnp-solicitud-vida-template.pdf`
2. Fills a first-pass set of named fields from `solicitudes` + `solicitud_beneficiarios`
3. Applies the business rule: **if `misma_persona = true`, leave the asegurado section blank on the PDF**
4. Uploads the generated PDF to Supabase Storage bucket `solicitud-docs`
5. Stores/updates a `solicitud_documentos` row with `doc_type = solicitud_pdf_generada`
6. Returns a signed URL

## Verified locally
- `npm run build` passes
- Local route test succeeded against a real solicitud ID
- Signed URL returned a valid PDF (`200 application/pdf`)

## Known limitations in v1
- Not all 249 PDF fields are mapped yet
- Beneficiary field positions use a best-effort text-field mapping and should be visually verified
- PDF generation is exposed as an API route, but not yet wired into the UI submit flow
- Storage uses signed URLs (bucket is not public)

## Next steps
1. Visually verify filled output in browser/PDF viewer
2. Tighten beneficiary/date/checkbox mappings against the official guide
3. Decide whether generation should happen:
   - on submit automatically, or
   - via an explicit ops action button
4. Add regression tests for field mapping helpers
