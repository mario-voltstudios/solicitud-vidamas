# Opus Intake Gap Audit — New Digital Solicitud vs Legacy Paperform
**Date:** 2026-03-16  
**Auditor:** Jarvis (Opus sub-agent)  
**Inputs:** Mario's Google Sheet review, Paperform field mapping CSV, new-digital-solicitud-spec, archaeology report, guía emisión, GAP_ANALYSIS.md, SQL migrations, lib/types.ts

---

## TL;DR

The new spec is **architecturally superior** (wizard, OCR, offline, non-blocking docs) but has **3 critical gaps, 7 important gaps, and ~5 minor nice-to-haves** vs what the old Paperform+Zapier system actually captures. The biggest risk isn't missing fields — it's the **PDF generation pipeline** and the **asegurado field mapping errors** Mario flagged.

---

## 🔴 CRITICAL BLOCKERS (must fix before any agent touches it)

### C1. Asegurado field mapping is WRONG in 4 places
**Source:** Mario's Sheet review (rows 76, 78, 79, 92, 94)

The field mapping proposed `solicitudes.contratante_*` for several **asegurado** fields:
- **Row 76:** RFC Asegurado → was mapped to `contratante_rfc` → **MUST be `asegurado_rfc`**
- **Row 78:** Nacionalidad Asegurado → was mapped to `contratante_nacionalidad` → **MUST be `asegurado_nacionalidad`**
- **Row 79:** Identificación fiscal extranjero Asegurado → mapped to `contratante_pais` → **MUST be `asegurado_identificacion_fiscal_extranjero`**
- **Row 92:** Municipio Asegurado → mapped to `solicitudes.alcaldia` → **MUST be `asegurado_municipio`**
- **Row 94:** País Asegurado → mapped to `contratante_pais` → **MUST be `asegurado_pais`**

**Impact:** If asegurado ≠ contratante, these fields would silently overwrite contratante data or store asegurado data in wrong columns. This would corrupt the GNP emission — wrong person's data on the póliza.

