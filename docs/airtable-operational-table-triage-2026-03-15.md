# Airtable Operational Table Triage — VidaMás / ASTRO
**Date:** 2026-03-15  
**Author:** Jarvis (sub-agent: airtable-table-triage)  
**Base:** app4s0fxoSQStY8Jn  
**Scope:** 11 operational Airtable tables not yet in Supabase (or only partially migrated)

---

## TL;DR — Top Recommendations

1. **`cancelaciones`, `metas`, `metas_gerencia`, `meta_semanas`** — SQL already drafted in `phase2-tables.sql`. Just run it against ASTRO Supabase. These are clean.
2. **`estados_cuenta`** — SQL drafted too; but several Airtable fields are **calculated roll-ups**. Migrate source fields only; recompute totals as a SQL view.
3. **`bandas_comisiones`** — Migrate the rate/range rows; drop Airtable calculated amounts. Simple lookup table.
4. **`transferencias_agentes` + `descomisiones` + `prestamos_agentes`** — Straightforward financial ledgers. SQL drafted. Main callout: Airtable concatenates period+agente into "description codes" — parse these out, don't store them verbatim.
5. **`charging_system`** (Stripe transactions) — Most complex. Migrate only the canonical transaction fields; drop Airtable-computed cross-links and the duplicate comma-separated history lists. The `stripe_id` is the source of truth.
6. **`recibos_prospera`** — Overlaps heavily with the existing Supabase `recibos` table. **Do NOT create a second table.** Reconcile against `recibos` and backfill gaps; then retire this Airtable source.

---

## Table-by-Table Field Triage

### 1. Recibos Prospera (`tblKyuBjWFedYKOWM`)

**Verdict: DO NOT migrate as new table. Reconcile into existing `recibos`.**

| Field (inferred name) | Airtable ID | Classify | Action |
|---|---|---|---|
| Nombre contratante | `fldskU8yIJPqS0pUn` | Source | Map to `recibos.contratante_nombre` if missing |
| Plan | `fldNrxF1MxSZ5K7xF` | Source | Map to `recibos.plan` |
| Agente clave | `fldYiK6kSm5TJWfVe` | Source | Map to `recibos.agente_clave` |
| Número de recibo | `flduOPQ4VQLqpnTdO` | Source | Map to `recibos.num_recibo` |
| Descripción periodo | `fldkGgKnm2VBY0I2F` | Source | Parse into `year`+`periodo` columns |
| Periodo número | `fldV2E8cqCG0tqTDY` | Source | `recibos.periodo` |
| ID externo recibo | `fldTQwA7tgg5tEnl9` | Source | `recibos.ref_externa` |
| Status | `fldtXrSKL0DJzoIpB` | Source | `recibos.status` |
| Fecha emisión/aplicación | `fldEBSgSofRNjBkY3` | Source | `recibos.fecha_pago` |
| Método pago | `fldVkYmRXMBmr8xKB` | Source | `recibos.metodo_pago` |
| Monto pagado | `fldYFPet0SczdCXWd` | Source | `recibos.monto` |
| Campos "NaN" × 3 | `fldRQUzqMbElH0dey` etc | **JUNK** | DROP — empty/corrupt |
| Periodicidad | `fldbR3ZykdDTxWAgU` | Source | `recibos.periodicidad` |
| Tipo de cobro | `fldNaA4n90Sm65Pm9` | Source | `recibos.tipo_cobro` |
| EVO/version tag | `fldVzvxOi4JU4QokZ` | **Junk** | DROP — internal Airtable version tag |
| Semana número | `fldtVpR5c692s2wst` | Source | Parse into `semana_num` |
| Fecha vencimiento | `fldDBRLHS5CO3qk0j` | Source | `recibos.fecha_vencimiento` |

**Supabase action:** Add 3–4 missing columns to `recibos` (`contratante_nombre`, `metodo_pago`, `tipo_cobro`, `ref_externa`) then backfill from Airtable. No new table.

---

