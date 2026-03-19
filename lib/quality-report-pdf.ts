/**
 * Quality Report PDF Generator — Filtro de Calidad
 * Generates per-policy and batch quality certificates/reports using pdf-lib.
 * Honest: shows actual findings, CFDI evidence, overrides, and unavailable data.
 */

import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface QualityReportFinding {
  severity: 'stop' | 'flag' | 'info'
  category: string
  rule_code: string
  title: string
  detail?: string | null
  detected_at: string
  resolved_at?: string | null
  resolution_notes?: string | null
  // CFDI evidence (optional)
  cfdi?: {
    uuid?: string
    rfc_emisor?: string
    rfc_receptor?: string
    total?: string
    sat_status?: string
    sat_cancel_reason?: string
    duplicate_detected?: boolean
    extraction_method?: string
    extracted_at?: string
  } | null
}

export interface PolicyReportInput {
  solicitudId: string
  folio?: string | null
  policy_number?: string | null
  agent_id?: string | null
  dependencia?: string | null
  contratante_name?: string | null
  generated_at: string
  findings: QualityReportFinding[]
  override_summary?: {
    total_overrides: number
    approved: number
    rejected: number
  } | null
}

export interface BatchReportInput {
  generated_at: string
  period_label?: string | null
  policies: PolicyReportInput[]
  totals: {
    total_policies: number
    total_stops: number
    total_flags: number
    total_overrides: number
    clean_policies: number
  }
}

// ─────────────────────────────────────────────────────────────
// Colors
// ─────────────────────────────────────────────────────────────
const COLOR = {
  red:    rgb(0.85, 0.15, 0.15),
  orange: rgb(0.85, 0.45, 0.05),
  blue:   rgb(0.13, 0.40, 0.75),
  green:  rgb(0.12, 0.58, 0.30),
  gray:   rgb(0.45, 0.45, 0.45),
  black:  rgb(0.08, 0.08, 0.08),
  white:  rgb(1, 1, 1),
  lightGray: rgb(0.93, 0.93, 0.93),
  darkGray: rgb(0.25, 0.25, 0.25),
  stopBg:   rgb(1.0, 0.92, 0.92),
  flagBg:   rgb(1.0, 0.97, 0.88),
  infoBg:   rgb(0.92, 0.95, 1.0),
}

function severityColor(sev: string) {
  if (sev === 'stop') return COLOR.red
  if (sev === 'flag') return COLOR.orange
  return COLOR.blue
}

function severityLabel(sev: string) {
  if (sev === 'stop') return 'PARADA DURA'
  if (sev === 'flag') return 'BANDERA'
  return 'INFO'
}

// ─────────────────────────────────────────────────────────────
// Drawing helpers
// ─────────────────────────────────────────────────────────────
interface DrawCtx {
  page: PDFPage
  bold: PDFFont
  regular: PDFFont
  width: number
  height: number
  margin: number
  y: number
}

function newPage(doc: PDFDocument, bold: PDFFont, regular: PDFFont): DrawCtx {
  const page = doc.addPage([595, 842]) // A4
  const { width, height } = page.getSize()
  return { page, bold, regular, width, height, margin: 48, y: height - 60 }
}

function drawText(
  ctx: DrawCtx,
  text: string,
  opts: {
    font?: PDFFont
    size?: number
    color?: ReturnType<typeof rgb>
    x?: number
    maxWidth?: number
    indent?: number
  } = {}
): number {
  const {
    font = ctx.regular,
    size = 10,
    color = COLOR.black,
    x = ctx.margin + (opts.indent ?? 0),
    maxWidth = ctx.width - ctx.margin * 2 - (opts.indent ?? 0),
  } = opts

  // Simple word-wrap
  const words = text.split(' ')
  let line = ''
  const lines: string[] = []
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    const w = font.widthOfTextAtSize(test, size)
    if (w > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)

  let totalH = 0
  for (const l of lines) {
    ctx.page.drawText(l, { x, y: ctx.y, font, size, color })
    ctx.y -= size + 3
    totalH += size + 3
  }
  return totalH
}

function drawHRule(ctx: DrawCtx, color = COLOR.lightGray) {
  ctx.page.drawLine({
    start: { x: ctx.margin, y: ctx.y },
    end: { x: ctx.width - ctx.margin, y: ctx.y },
    thickness: 0.5,
    color,
  })
  ctx.y -= 8
}