**Fix:** Update `lib/types.ts` Asegurado interface + SQL schema + form bindings. Also verify the Asegurado type currently lacks: `nacionalidad`, `identificacion_fiscal_extranjero`, `pais`, `municipio` (confirmed — current `Asegurado` interface is incomplete per GAP_ANALYSIS §2B #6).

### C2. No PDF generation pipeline — the entire Paso 2 workflow depends on it
**Source:** Mario's Sheet (rows 19-20, 73-75, 162-178, 186-195 — all marked "USED SO THE X/INFO CAN BE PLACED IN CORRECT SPOT ON THE PDF"), guía emisión §2.1

The old Paperform had **~30 calculation fields** whose SOLE purpose was to produce the correct values/checkbox placements for the PDFfiller solicitud PDF. The new spec has ZERO PDF generation capability.

The current Paso 2 workflow is: Paperform data → PDFfiller (manual) → download PDF → upload to GNP Expediente Digital. Without PDF auto-fill, the emisor must:
1. Manually transcribe ALL fields from the new system into PDFfiller
2. Manually place X marks for gender, plan, pago, cobro checkboxes
3. Manually calculate quincenal primas from annual

This is the **#1 operational bottleneck**. The new system collects data but doesn't produce the artifact GNP needs.

**Fix:** Build server-side PDF generation using the solicitud template + field mapping. Port the ~30 Paperform calculation fields as derived values in the submission pipeline.

### C3. PDF business rule: when asegurado = contratante, leave asegurado section EMPTY on PDF
**Source:** Mario's Sheet row 66: "IF THEY ARE THE SAME PERSON... FOR PURPOSES OF THE PDF THAT WE NEED TO FILL THE BUSINESS RULE SAYS IF THEY ARE THE SAME LEAVE THE PDF SECTION FOR THE INFO OF THE ASEGURADO EMPTY"

Also row 86: "THE BUSINESS RULE REMAINS, LEAVE EMPTY IN PDF" for address when same.

This is a GNP-specific rule. The new spec correctly stores the data internally (asegurado = copy of contratante) but **must suppress the asegurado section on the generated PDF** when `misma_persona = true`. Without this, GNP rejects or delays the solicitud.

**Fix:** PDF generation logic must implement: `if (misma_persona) → blank asegurado section on PDF`. Store full data in DB regardless.

---

## 🟡 IMPORTANT GAPS (won't block go-live but will cause operational friction)

### I1. Dependencia → Subdependencia → Folio → Contrato cascade logic is not modeled
**Source:** Mario's Sheet rows 181-183: "THE CALCULATION NEEDS TWEAKING AS IT DOESN'T REFLECT EXACTLY THE CARPETA DE LIBERACIÓN INFO"; guía emisión §1.5, Folios table

The old Paperform had calculation fields that derived `Dependencia buena`, `Subdependencia buena`, `CAL DEPENDENCIA`, `CAL SUBDEPENDENCIA`, `CAL CONTRATO` from the agent's selections. These feed directly into GNP portal emission (§1.5: 4 cascading fields).

The new spec has `detectDependencia()` from talón OCR, but does NOT model:
- The mapping from dependencia → valid subdependencias
- The mapping from subdependencia → folio/contrato number
- The Tipo de Contratación (TC) → Concepto → Structure mapping (TC 01/02/07/09 → IMSS Activos, TC 10/11 → Jubilados, etc.)

**Impact:** Emisor still needs to manually look up folio/contrato. The whole point of the new system should be to pre-compute this.

### I2. Solicitud pages 1-6 upload — spec only requires 3 pages, Paperform captures all 6
**Source:** Paperform fields 196-201 (hojas 1-6), spec §6 only requires p3, p4, p6

The old system uploads ALL 6 pages of the solicitud. The new spec's `getRequiredDocs()` only requests pages 3, 4, and 6. But:
- Guía emisión §2.6 says the **complete solicitud PDF** goes to Expediente Digital
- Pages 1, 2, 5 contain important data (contratante data, plan details, cobranza authorization)

**Fix:** Either upload all 6 pages (like Paperform) or generate the complete PDF server-side (preferred — eliminates the need for agents to photograph physical pages).

### I3. Carta de referido / how-did-you-meet-the-client document (Paperform field 52)
**Source:** Field `sr1t` — "Carga la carta de referido o de como conociste al cliente", confirmed by Mario

This document is captured in Paperform but **not in the new spec's doc matrix** (§6). It's not in `getRequiredDocs()` for any dependencia.

**Impact:** Compliance/audit trail for how the agent sourced the client. May be required by some dependencias or for anti-fraud.

### I4. Existing póliza check + carta de no-cancelación (Paperform fields 114-115)
**Source:** Fields `ana7d` (existing policies flag) + `bk7ke` (carta no-cancelación), guía emisión §0.5 point 7

The old system asks: "Does the asegurado already have other policies?" and if yes, requires a letter stating they're not canceling existing ones. This also ties to the **video verification** requirement (guía §0.5 point 7: client must confirm NOT canceling existing policies).

The new spec mentions `asegurado_tiene_otras_polizas` in the field list but it's **not in any wizard step** and the carta document isn't in `getRequiredDocs()`.

**Impact:** Without this, agents might unknowingly submit replacement policies (GNP compliance issue) or skip the required video confirmation.

### I5. Contratante ID issuer (`organismo_emisor`) — missing from Contratante type
**Source:** Paperform field 26 (`6jlev`), confirmed by Mario

The `Contratante` interface in `lib/types.ts` has `tipo_id` and `num_id` but **not** `organismo_emisor` (issuing entity for the ID). This is needed for the GNP portal (§1.4: "Tipo de Identificación" section) and the PDF.

### I6. Número de empleado is contratante-specific, not a generic field
**Source:** Mario's Sheet row 55: "NOTE REMEMBER THIS IS UNIQUE TO THE CONTRATANTE"

Currently `numero_empleado` sits at the solicitud level. When asegurado ≠ contratante, the employee number belongs to the contratante (the payer/employee). This needs to be clearly scoped in the data model to avoid confusion during emission.

### I7. Video verification content requirements not enforced
**Source:** Guía emisión §0.5 — 7-point video checklist

The old system has a video upload field. But the guía reveals the video must contain 7 specific elements (name, date, agent name, policy acceptance, deduction amount, beneficiaries + %, no cancellation). The new spec treats video as just another file upload.

**Impact:** Ops team currently manually reviews videos. The new system should at minimum surface the 7-point checklist alongside the video upload, and ideally flag it for review before emission.

---

## 🟢 MINOR NICE-TO-HAVES

### N1. Beneficiary gender field
The GNP portal (§1.8) asks for beneficiary gender. Paperform doesn't capture it (not in the 202 fields). The new spec doesn't either. Emisor currently selects it manually in GNP portal. Low priority — can remain manual.

### N2. Beneficiary RFC
GNP portal (§1.8) has an RFC field per beneficiary. Neither Paperform nor new spec captures it. Usually left blank. Nice-to-have for compliance but not blocking.

### N3. Beneficiary domicilio / occupation / estado civil
GNP portal fills these per beneficiary (§1.8: "Tipo domicilio: CASA", "Ocupación: ADMINISTRADOR DE EMPRESAS"). Currently hardcoded by emisor. Could be captured but adds friction for minimal value.

### N4. Estado civil (marital status) of contratante
GNP portal §1.4 asks for estado civil. Neither Paperform nor the new spec captures it. Emisor fills it manually from the solicitud paper form.

### N5. Contratante CURP
The new spec includes CURP (derived from INE OCR) which is an improvement over Paperform (which didn't capture it). Already covered ✅.

---

## ⚪ FALSE ALARMS / INTENTIONALLY IGNORABLE

### F1. ~30 Paperform calculation/helper fields (rows 18-20, 73-75, 94-101, 161-195)
Mario confirmed ALL of these are "JUST USED SO THE X CAN BE PLACED IN THE CORRECT SPOT ON THE PDF" or "SO THE CORRECT INFO CAN BE PLACED ON THE PDF." These are NOT intake fields — they're PDF rendering helpers. They disappear entirely once we build server-side PDF generation (which derives the same values programmatically). **Not gaps in the form — gaps in the PDF pipeline (covered by C2).**

### F2. Municipio de venta (Paperform field 9)
Captured in Paperform but only for geographic reporting. The new spec captures `estado_venta` but not `municipio_venta`. This is nice for analytics but doesn't affect emission or GNP compliance. Could add later.

### F3. ISSEMYM clave (Paperform field 63)
Very niche — only applies to ISSEMYM dependencia (Estado de México state employees). The new spec doesn't mention it, but it could be a conditional field shown only for ISSEMYM. Low volume.

### F4. Centro de trabajo completo / CCT fields (Paperform fields 59-61)
SEP-specific fields. The new spec doesn't model them explicitly but they'd be captured in the dependencia-conditional section. Implementation detail, not an architectural gap.

### F5. Ahorra Más removal
Confirmed by Mario — correctly removed from the new spec. Not a gap.

---

## 🔍 HIDDEN BUSINESS-RULE GAPS (implied by Paperform + Zapier system)

### H1. The Zapier pipeline was doing deduplication (ZAP 835: "Valida Existe Solicitud digital")
The new spec has client-side duplicate RFC check, but the old system had a dedicated Zap for this. Need to ensure the server-side dedup is equally robust — especially for agents submitting the same client from different devices.

### H2. Paperform → Google Sheets → PDFfiller was an implicit data pipeline
The Zapier glue (ZAP 1191) wrote to Google Sheets, which PDFfiller read from. Killing Paperform without replacing this pipeline means the emisor loses their data source for PDFfiller. **The new system must either generate the PDF directly (preferred) or write to the same Google Sheet that PDFfiller reads from (stopgap).**

### H3. Agent notification after submission
The old Zapier pipeline notified the agent after successful submission. The new spec's confirmation screen is good, but there's no mention of email/WhatsApp notification to the agent with their folio and status.

### H4. The "Seguro Provisional" business rule
Spec Appendix B mentions it but it's just a reminder checklist item. In practice, the Seguro Provisional section on the physical solicitud must be filled before the póliza vigencia starts. If the agent doesn't complete this on the physical form, the client has no coverage in the interim. Consider making this a hard acknowledgment checkbox.

---

## CONDITIONAL LOGIC / VISIBILITY GAPS

### V1. The spec's dependencia → doc matrix is incomplete
Comparing the Paperform conditional fields with the spec's `getRequiredDocs()`:

| Document | Paperform shows for | Spec shows for | Gap? |
|----------|-------------------|----------------|------|
| Carta instrucción IMSS | IMSS (field 53) | IMSS_JUBILADOS, GOB_CDMX | ⚠️ Missing for IMSS activos |
| Carta reserva Nomipay | Specific deps (field 57) | Not in matrix | ⚠️ Missing |
| Consentimiento GOB CDMX | GOB CDMX (field 58) | Not in matrix | ⚠️ Missing |
| Consentimiento descuento | Multiple deps (field 64) | Not in matrix | ⚠️ Missing |
| Carta autorización SEP | SEP (field 62) | Not in matrix | ⚠️ Missing |
| Carta no-cancelación | When existing policies (field 115) | Not in matrix | ⚠️ Missing (see I4) |
| Carta referido | All (field 52) | Not in matrix | ⚠️ Missing (see I3) |

The spec's doc matrix only has ~5 doc types per dependencia. The actual Paperform has **~12 distinct document upload fields** with complex conditional visibility.

### V2. Cobro method → payment fields conditional logic
The spec handles nómina vs CLABE/tarjeta branching. But Paperform also conditionally shows:
- **Tarjeta number + expiry** (fields 116-117) only for tarjeta
- **CLABE + banco** (fields 118-119) only for CLABE
- **Fecha próximo cobro** (field 120) for bank-based payments

The spec covers this in S4 but should verify the conditional rendering matches exactly.

---

## 🚀 RECOMMENDED NEXT BUILD SEQUENCE (smallest high-leverage moves)

### Phase 0: Fix the data model (1-2 days)
1. **Fix asegurado field mappings** (C1) — update `lib/types.ts`, SQL schema, form bindings
2. **Add missing asegurado fields**: `nacionalidad`, `identificacion_fiscal_extranjero`, `pais`, `municipio`, `organismo_emisor`
3. **Add missing contratante field**: `organismo_emisor` (I5)

### Phase 1: PDF generation pipeline (3-5 days) — THE highest leverage item
1. Build server-side PDF fill using GNP solicitud template
2. Implement all ~30 derived calculation fields (checkbox placements, quincenal primas, RFC ejecutivo, folio formatting)
3. Implement the `misma_persona = true → blank asegurado section` rule (C3)
4. Output: downloadable PDF per solicitud, auto-uploaded to Supabase Storage

**Why this is #1:** Without PDF generation, the new form is just a nicer data collector that still requires the same manual PDFfiller work. WITH it, you eliminate 60-70% of emisor labor per solicitud.

### Phase 2: Complete the document matrix (2 days)
1. Add all 12 doc types from Paperform to `getRequiredDocs()`
2. Implement full conditional visibility per dependencia
3. Add carta referido, carta no-cancelación, consentimiento de descuento, etc.
4. Add existing-policies check + carta conditional logic (I4)

### Phase 3: Dependencia cascade logic (2-3 days)
1. Model dependencia → subdependencia → folio → contrato lookup table
2. Implement TC → Concepto → Structure mapping from talón
3. Pre-compute the GNP portal fields so emisor can copy-paste instead of looking up

### Phase 4: Polish + go-live (2 days)
1. Video upload with 7-point checklist overlay (I7)
2. Agent notification post-submission (H3)
3. Google Sheets bridge for backward compat (H2 stopgap until PDF gen is live)

**Total:** ~10-12 days for a solid replacement. Phase 1 alone makes the biggest impact.

---

*End of audit. The new system design is sound — it just needs the PDF pipeline and the asegurado data corrections before it can actually replace Paperform in production.*