### 2. Estados de Cuenta (`tbltxeIAc2O7Hdp0n`)

**Verdict: Migrate source fields. Computed totals → SQL view.**

| Inferred Field | Airtable ID | Classify | Notes |
|---|---|---|---|
| Clave estado cuenta (PK) | `fld5AFFNQ3O2qCOzp` | Source | e.g., "2021S42-4024" — composite key |
| Notas/observaciones | `fldjK5dwBA7O8KIQc` | Source | Free text notes |
| Periodo semana | `fld1yZSM96AYPNs7y` | Source | e.g., "2021S42" |
| Clave agente | `fldu2Hcqj3trDHruW` | Source | e.g., "4024" |
| Monto GNP cobra | `fldkc7quVSMhCvYKD` | Source | Raw cobro from GNP |
| Monto aplicado | `fldu8bIX6c9vYY2KJ` | Source | What actually applied |
| Monto diferencia | `fldCk1WJvOLoU2Tdh` | **Derived** | = aplicado − cobrado → compute in view |
| Comisión bruta | `fld08Vi7BsSmQ0Sj1` | Source | Gross commission |
| Deducciones | `fld8UowfeqUbRSQFw` | Source | Deductions total |
| Descomisiones | `fld4BXVCKwhiMxfsk` | Source | Clawback amount |
| Neto a pagar | `fldCBnHJXpb7yROb` | **Derived** | = bruta − deducciones − descomisiones → view |
| Ajuste / diferencia | `fld36BGdRlsHLooov` | **Derived** | Computed adjustment → view |
| Total estado | `fldHf3VjnlSpOsSC4` | **Derived** | Final total → view |
| Porcentaje deducción | `fldmgAJLoG2cw8KGV` | **Derived** | = deducciones/bruta → view |
| PDF adjunto | `fldvDBf5yW2J3WrXs` | Source | Migrate URL/path as `estado_pdf_url` |
| Descripción agente | `fldO79ZT1KFwvxPVT` | Source | Denorm name+clave — keep as `agente_display` |
| Nombre completo agente | `fldF2fS1B3sTQVq8i` | Source | `agente_nombre` |
| Status | `fldItamdrDzZIDVAE` | Source | ACTIVO/BAJA |
| Fecha de alta | `fldEzrF9H90RkQpem` | Source | `fecha_alta` |
| Fecha último pago | `fldZLQjKLUhZF5xIG` | Source | `fecha_ultimo_pago` |
| Airtable internal ID | `fldaS27vfTTuiKy8w` | **Junk** | DROP — Airtable record ref only |
| Concat periodo+agente | `fldTGRcRCSDWW3ccz` | **Junk** | DROP — redundant, derivable |
| Tipo/código banco | `fld01kEhoTE9gnC3i` | Source | `banco_tipo` (e.g., BAZTE, COPEL) |
| Historial largo CSV | `fldtLLPSO0jV8ZrhB` | **Junk** | DROP — Airtable audit trail, not data |
| Email | `fldpScKde5h2nUpQF` | Source | `email_agente` |
| Teléfono | `fldy3q6EsEy0wlKNS` | Source | `telefono_agente` |
| Mensaje template | `fldZt1NjBKl9aHY03` | **Junk** | DROP — Airtable automation template |
| Webhook URL | `fldrTIVnCeGqG7wq5` | **JUNK** | DROP — internal Airtable webhook |
| RFC | `fld2NkxHfMiy7s1kQ` | Source | `rfc_agente` |
| Año | `fldZRtyDB4vEjTIRY` | **Derived** | Parse from periodo → view |
| Tasas/porcentajes varios | Multiple | **Derived** | Commission rate lookups → join `bandas_comisiones` |

