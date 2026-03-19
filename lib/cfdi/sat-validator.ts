// ============================================================
// SAT CFDI Validator — Pluggable Abstraction
// lib/cfdi/sat-validator.ts
// Created: 2026-03-19
//
// Architecture: pluggable provider pattern (same as face-match.ts).
//
//   Provider: SATValidator interface
//   Default:  StubSATValidator (safe no-op, records 'sat_unreachable')
//   Future:   SATWebServiceValidator — calls SAT SOAP endpoint
//             FacturamaValidator     — via Facturama API (has SAT verify)
//
// The SAT does offer a SOAP service for verification:
//   WSDL: https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc?wsdl
//   Method: Consulta({ expresionImpresa: "<qr url encoded string>" })
//   Response: CodigoEstatus, Estado (Vigente|Cancelado|No Encontrado), ...
//
// In v1 we ship the stub so the pipeline has a valid seam.
// When env var SAT_VALIDATOR_PROVIDER=sat_soap is set, the
// real SOAP implementation will be loaded instead.
// ============================================================

import type { SATVerifyRequest, SATVerifyResult, SATCFDIStatus } from './types'

// ──────────────────────────────────────────────────────────────
// Provider interface
// ──────────────────────────────────────────────────────────────
export interface SATValidator {
  readonly name: string
  verify(request: SATVerifyRequest): Promise<SATVerifyResult>
}

// ──────────────────────────────────────────────────────────────
// Stub provider (safe default — never fails, marks unreachable)
// ──────────────────────────────────────────────────────────────
class StubSATValidator implements SATValidator {
  readonly name = 'stub'

  async verify(_request: SATVerifyRequest): Promise<SATVerifyResult> {
    return {
      reachable: false,
      status: 'error' as SATCFDIStatus,
      error: 'SAT validator not configured. Set SAT_VALIDATOR_PROVIDER env var to enable.',
      verified_at: new Date().toISOString(),
    }
  }
}

// ──────────────────────────────────────────────────────────────
// SAT SOAP provider skeleton
// TODO: implement when SAT_VALIDATOR_PROVIDER=sat_soap
//
// The SAT CFDI consultation service accepts the full QR URL
// in the "expresionImpresa" field:
//   https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=...
//
// Notes on the SAT SOAP endpoint:
//   - Returns Estado: "Vigente" | "Cancelado" | "No Encontrado"
//   - Returns CodigoEstatus: "S - Comprobante obtenido satisfactoriamente"
//     or "N - 601: ..." etc.
//   - For Cancelado, returns MotivoCancelacion (reason code)
//   - Rate limit: ~200 req/min; retry on 503
//   - Auth: none required (public service)
//
// Implementation outline:
//   1. Build SOAP envelope with expresionImpresa = source_url
//   2. POST to https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc
//   3. Parse XML response → Estado + CodigoEstatus
//   4. Map to SATVerifyResult
// ──────────────────────────────────────────────────────────────
class SATSOAPValidator implements SATValidator {
  readonly name = 'sat_soap'
  private readonly endpoint =
    'https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc'

  async verify(request: SATVerifyRequest): Promise<SATVerifyResult> {
    const verifiedAt = new Date().toISOString()

    // Build the raw expresionImpresa string the SAT expects.
    // IMPORTANT: do NOT URL-encode this payload. SAT expects the literal
    // query-string expression inside CDATA, e.g.:
    //   ?re=AAA010101AAA&rr=BBB010101BBB&tt=1234.56&id=<UUID>
    // Encoding it causes false N-601 / invalid expression responses.
    const expresion = `?re=${request.rfc_emisor}&rr=${request.rfc_receptor}&tt=${request.total}&id=${request.uuid}`

    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
  <soap:Body>
    <tem:Consulta>
      <tem:expresionImpresa><![CDATA[${expresion}]]></tem:expresionImpresa>
    </tem:Consulta>
  </soap:Body>
</soap:Envelope>`

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '"http://tempuri.org/IConsultaCFDIService/Consulta"',
        },
        body: soapBody,
        signal: AbortSignal.timeout(10_000), // 10s timeout
      })

      const text = await res.text()

      if (!res.ok) {
        return {
          reachable: false,
          status: 'error',
          error: `SAT HTTP ${res.status}`,
          raw_response: text,
          verified_at: verifiedAt,
        }
      }

      // Parse Estado from XML response
      const estadoMatch = text.match(/<a:Estado>([^<]+)<\/a:Estado>/i)
      const estado = estadoMatch?.[1]?.trim() ?? ''

      const motivoMatch = text.match(/<a:MotivoCancelacion>([^<]+)<\/a:MotivoCancelacion>/i)
      const motivo = motivoMatch?.[1]?.trim()

      let status: SATCFDIStatus
      if (estado.toLowerCase().includes('vigente')) {
        status = 'Vigente'
      } else if (estado.toLowerCase().includes('cancelado')) {
        status = 'Cancelado'
      } else if (estado.toLowerCase().includes('no encontrado')) {
        status = 'No Encontrado'
      } else {
        status = 'error'
      }

      return {
        reachable: true,
        status,
        cancel_reason: motivo,
        raw_response: text,
        verified_at: verifiedAt,
      }
    } catch (err) {
      return {
        reachable: false,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        verified_at: verifiedAt,
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Factory: select provider from SAT_VALIDATOR_PROVIDER env var
// ──────────────────────────────────────────────────────────────
export function getSATValidator(): SATValidator {
  const provider = process.env.SAT_VALIDATOR_PROVIDER ?? 'stub'
  switch (provider) {
    case 'sat_soap':
      return new SATSOAPValidator()
    case 'stub':
    default:
      return new StubSATValidator()
  }
}
