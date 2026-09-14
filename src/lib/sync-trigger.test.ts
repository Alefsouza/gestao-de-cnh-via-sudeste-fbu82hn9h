import { describe, it, expect } from 'vitest'
import pb from '@/lib/pocketbase/client'

describe('trigger test sync', () => {
  it('creates a sync_runs with TRIGGER_SYNC_PENDING', async () => {
    const rec = await pb.collection('sync_runs').create({
      status: 'TRIGGER_SYNC_PENDING',
      started_at: new Date().toISOString(),
    })
    expect(rec.id).toBeDefined()
    // aguarda 10 segundos para o hook processar
    await new Promise((r) => setTimeout(r, 10000))
    const updated = await pb.collection('sync_runs').getOne(rec.id)
    console.log('Sync result from test:', updated.status, updated.records_updated, updated.error)
    expect(updated.status).not.toBe('TRIGGER_SYNC_PENDING')
  }, 30000)
})