**Proposed Supabase table (canonical fields only):**
```sql
CREATE TABLE estados_cuenta (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  airtable_id     text UNIQUE,
  clave_estado    text UNIQUE NOT NULL,   -- "2021S42-4024"
  periodo         text NOT NULL,           -- "2021S42"
  agente_clave    text NOT NULL REFERENCES agentes(clave),
  agente_nombre   text,
  banco_tipo      text,                    -- BAZTE, COPEL, etc.
  gnp_cobrado     numeric(12,2),
  monto_aplicado  numeric(12,2),
  comision_bruta  numeric(12,2),
  deducciones     numeric(12,2),
  descomisiones_monto numeric(12,2),
  estado_pdf_url  text,
  status          text DEFAULT 'ACTIVO',   -- ACTIVO / BAJA
  fecha_alta      date,
  fecha_ultimo_pago date,
  email_agente    text,
  rfc_agente      text,
  notas           text,
  created_at      timestamptz DEFAULT now()
);
```

**View for computed totals:**
```sql
CREATE VIEW v_estados_cuenta_calc AS
SELECT *,
  monto_aplicado - gnp_cobrado                            AS diferencia,
  comision_bruta - deducciones - descomisiones_monto     AS neto_a_pagar,
  CASE WHEN comision_bruta > 0 
       THEN deducciones / comision_bruta ELSE 0 END       AS pct_deduccion,
  split_part(periodo, 'S', 1)::int                       AS anio,
  split_part(periodo, 'S', 2)::int                       AS semana_num
FROM estados_cuenta;
```

---

### 3. Prestamos (`tbl24A68bEmZ5td4T`)

**Verdict: Migrate as `prestamos_agentes`. SQL already drafted in `phase2-tables.sql` — looks good.**

| Inferred Field | Airtable ID | Classify | Notes |
|---|---|---|---|
| Descripción/ID compuesto | `fldSuhEkrV2sbmyXo` | **Junk** | DROP — "4192--2024-05-04T01:19:17.000Z-350-PRESTAMO" — machine generated |
| Clave agente | `flda7uzajdSBp5uvO` | Source | `agente_clave` |
| Monto | `fldvJd6fFQzqMPCPn` | Source | `monto` — note: negative = cobro |
| Referencia periodo | `fld0a8jWSsDYfl3sW` | Source | Parse into `periodo` + `agente_clave` |
| Tipo transacción | `fldjBM8CsJLBHUQAd` | Source | `tipo` — PRESTAMO vs "Cobro de Financiamiento" |
| ID préstamo referencia | `fldD0gvynjYIWTRoJ` | Source | `referencia_id` (links to parent loan) |
| Fecha/hora | `fldcpaJb9gJxoEgf5` | Source | `fecha` |
| Referencia cuenta | `fldUsy9fQ2iBL6iXR` | **Junk** | Duplicates `flda7uzajdSBp5uvO` |
| Descripción larga | `fldytbi3VnM8GzLQV` | Source | `notas` |
| Fecha 2 | `fldtBxIz5unjR8Wm0` | **Junk** | Duplicate of fecha above |

**Note:** Negative amounts = recoveries/cobros. Recommend `tipo` enum: `prestamo | cobro_financiamiento | descuento_comision`.

---

### 4. Canceladas (`tblddqlUOJfC8K2tf`)

**Verdict: Migrate as `cancelaciones`. SQL drafted in `phase2-tables.sql` — good foundation, a few fields missing.**