function drawRect(
  ctx: DrawCtx,
  height: number,
  color: ReturnType<typeof rgb>,
  opts: { x?: number; w?: number } = {}
) {
  const x = opts.x ?? ctx.margin
  const w = opts.w ?? ctx.width - ctx.margin * 2
  ctx.page.drawRectangle({ x, y: ctx.y - height + 4, width: w, height, color })
}

function ensureSpace(ctx: DrawCtx, doc: PDFDocument, needed: number): DrawCtx {
  if (ctx.y - needed < 60) {
    return { ...newPage(doc, ctx.bold, ctx.regular) }
  }
  return ctx
}

// ─────────────────────────────────────────────────────────────
// Header / Footer helpers
// ─────────────────────────────────────────────────────────────
function drawPageHeader(ctx: DrawCtx, title: string, subtitle: string) {
  drawRect(ctx, 40, rgb(0.08, 0.22, 0.48))
  ctx.y += 24
  drawText(ctx, title, { font: ctx.bold, size: 14, color: COLOR.white })
  drawText(ctx, subtitle, { font: ctx.regular, size: 9, color: rgb(0.8, 0.85, 1.0) })
  ctx.y -= 8
}

function drawPageFooter(ctx: DrawCtx, pageNum: number, generatedAt: string) {
  const savedY = ctx.y
  ctx.y = 38
  drawHRule(ctx)
  drawText(ctx, `Filtro Calidad VeSeguro · Generado: ${new Date(generatedAt).toLocaleString('es-MX')} · Pág. ${pageNum}`, {
    size: 8,
    color: COLOR.gray,
  })
  ctx.y = savedY
}

