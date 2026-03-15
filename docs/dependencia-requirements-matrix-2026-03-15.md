# Dependencia Requirements Matrix — VidaMás (2026-03-15)

## Source of truth used
- `docs/source-material/guia-emision-expediente-digital.txt`
- `docs/source-material/llenado-solicitud-slides.txt`
- `emisiones-ref/solicitud-pdf-mapping.md`
- `emisiones-ref/paperform-field-mapping.md`

## Core rule
The intake must ask only for what is essential up front, derive as much as possible from:
- INE
- talón de pago
- solicitud/PDF pages

The system must still allow submission with missing documents, but classify the case correctly:
- `pending_docs` → missing required support/signature docs
- `pending_verification` → photo/video missing or verification incomplete
- `ready_for_emision` → required docs complete and verification passed

---

## Global rules across all dependencias

### Always required up front
- INE frente
- INE reverso
- Talón de nómina más reciente (if conducto = nómina)
- Solicitud data sufficient to identify:
  - contratante
  - dependencia
  - subdependencia when applicable
  - periodicidad / plan / prima / suma asegurada

### Always required before final emisión
- Video with the 7 mandatory points from the guide:
  1. nombre completo
  2. fecha
  3. nombre del agente
  4. aceptación de la póliza nueva de GNP
  5. monto a descontar
  6. beneficiarios y porcentajes
  7. confirmación de que no está cancelando pólizas actuales si ya tiene GNP
- Signature pages / physical signatures as required by the current PDF workflow
- Any dependencia-specific support document

### Intake policy
- Missing support docs do **not** block intake
- Missing video/photo does **not** block intake, but does block full completion / ready-for-emisión
- The app should tell the agent exactly what is still missing and route follow-up automatically

---

## Dependencia matrix

| Dependencia / caso | Derived from talón? | Required at intake | Required before ready-for-emisión | Notes |
|---|---|---|---|---|
| IMSS Activos | Yes | INE frente/reverso, talón | signature pages, video | TC 01/02/07/09 → Concepto 195 → Contrato 15 |
| IMSS Jubilados | Yes | INE frente/reverso, talón | signature pages, video, Carta de Instrucción | TC 10/11 → Concepto 395 → Contrato 16 |
| IMSS Estatuto A | Yes | INE frente/reverso, talón | signature pages, video | TC 0 → Concepto 995 → Contrato 17 |
| IMSS Mandos | Yes | INE frente/reverso, talón | signature pages, video | Mandos Superiores → Concepto 195 → Contrato 18 |
| ISSSTE | Yes | INE frente/reverso, talón | signature pages, video; constancia only by exception | Guide does not force extra doc universally; keep as conditional follow-up |
| GOB CDMX | Yes | INE frente/reverso, talón | signature pages, video | Quincenal flow |
| SEP Media Superior | Yes | INE frente/reverso, talón | signature pages, video; CUP if missing talón detail | Folio depends on source contract |
| SEP Central | Yes | INE frente/reverso, talón | signature pages, video; CUP if missing talón detail | Folio depends on source contract |
| UAQ | Yes | INE frente/reverso, talón | signature pages, video | Follow release-folder folio/contrato map |
| GEM | Yes | INE frente/reverso, talón | signature pages, video | Banco/quincenal style |
| Familiares / Empresarial | No (usually non-nómina) | identity + cobranza data | bank/payment support, signature pages, video | Separate no-nómina path |
| Guardia Nacional | Yes/varies | INE frente/reverso, talón or banking support | signature pages, video | Validate release-folder rule |
| Auto-domiciliación (ISSSTE / SEP / Gob CDMX / etc.) | No talón dependency if card/debit path | identity + cobranza data | payment instrument support, signature pages, video | Separate cobranza branch |
| Educación Tabasco Próspera | Yes | INE frente/reverso, talón | signature pages, video | Follow release-folder folio/contrato map |

---

## Data that should be OCR-derived whenever possible
- Nombre completo
- RFC
- CURP (if visible)
- Fecha de nacimiento
- Domicilio from INE / solicitud
- Tipo de contratación (TC)
- Clave delegacional
- Matrícula / clave empleado
- Dependencia candidate
- Subdependencia candidate
- Possible folio / contrato candidates

---

## Data that should still be agent-confirmed
- Plan elegido
- Prima / suma asegurada final
- Beneficiarios and percentages
- Whether there are active GNP policies already
- Conducto de pago if not nómina
- Email / phone if OCR is unclear

---

## QA acceptance criteria
1. For any IMSS Activo case, the wizard must require talón + INE and surface signature pages as required before ready-for-emisión.
2. For any IMSS Jubilado case, the wizard must additionally require Carta de Instrucción before ready-for-emisión.
3. Missing support docs must route to `pending_docs`, not hard failure.
4. Missing video/photo must route to `pending_verification`, not silent success.
5. Talón parsing must produce dependencia / contrato candidates with confidence and allow human correction.
6. The app must show the agent a human-readable missing-doc checklist after submission.
7. The PDF assembly phase must know exactly which signature pages replace which generated pages.
8. Release-folder folio/contrato logic must be externally configurable, not hardcoded in JSX.

---

## Blocking ambiguities still to encode cleanly
- Exact subdependencia rules per release folder / dozens of Google Drive docs still need to be normalized into code/config.
- Exact photo requirement format (single selfie vs other evidence) still needs explicit encoding.
- Auto-domiciliación variants need their own tighter branch once payment-instrument support is implemented.

## Build implication
The next code step is to replace today's heuristic dependency rules with a source-driven config for:
- TC → concepto → contrato
- dependencia/subdependencia → folio candidates
- required docs by case
- verification gate rules