| Inferred Field | Airtable ID | Classify | Notes |
|---|---|---|---|
| ID compuesto / folio | `fldIsGAt1v6CNDmfs` | Source | Internal reference |
| Producto seguro | `fldBFEtg6ohEDzXF0` | Source | `producto` (VIDA MAS, etc.) |
| Categoría | `fldP4JrXV3MwpV9V2` | Source | `categoria` (VIDA) |
| Fecha cancelación | `fld3eHkyIM1Ek2s5T` | Source | `fecha_cancelacion` |
| Status | `fldVNcvTJSfoKIQIi` | Source | VIGOR / ANULADA |
| Motivo cancelación | `fld7Bu8TVucJDCx5N` | Source | `motivo_cancelacion` |
| Estado (ubicación) | `fldbJl8AatNaMGK2C` | Source | `estado` |
| Municipio | `fldPVf7nR9WY1Nb1H` | Source | `municipio` |
| Tipo proceso | `fldNWv9IgTlOMZ4p4` | Source | `tipo_proceso` (PRODUCCION NUEVA vs ANULACION) |
| Número póliza | `fld4Ee3XH1aOiL5S2` | Source | `num_poliza` |
| Fecha póliza orig | `fldnrtmAtqbCT1Alh` | Source | `fecha_emision_original` |
| Referencia GNP | `fldQ3v2bfA3HR3731` | Source | `ref_gnp` |
| Código | `fldGPedvq6u1GP0ll` | Source | `codigo_gnp` |
| Identifier interno | `fldYQmsKHciIAV4U3` | **Junk** | Airtable row ref — DROP |
| Clave agente/sucursal | `fldSNeoQCtecxInrR` | Source | `agente_clave` |
| Nombre agente | `fldagCff4k5PbRNgm` | Source | `agente_nombre` |
| Nombre cliente | `fldnUEo33Wx3pKTfz` | Source | `contratante_nombre` |
| Email | `fldNGgZ6k30k6vgJx` | Source | `email_contratante` |
| Teléfono 1 | `fld2StZEPA2perTwc` | Source | `telefono_contratante` |
| Teléfono 2 / extra | `fldgDW3ufKaeyftWy` | Source | `telefono_alt` |
| Documento ref | `fld9H6s4t5BuIwqAB` | Source | `doc_referencia` |
| Código cuenta | `fldgqKhU9kE6R0o20` | Source | `cuenta_codigo` |

**Add to `cancelaciones` SQL:**
```sql
ALTER TABLE cancelaciones
  ADD COLUMN IF NOT EXISTS producto text,
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS estado_ubicacion text,
  ADD COLUMN IF NOT EXISTS municipio text,
  ADD COLUMN IF NOT EXISTS ref_gnp text,
  ADD COLUMN IF NOT EXISTS codigo_gnp text,
  ADD COLUMN IF NOT EXISTS email_contratante text,
  ADD COLUMN IF NOT EXISTS telefono_contratante text,
  ADD COLUMN IF NOT EXISTS fecha_emision_original date;
```

---

### 5. Transferencias Agentes (`tblMESuoqzPtnZF9j`)

**Verdict: Migrate as `transferencias_agentes`. SQL looks good. A few fields to clarify.**

| Inferred Field | Airtable ID | Classify | Notes |
|---|---|---|---|
| ID / referencia | `fldVnubQASkWqvrlQ` | Source | `referencia` |
| Clave agente | `fldGJ3WRFDG2fC8DS` | Source | `agente_clave` |
| Referencia periodo | `fldD5gwo6Me7VocoB` | Source | `periodo` |
| Monto | `fldladxbUp8lIPtcN` | Source | `monto` (can be negative) |
| Fecha | `fldmfjjrJudQ3kymN` | Source | `fecha` |
| Periodo duplicado | `fldx13Eh5ntaJpo8d` | **Junk** | Duplicates `fldD5gwo6Me7VocoB` — DROP |
| Referencia GNP larga | `fldNGnIvjWPW5piHF` | Source | `ref_gnp` (long numeric) |
| Importe cálculo | `fld2Q6NcwwwjtsAMg` | **Derived** | If computed from monto — DROP |
| Referencia adicional | `fldazcSVOYiA5rRRL` | Source | `ref_adicional` |
| Monto 2 | `fldWbTSRkaViEVozv` | **Clarify** ⚠️ | May be net vs gross split — ask |
| Fecha 2 | `fldSQfON0VKgdpgcb` | **Junk** | Likely duplicate — DROP |

**❓ Question:** Is `fldWbTSRkaViEVozv` (Monto 2) the **net** after taxes/deducciones, or is it a different transaction amount? This affects whether it's source data or derived.

---

### 6. Descomisiones (`tbljYI30vV5gtTq0g`)

**Verdict: Migrate as `descomisiones`. SQL drafted. Drop calculated intermediary fields.**