// ─────────────────────────────────────────────────────────────
// Per-Policy Report
// ─────────────────────────────────────────────────────────────
export async function buildPolicyQualityPdf(input: PolicyReportInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  let ctx = newPage(doc, bold, regular)
  let pageNum = 1

  // Header
  const title = `Reporte de Calidad — ${input.folio ?? input.solicitudId.slice(0, 8)}`
  const subtitle = `Póliza: ${input.policy_number ?? 'N/D'} · Agente: ${input.agent_id ?? 'N/D'} · Dep: ${input.dependencia ?? 'N/D'}`
  drawPageHeader(ctx, title, subtitle)

  // Summary box
  const stops = input.findings.filter((f) => f.severity === 'stop')
  const flags = input.findings.filter((f) => f.severity === 'flag')
  const infos = input.findings.filter((f) => f.severity === 'info')
  const hasFindings = input.findings.length > 0
  const allResolved = hasFindings && input.findings.every((f) => f.resolved_at)
  const hasOpenStops = stops.some((f) => !f.resolved_at)

  const statusText = !hasFindings
    ? '✅ SIN HALLAZGOS — Aprobado para emisión'
    : hasOpenStops
    ? '🛑 PARADA DURA ACTIVA — Requiere override'
    : allResolved
    ? '✅ Hallazgos resueltos'
    : '⚠️ Hallazgos pendientes de revisión'

  ctx = ensureSpace(ctx, doc, 60)
  drawRect(ctx, 46, rgb(0.95, 0.97, 1.0))
  ctx.y += 30
  drawText(ctx, statusText, { font: bold, size: 11, color: hasOpenStops ? COLOR.red : allResolved && !hasFindings ? COLOR.green : COLOR.orange })
  ctx.y += 2
  drawText(ctx, `Contratante: ${input.contratante_name ?? 'N/D'}  ·  Folio: ${input.folio ?? 'N/D'}`, { size: 9, color: COLOR.gray })
  ctx.y -= 10

  // Stats row
  ctx = ensureSpace(ctx, doc, 28)
  const statItems = [
    { label: 'Paradas Duras', value: `${stops.length}`, color: COLOR.red },
    { label: 'Banderas', value: `${flags.length}`, color: COLOR.orange },
    { label: 'Info', value: `${infos.length}`, color: COLOR.blue },
    { label: 'Overrides', value: `${input.override_summary?.total_overrides ?? 'N/D'}`, color: COLOR.gray },
  ]
  const colW = (ctx.width - ctx.margin * 2) / statItems.length
  for (let i = 0; i < statItems.length; i++) {
    const item = statItems[i]
    const x = ctx.margin + i * colW
    ctx.page.drawRectangle({ x, y: ctx.y - 22, width: colW - 4, height: 28, color: COLOR.lightGray })
    ctx.page.drawText(item.value, { x: x + 6, y: ctx.y - 6, font: bold, size: 14, color: item.color })
    ctx.page.drawText(item.label, { x: x + 6, y: ctx.y - 18, font: regular, size: 7, color: COLOR.gray })
  }
  ctx.y -= 32
  drawHRule(ctx)

  // ── Findings ──
  if (!hasFindings) {
    ctx = ensureSpace(ctx, doc, 40)
    drawRect(ctx, 28, rgb(0.92, 1.0, 0.94))
    ctx.y += 14
    drawText(ctx, 'No se detectaron hallazgos de calidad para esta solicitud.', { font: bold, size: 10, color: COLOR.green })
    ctx.y -= 16
  } else {
    drawText(ctx, 'HALLAZGOS DETECTADOS', { font: bold, size: 9, color: COLOR.darkGray, indent: 0 })
    ctx.y -= 4

    for (const f of input.findings) {
      ctx = ensureSpace(ctx, doc, 70)

      const bgColor = f.severity === 'stop' ? COLOR.stopBg : f.severity === 'flag' ? COLOR.flagBg : COLOR.infoBg
      const sevCol = severityColor(f.severity)

      drawRect(ctx, 12, sevCol)
      ctx.y += -2
      drawText(ctx, `${severityLabel(f.severity)} — ${f.rule_code}`, { font: bold, size: 9, color: COLOR.white })

      drawRect(ctx, 1, bgColor, { x: ctx.margin, w: ctx.width - ctx.margin * 2 })

      drawText(ctx, f.title, { font: bold, size: 10, color: sevCol, indent: 4 })
      if (f.detail) {
        drawText(ctx, f.detail, { size: 9, color: COLOR.darkGray, indent: 4 })
      }
      drawText(ctx, `Detectado: ${new Date(f.detected_at).toLocaleString('es-MX')}`, { size: 8, color: COLOR.gray, indent: 4 })

      if (f.resolved_at) {
        drawText(ctx, `✅ Resuelto: ${new Date(f.resolved_at).toLocaleString('es-MX')}`, { size: 8, color: COLOR.green, indent: 4 })
        if (f.resolution_notes) {
          drawText(ctx, `Notas: ${f.resolution_notes}`, { size: 8, color: COLOR.gray, indent: 4 })
        }
      } else if (f.severity === 'stop') {
        drawText(ctx, '⚠️ Pendiente de override por Mario', { font: bold, size: 8, color: COLOR.red, indent: 4 })
      }

      // CFDI evidence
      if (f.cfdi) {
        ctx = ensureSpace(ctx, doc, 50)
        drawRect(ctx, 10, rgb(0.88, 0.93, 1.0))
        ctx.y += -2
        drawText(ctx, '🧾 Evidencia CFDI', { font: bold, size: 8, color: COLOR.blue })
        const cfdi = f.cfdi
        if (cfdi.uuid) drawText(ctx, `UUID: ${cfdi.uuid}`, { size: 8, color: COLOR.darkGray, indent: 8 })
        if (cfdi.rfc_emisor) drawText(ctx, `RFC Emisor: ${cfdi.rfc_emisor}  RFC Receptor: ${cfdi.rfc_receptor ?? 'N/D'}`, { size: 8, color: COLOR.darkGray, indent: 8 })
        if (cfdi.total) drawText(ctx, `Total: $${cfdi.total}`, { size: 8, color: COLOR.darkGray, indent: 8 })
        if (cfdi.sat_status) {
          const satCol = cfdi.sat_status === 'Vigente' ? COLOR.green : cfdi.sat_status === 'Cancelado' ? COLOR.red : COLOR.orange
          drawText(ctx, `Estado SAT: ${cfdi.sat_status}${cfdi.sat_cancel_reason ? ` (${cfdi.sat_cancel_reason})` : ''}`, { font: bold, size: 8, color: satCol, indent: 8 })
        } else {
          drawText(ctx, 'Estado SAT: No disponible / pendiente', { size: 8, color: COLOR.gray, indent: 8 })
        }
        if (cfdi.duplicate_detected) {
          drawText(ctx, '🔴 UUID DUPLICADO detectado', { font: bold, size: 8, color: COLOR.red, indent: 8 })
        }
        if (cfdi.extraction_method) {
          drawText(ctx, `Extracción: ${cfdi.extraction_method} · ${cfdi.extracted_at ? new Date(cfdi.extracted_at).toLocaleString('es-MX') : 'N/D'}`, { size: 7, color: COLOR.gray, indent: 8 })
        }
      }

      ctx.y -= 6
    }
  }

  // Override summary
  if (input.override_summary && input.override_summary.total_overrides > 0) {
    ctx = ensureSpace(ctx, doc, 40)
    drawHRule(ctx)
    drawText(ctx, 'RESUMEN DE OVERRIDES (Mario)', { font: bold, size: 9, color: COLOR.darkGray })
    ctx.y -= 2
    drawText(ctx, `Total: ${input.override_summary.total_overrides}  ·  Aprobados: ${input.override_summary.approved}  ·  Rechazados: ${input.override_summary.rejected}`, { size: 9, color: COLOR.gray })
    ctx.y -= 6
  }

  // Disclaimer
  ctx = ensureSpace(ctx, doc, 30)
  drawHRule(ctx)
  drawText(ctx, 'Este reporte fue generado automáticamente por el sistema Filtro Calidad VeSeguro. Los datos reflejan el estado real de la solicitud al momento de generación. Los hallazgos sin resolver deben atenderse antes de continuar con la emisión.', { size: 7, color: COLOR.gray })

  // Footers on all pages
  const pages = doc.getPages()
  for (let i = 0; i < pages.length; i++) {
    const footCtx: DrawCtx = { page: pages[i], bold, regular, width: pages[i].getSize().width, height: pages[i].getSize().height, margin: 48, y: 0 }
    drawPageFooter(footCtx, i + 1, input.generated_at)
  }

  return await doc.save()
}

