const RUNS_API = '/api/collections/sync_runs/records'

type SyncStatus = 'Sucesso' | 'Falha' | 'Em andamento'

interface SyncRun {
  id: string
  started_at: string
  finished_at: string
  status: SyncStatus
  records_updated: number
  error?: string | null
}

async function triggerSync(): Promise<SyncRun> {
  const res = await fetch(RUNS_API, { method: 'POST' })
  if (!res.ok) throw new Error(`Falha ao iniciar sincronização: ${res.status}`)
  return res.json()
}

async function getRun(id: string): Promise<SyncRun> {
  const res = await fetch(`${RUNS_API}/${id}`)
  if (!res.ok) throw new Error(`Falha ao consultar sincronização: ${res.status}`)
  return res.json()
}

export { triggerSync, getRun }