| Inferred Field | Airtable ID | Classify | Notes |
|---|---|---|---|
| Código DESC | `fldODhmL2D4VBpHVe` | Source | `codigo_desc` — "DESC-289865768" |
| Tasa aplicada | `fldscHF2lvBIPOTs0` | Source | `tasa` (e.g., 0.310) |
| Recibos count | `fldccf2hLflGj6f4C` | Source | `num_recibos` |
| Referencia externa | `fldIRvqISasKh0WyZ` | Source | `ref_externa` |
| Monto bruto | `fldodD1d8bk5xCSGK` | Source | `monto_bruto` |
| Cálculo intermedio 1 | `fld3qFQRgvPb5YyQj` | **Derived** | DROP — recompute: `monto_bruto × tasa` |
| Factor adicional | `fldAPmm5HtfIiXHIb` | **Clarify** ⚠️ | May be permanencia factor — ask |
| Cálculo intermedio 2 | `fldIw4KxNezXHQGzG` | **Derived** | DROP |
| Clave agente | `fldNfVNMC4hven2PZ` | Source | `agente_clave` |
| Ajuste manual | `fldvpuJcGp1Ds5ype` | Source | `ajuste` — manual corrections |
| Monto final | `fldqcW9KVcDpQGHE5` | **Derived** | = monto_bruto × tasa + ajuste → view |
| Número auxiliar | `fldVrLFVPaKnjNcYH` | **Junk** | Airtable row counter — DROP |
| Tasa duplicada 1 | `fldvDebLaATKiZVrC` | **Junk** | Duplicates `fldscHF2lvBIPOTs0` — DROP |
| Tasa duplicada 2 | `fld045FO66u1NCaKd` | **Junk** | DROP |
| Referencia duplicada | `fldBiybRCMdQewPFa` | **Junk** | DROP |

**Proposed view:**
```sql
CREATE VIEW v_descomisiones_calc AS
SELECT *, (monto_bruto * tasa) + COALESCE(ajuste, 0) AS monto_final
FROM descomisiones;
```

---

### 7. Metas (`tbl9jxFgMowxtenH5`)

**Verdict: ✅ Already migrated (82 records in Supabase `metas`). SQL and data match. NO action needed.**

Fields migrated: `periodo`, `agente_clave`, `agente_nombre`, `gerencia`, `meta_semanal` (solicitudes), `meta_mensual` (prima), `tipo`.

Note: Data is from 2019. Current week-level goals should be entered fresh via CEO app.

---

### 8. Metas Gerencia (`tblriNZUK8mbFqOtL`)

**Verdict: ✅ Already migrated (58 records in Supabase `metas_gerencia`). NO action needed.**

Note: 94 total Supabase rows = 58 Airtable + 36 unknown prior rows. Investigate the 36 orphans — they have null `airtable_id`. Could be manually entered or from a partial earlier migration.

---

### 9. Meta Semanas (`tbll98Vl66solgdrV`)

**Verdict: Migrate as `meta_semanas`. Simple lookup table.**

| Inferred Field | Airtable ID | Classify | Notes |
|---|---|---|---|
| Código periodo | `fld6tuKb2z44oTdv2` | Source | `semana` — "2018S51" |
| Semana número | `fldAySpvXmnslReOw` | Source | `week_number` |
| Año | `fldMKnO6hXjI3DIaB` | Source | `year` |
| Total prima periodo | `fldGixmTvalDSZz63` | **Derived** | Aggregate from `recibos` — DROP |
| Conteo registros | `fldTMCb1kyxkmjXWb` | **Derived** | COUNT from `recibos` — DROP |
| Promedio | `fldp0SGEwTYTBhGmo` | **Derived** | AVG — DROP |
| Lista CSV referencias | `fld8QaX7ZOAxcwVDN` | **Junk** | Airtable linked field artifact — DROP |
| Referencia periodo | `fldPNRLCGEkb8ru5G` | **Junk** | Duplicate of `fld6tuKb2z44oTdv2` — DROP |

