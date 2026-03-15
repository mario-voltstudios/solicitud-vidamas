import type { OCRProvider, OCRRequest, OCRResult } from './types'

class StubOCRProvider implements OCRProvider {
  name = 'stub'

  async extract(request: OCRRequest): Promise<OCRResult> {
    return {
      provider: this.name,
      type: request.type,
      confidence: 0,
      extracted: {},
      warnings: ['OCR provider not configured yet.'],
    }
  }
}

export function getOCRProvider(): OCRProvider {
  // Keep provider swappable. We can wire Anthropic/OpenAI/Gemini later without changing callers.
  return new StubOCRProvider()
}
