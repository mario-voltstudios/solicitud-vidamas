import { createAirtableRecord } from '../../lib/airtable'

describe('Airtable backup feature flag', () => {
  const originalEnv = process.env
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    global.fetch = jest.fn() as unknown as typeof fetch
  })

  afterEach(() => {
    process.env = originalEnv
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('no-ops without calling Airtable when AIRTABLE_BACKUP_ENABLED=false', async () => {
    process.env.AIRTABLE_BACKUP_ENABLED = 'false'
    process.env.AIRTABLE_PAT = 'pat_test'
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

    await createAirtableRecord({ folio: 'SMOKE-1' } as Parameters<typeof createAirtableRecord>[0])

    expect(global.fetch).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Backup disabled'))
  })

  it('keeps the existing missing-token no-op when the backup flag is enabled', async () => {
    delete process.env.AIRTABLE_BACKUP_ENABLED
    delete process.env.AIRTABLE_PAT
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await createAirtableRecord({ folio: 'SMOKE-2' } as Parameters<typeof createAirtableRecord>[0])

    expect(global.fetch).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('[Airtable] AIRTABLE_PAT env var not set')
  })
})