**Minimal table — just the calendar lookup:**
```sql
-- The `meta_semanas` SQL in phase2-tables.sql is correct.
-- Add fecha_inicio and fecha_fin which are missing but useful:
ALTER TABLE meta_semanas 
  ADD COLUMN IF NOT EXISTS fecha_inicio date,
  ADD COLUMN IF NOT EXISTS fecha_fin date;
```

---

### 10. Bandas Comisiones (`tbl0W0VfFEDcRjLSb`)

**Verdict: Migrate as `bandas_comisiones`. SQL drafted. Drop calculated amounts, keep rates only.**

| Inferred Field | Airtable ID | Classify | Notes |
|---|---|---|---|
| Descripción banda | `fld7P6zJMPFJuJZcw` | Source | `descripcion` |
| Status vigencia | `fldAifr4hvI0UDqcQ` | Source | `status` (active/inactive) |
| Categoría | `fldMOqmoHMIeOnhjq` | Source | `categoria` |
| Fecha inicio | `fldum1cXOkIZyei0U` | Source | `vigencia_desde` |
| Fecha fin | `fldLdirjQEbtiBJ1H` | Source | `vigencia_hasta` |
| Producción mínima | `fld1D2v4cJREXRpmL` | Source | `produccion_min` |
| Producción máxima | `fldg0EVjsM8KR7zVQ` | Source | `produccion_max` |
| Porcentaje comisión | `fldckiEBVFjMFesIL` | Source | `porcentaje_base` |
| Constancia factor | `fldEO4VaaiRv04mcX` | Source | `factor_constancia` |
| Nivel factor | `fld9NvBfGqJI6kRAH` | Source | `factor_nivel` |
| Tasa base decimal | `fldF18sqkQUvJbciA` | Source | `tasa_base` |
| Tasa adicional | `flddI6hEtpu1QWGim` | Source | `tasa_adicional` |
| Comisión mínima calculada | `fldTMux4CRweoSgkN` | **Derived** | DROP — recompute: `produccion_min × tasa_base` |
| Comisión máxima calculada | `fldpdIKdwQcrfbl8v` | **Derived** | DROP — recompute: `produccion_max × tasa_base` |

**Update `bandas_comisiones` SQL to add:**
```sql
ALTER TABLE bandas_comisiones
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'activo',
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS vigencia_hasta date,
  ADD COLUMN IF NOT EXISTS factor_constancia numeric,
  ADD COLUMN IF NOT EXISTS factor_nivel numeric,
  ADD COLUMN IF NOT EXISTS tasa_base numeric,
  ADD COLUMN IF NOT EXISTS tasa_adicional numeric;
```

---

### 11. Charging System (`tblmDfaRzVoBqOKBd`)

**Verdict: Migrate as `cobros_stripe`. Heaviest cleanup needed — many Airtable-computed cross-links.**