// ─────────────────────────────────────────────────────────────
// Batch Summary Report
// ─────────────────────────────────────────────────────────────
export async function buildBatchQualityPdf(input: BatchReportInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  let ctx = newPage(doc, bold, regular)

  // Cover header
  const subtitle = `Periodo: ${input.period_label ?? 'N/D'} · Generado: ${new Date(input.generated_at).toLocaleString('es-MX')}`
  drawPageHeader(ctx, 'Reporte Batch — Filtro Calidad VeSeguro', subtitle)

  // Totals
  ctx = ensureSpace(ctx, doc, 50)
  drawRect(ctx, 40, COLOR.lightGray)
  ctx.y += 24
  const t = input.totals
  drawText(ctx, `Pólizas evaluadas: ${t.total_policies}  ·  Limpias: ${t.clean_policies}  ·  Con paradas: ${t.total_stops}  ·  Con banderas: ${t.total_flags}  ·  Overrides: ${t.total_overrides}`, { font: bold, size: 10, color: COLOR.black })
  ctx.y -= 18

  drawHRule(ctx)

  // Per-policy summary table header
  ctx = ensureSpace(ctx, doc, 20)
  drawRect(ctx, 14, rgb(0.08, 0.22, 0.48))
  ctx.y += -1
  const col = [ctx.margin, ctx.margin + 80, ctx.margin + 200, ctx.margin + 280, ctx.margin + 340, ctx.margin + 400]
  ctx.page.drawText('Folio', { x: col[0], y: ctx.y, font: bold, size: 8, color: COLOR.white })
  ctx.page.drawText('Agente', { x: col[1], y: ctx.y, font: bold, size: 8, color: COLOR.white })
  ctx.page.drawText('Póliza', { x: col[2], y: ctx.y, font: bold, size: 8, color: COLOR.white })
  ctx.page.drawText('Paradas', { x: col[3], y: ctx.y, font: bold, size: 8, color: COLOR.white })
  ctx.page.drawText('Banderas', { x: col[4], y: ctx.y, font: bold, size: 8, color: COLOR.white })
  ctx.page.drawText('Estado', { x: col[5], y: ctx.y, font: bold, size: 8, color: COLOR.white })
  ctx.y -= 16

  // Rows
  for (let i = 0; i < input.policies.length; i++) {
    const p = input.policies[i]
    ctx = ensureSpace(ctx, doc, 16)

    const stops = p.findings.filter((f) => f.severity === 'stop')
    const flags = p.findings.filter((f) => f.severity === 'flag')
    const openStops = stops.filter((f) => !f.resolved_at)
    const status = openStops.length > 0 ? '🛑 BLOQUEADO' : p.findings.length === 0 ? '✅ LIMPIO' : '⚠️ REVISIÓN'
    const statusColor = openStops.length > 0 ? COLOR.red : p.findings.length === 0 ? COLOR.green : COLOR.orange
    const rowBg = i % 2 === 0 ? rgb(0.98, 0.98, 0.98) : COLOR.white

    drawRect(ctx, 14, rowBg)
    ctx.y += -1
    ctx.page.drawText((p.folio ?? p.solicitudId.slice(0, 8)).slice(0, 18), { x: col[0], y: ctx.y, font: regular, size: 7, color: COLOR.black })
    ctx.page.drawText((p.agent_id ?? 'N/D').slice(0, 14), { x: col[1], y: ctx.y, font: regular, size: 7, color: COLOR.darkGray })
    ctx.page.drawText((p.policy_number ?? 'N/D').slice(0, 16), { x: col[2], y: ctx.y, font: regular, size: 7, color: COLOR.darkGray })
    ctx.page.drawText(String(stops.length), { x: col[3] + 8, y: ctx.y, font: bold, size: 8, color: stops.length > 0 ? COLOR.red : COLOR.gray })
    ctx.page.drawText(String(flags.length), { x: col[4] + 8, y: ctx.y, font: bold, size: 8, color: flags.length > 0 ? COLOR.orange : COLOR.gray })
    ctx.page.drawText(status, { x: col[5], y: ctx.y, font: bold, size: 7, color: statusColor })
    ctx.y -= 14
  }

  // Detailed section per policy (findings only if any)
  const policiesWithFindings = input.policies.filter((p) => p.findings.length > 0)
  if (policiesWithFindings.length > 0) {
    ctx = ensureSpace(ctx, doc, 30)
    drawHRule(ctx)
    drawText(ctx, 'DETALLE DE HALLAZGOS', { font: bold, size: 11, color: COLOR.darkGray })
    ctx.y -= 4

    for (const p of policiesWithFindings) {
      ctx = ensureSpace(ctx, doc, 30)
      drawRect(ctx, 16, rgb(0.88, 0.90, 0.96))
      ctx.y += -1
      drawText(ctx, `${p.folio ?? p.solicitudId.slice(0, 8)} — ${p.policy_number ?? 'N/D'} — Agente: ${p.agent_id ?? 'N/D'}`, { font: bold, size: 9, color: COLOR.blue })
      ctx.y -= 4

      for (const f of p.findings) {
        ctx = ensureSpace(ctx, doc, 28)
        const sevCol = severityColor(f.severity)
        drawText(ctx, `${severityLabel(f.severity)} [${f.rule_code}] — ${f.title}`, { font: bold, size: 8, color: sevCol, indent: 8 })
        if (f.detail) drawText(ctx, f.detail, { size: 7, color: COLOR.darkGray, indent: 16 })
        const resolvedNote = f.resolved_at ? `✅ Resuelto ${new Date(f.resolved_at).toLocaleString('es-MX')}` : f.severity === 'stop' ? '⚠️ Pendiente override' : ''
        if (resolvedNote) drawText(ctx, resolvedNote, { size: 7, color: f.resolved_at ? COLOR.green : COLOR.red, indent: 16 })
        ctx.y -= 2
      }
      ctx.y -= 4
    }
  }

  // Disclaimer
  ctx = ensureSpace(ctx, doc, 28)
  drawHRule(ctx)
  drawText(ctx, 'Reporte generado automáticamente por el sistema Filtro Calidad VeSeguro. Los hallazgos sin resolver requieren atención antes de continuar con emisiones.', { size: 7, color: COLOR.gray })

  // Footers
  const pages = doc.getPages()
  for (let i = 0; i < pages.length; i++) {
    const footCtx: DrawCtx = { page: pages[i], bold, regular, width: pages[i].getSize().width, height: pages[i].getSize().height, margin: 48, y: 0 }
    drawPageFooter(footCtx, i + 1, input.generated_at)
  }

  return await doc.save()
}
