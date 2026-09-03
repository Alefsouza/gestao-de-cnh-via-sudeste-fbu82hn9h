import pb from '@/lib/pocketbase/client'

/**
 * Controle das sincronizações da matriz (collection `sync_runs`).
 * A rotina real roda no backend (`pocketbase/hooks/sync-employees-lib.js`) e
 * é disparada por:
 * - cron `sync_employees` — a cada 5 minutos;
 * - rota autenticada `POST /backend/v1/sync-employees` — botão
 *   "Atualizar matriz" (Visão Geral) e "Sincronizar agora" (Painel de acesso).
 */

export type SyncStatus = 'Sucesso' | 'Falha' | 'Em andamento'

export interface SyncRun {
  id: string
  started_at: string
  finished_at: string
  status: SyncStatus
  records_updated: number
  error?: string | null
  created: string
  updated: string
}

export interface SyncResult {
  id: string
  status: SyncStatus
  records_updated: number
  error: string
}

/** Dispara a sincronização real no backend (rota autenticada) e devolve o resultado. */
async function triggerSync(): Promise<SyncResult> {
  return pb.send('/backend/v1/sync-employees', { method: 'POST' })
}

async function getRun(id: string): Promise<SyncRun> {
  return pb.collection<SyncRun>('sync_runs').getOne(id)
}

/** Lista as sincronizações mais recentes. */
async function listRuns(limit = 10): Promise<SyncRun[]> {
  return pb
    .collection<SyncRun>('sync_runs')
    .getList(1, limit, {
      sort: '-created',
    })
    .then((res) => res.items)
}

export { triggerSync, getRun, listRuns }