| Inferred Field | Airtable ID | Classify | Notes |
|---|---|---|---|
| ID transacción | `fldoacRcEbdVyoq0b` | Source | `transaction_id` |
| Descripción pago | `fld6hDICATbWnEwE6` | Source | `descripcion` |
| Status string | `fldWI3jfJ8otHwXmb` | Source | `status_texto` ("SUCCESS", "Payment complete") |
| Timestamp proceso | `fld89C6Btym8FSEdE` | Source | `procesado_at` |
| Monto | `fld8jvYXgs9LMQX8R` | Source | `monto` |
| Moneda | `fldAnHYCkRRPXjZXV` | Source | `moneda` (MXN/USD) |
| Status code | `fldnB8XtsHXrwHpX6` | Source | `status` — normalized |
| Customer ID | `fldqahIo5ohzB9ljg` | Source | `customer_id` (Stripe) |
| Flag booleano | `fldFfSisTiNgfvpBn` | **Clarify** ⚠️ | What does this flag mean? |
| Número póliza | `fldknd8CpiEHryIlQ` | Source | `num_poliza` |
| Fecha recibo | `fldBEqCPjVe8sy2mD` | Source | `fecha_recibo` |
| Fecha duplicada | `fld1Ds7YYGGwqQkZM` | **Junk** | DROP — same as `fldBEqCPjVe8sy2mD` |
| Nombre cliente | `fldZDOvBV9Mig2vHa` | Source | `nombre_cliente` |
| Monto total (mismo) | `fldsjU1QCxlraF3gO` | **Junk** | DROP — duplicate of `fld8jvYXgs9LMQX8R` |
| Factor de pago | `fldarmtpCmqAb7ugr` | **Clarify** ⚠️ | Penalty multiplier? Installment factor? |
| Monto calculado | `fldJLbeGvrLPjWPWk` | **Derived** | DROP — monto × factor → compute in view |
| Descripción producto | `fldqYPIJL2BoXjfGX` | Source | `producto` |
| Fecha proceso | `fldeMlbAk3AlYL92b` | **Junk** | Duplicate of `fld89C6Btym8FSEdE` |
| Referencia póliza | `fldagEqp7jLk2PZBC` | Source | `ref_poliza` |
| Frecuencia pago | `fldEoC7QIrM2ZlWxm` | Source | `frecuencia` |
| Frecuencia duplicada | `fldlz2bPCCoKlM12Z` | **Junk** | DROP |
| Clave agente | `fldc3RP0YjppQCvry` | Source | `agente_clave` |
| Nombre procesador | `fldTQ8Kcl7dhaI1Xw` | Source | `procesador` |
| Archivo adjunto | `fldf3YbfE2xPpbKkD` | Source | `recibo_url` |
| Referencia cuenta | `fldJCE4Qs4GvidGu6` | Source | `cuenta_ref` |
| Tiempo proceso (s) | `fldFeGPKicEOs8Yid` | Source | `processing_time_ms` |
| Conteo transacciones | `fldjeb09Jdffk6WwC` | **Derived** | COUNT → view |
| Parte fecha | `fldb1GaHeGlwbexvO` | **Derived** | = DATE(procesado_at) → view |
| Referencia periodo | `fld1pvc2jUMsBIkGk` | Source | `periodo` |
| Sistema/plataforma | `fldr4we4SSQt9pl5m` | Source | `plataforma` (Stripe/custom) |
| Referencia transacción | `fldFo6us5BWjFrfdO` | Source | `stripe_charge_id` |
| URL recuperación | `fldddJPdq8iulh7nw` | Source | `webhook_url` |

**Proposed `cobros_stripe` table (canonical only):**
```sql
CREATE TABLE cobros_stripe (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  airtable_id      text UNIQUE,
  transaction_id   text NOT NULL,          -- internal or Stripe charge ID
  stripe_charge_id text,                   -- Stripe charge_XXXX
  customer_id      text,                   -- Stripe customer_XXXX
  num_poliza       text,
  agente_clave     text,
  nombre_cliente   text,
  monto            numeric(12,2) NOT NULL,
  moneda           text DEFAULT 'MXN',
  status           text,                   -- SUCCESS / FAILED / PENDING
  procesado_at     timestamptz,
  fecha_recibo     date,
  frecuencia       text,                   -- mensual, quincenal, etc.
  producto         text,
  procesador       text,                   -- Stripe / SPEI / etc.
  plataforma       text,
  periodo          text,
  recibo_url       text,                   -- attached receipt
  processing_time_ms int,
  notas            text,
  created_at       timestamptz DEFAULT now()
);
CREATE INDEX ON cobros_stripe(num_poliza);
CREATE INDEX ON cobros_stripe(agente_clave);
CREATE INDEX ON cobros_stripe(procesado_at);
```

---

## Summary Matrix

