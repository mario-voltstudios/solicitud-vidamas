# Build Phase 1 — Solicitud VidaMás (2026-03-15)

## Goal
Advance the replacement of `vidamas.paperform.co` by improving the existing `solicitud-vidamas` wizard with:
- dependencia-aware document requirements
- non-blocking pending-doc submission flow
- canonical document tracking rows in `solicitud_documentos`
- safer duplicate checking in Supabase

## Use cases implemented in this phase

### 1. Agent submits complete IMSS activo case
- uploads INE front/back
- uploads talón
- uploads signature pages 1-3
- submits successfully with normal `pendiente` status

### 2. Agent submits incomplete case with weak internet / missing docs
- uploads what they have
- continues even if some required docs are still missing
- solicitud is stored as `pending_docs`
- missing docs remain visible for follow-up instead of blocking intake

### 3. Wizard adapts to dependencia
- requirements shown in Cobro and Documentos are no longer static
- they now depend on the dependency/cobro context
- optional/exception docs are marked clearly

### 4. Uploaded files become trackable operational objects
- document uploads are inserted into `solicitud_documentos`
- OCR/backup lifecycle can now continue after submission

### 5. Basic duplicate protection
- same agent + same RFC + same week/year will not create duplicate solicitudes silently

## Notes
- This is not the full OCR/provider/final notification/PDF merge cutover yet.
- This phase improves the intake backbone so the next build steps have cleaner primitives.