| Table | Supabase Target | SQL Status | Action |
|---|---|---|---|
| Recibos Prospera | Merge into `recibos` | ✅ Exists | Add 4 cols + backfill |
| Estados de Cuenta | `estados_cuenta` | ✅ Drafted | Run SQL; use view for calcs |
| Prestamos | `prestamos_agentes` | ✅ Drafted | Run SQL; drop junk desc field |
| Canceladas | `cancelaciones` | ✅ Drafted | Add ~8 missing cols |
| Transferencias Agentes | `transferencias_agentes` | ✅ Drafted | Run SQL; clarify monto_2 |
| Descomisiones | `descomisiones` | ✅ Drafted | Run SQL; add view for monto_final |
| Metas | `metas` | ✅ Migrated | No action (82 records done) |
| Metas Gerencia | `metas_gerencia` | ✅ Migrated | Investigate 36 orphan rows |
| Meta Semanas | `meta_semanas` | ✅ Drafted | Add fecha_inicio/fin cols |
| Bandas Comisiones | `bandas_comisiones` | ✅ Drafted | Add 8 cols; drop 2 calculated |
| Charging System | `cobros_stripe` (rename) | ❌ Missing | New table — see SQL above |

---

## Open Questions (Only Where Truly Unclear)

1. **Transferencias Agentes — `fldWbTSRkaViEVozv` (Monto 2):** Net amount after tax deduction, or a different transaction type (e.g., IVA por separado)?

2. **Descomisiones — `fldAPmm5HtfIiXHIb` (Factor adicional):** Is this the `factor_permanencia` from the commission structure, or something else? Needed to compute `monto_final` correctly.

3. **Charging System — `fldFfSisTiNgfvpBn` (Boolean flag):** What does this flag represent? (refund_applied? test_transaction? recurring?)

4. **Charging System — `fldarmtpCmqAb7ugr` (Factor de pago):** Is this a penalty multiplier (e.g., mora), a payment split factor, or an installment ratio?

5. **`metas_gerencia` — 36 orphan rows with null `airtable_id`:** What is the source? Manually entered goals? Older migration? Should they stay?

6. **Estados de Cuenta — `fld01kEhoTE9gnC3i` (banco_tipo: BAZTE, COPEL):** Is this the bank/deduction type code used for payroll deduction at the employer? Needed to join correctly with `dependencias`.

---

## Fields Confirmed as JUNK — Drop Across All Tables

These patterns appear repeatedly and should NEVER be migrated:

| Pattern | Reason |
|---|---|
| Comma-separated long text lists of record IDs | Airtable linked-field artifacts — relationships go in FK columns, not CSV blobs |
| Webhook/automation URLs | Airtable internal automation plumbing — meaningless outside Airtable |
| Message templates | Airtable automation template text — belongs in code, not DB |
| Concatenated "description codes" (e.g., "4192--2024-05-04T01:19:17.000Z-350-PRESTAMO") | Machine-generated Airtable Name field — parse the components separately |
| Duplicate date/amount fields with identical values | Airtable formula fields that just copy another field |
| Row counters / numeric indices | Airtable's internal row ordering |

---

## Next Steps

```
Priority 1 (this week):
  □ Run phase2-tables.sql against ASTRO Supabase project (lszwokdthvgzcjdlwxzp)
  □ Add missing ALTER TABLE columns (cancelaciones, bandas_comisiones, meta_semanas)
  □ Create cobros_stripe table (new — Charging System)
  □ Add computed views for estados_cuenta and descomisiones

Priority 2 (next week):
  □ Write migration scripts to pull Airtable data → Supabase for the 8 unloaded tables
  □ Reconcile recibos_prospera → merge into canonical recibos table
  □ Answer 6 open questions above (30-min Airtable field inspection)

Priority 3 (before kill switch):
  □ Verify metas_gerencia orphan rows
  □ Finalize estados_cuenta view with correct tasa joins to bandas_comisiones
  □ Confirm Charging System boolean flag meaning; add to cobros_stripe if needed
```

---

*Generated from: `phase2-schema-exploration.md`, `phase2-tables.sql`, `airtable-migration-plan.md`, `airtable-metas-migration.md`, `GAP_ANALYSIS.md`*
