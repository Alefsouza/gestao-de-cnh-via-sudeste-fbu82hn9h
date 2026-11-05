import { DASHBOARD_CACHE_TTL_MS, getCachedData, setCachedData } from './dashboardCache'
import { getVisaoGeralStats, listCnhsVencidasTop, type VisaoGeralStats } from '@/services/employees'
import type { Employee } from '@/lib/types'

/**
 * Camada de cache das métricas pesadas do Dashboard (Visão Geral).
 * Combina contagens do backend (employees) + tabela de CNHs vencidas em uma
 * única Promise cacheada: revisitar o Dashboard logo depois não refaz as
 * consultas pesadas. Invalidada via `invalidateDashboardCache('visao-geral:')`
 * quando o realtime reporta mudança em employees/CNHs.
 */

export interface VisaoGeralMetrics {
  stats: VisaoGeralStats
  vencidas: Employee[]
  hasError: boolean
}

const CACHE_KEY = 'visao-geral:metrics'

let inflight: Promise<VisaoGeralMetrics> | null = null

/**
 * Carrega as métricas do Dashboard com cache curto (TTL em DASHBOARD_CACHE_TTL_MS).
 * forceReload bypassa o cache (usado após invalidação por realtime/sync manual).
 */
export async function loadVisaoGeralMetrics(
  options: { forceReload?: boolean } = {},
): Promise<VisaoGeralMetrics> {
  if (!options.forceReload) {
    const cached = getCachedData<VisaoGeralMetrics>(CACHE_KEY, DASHBOARD_CACHE_TTL_MS)
    if (cached) return cached
  }

  // Compartilha a mesma Promise se já houver carregamento em andamento
  if (inflight) return inflight

  inflight = (async (): Promise<VisaoGeralMetrics> => {
    const [statsResult, cnhsResult] = await Promise.allSettled([
      getVisaoGeralStats(),
      listCnhsVencidasTop(5),
    ])

    let hasError = false
    let stats: VisaoGeralStats = {
      totalColaboradores: 0,
      ativos: 0,
      afastados: 0,
      vencidas: 0,
      fiscais: 0,
      porGaragem: {},
      garagens: [],
    }
    let vencidas: Employee[] = []

    if (statsResult.status === 'fulfilled') {
      stats = statsResult.value.stats
      if (statsResult.value.hasError) hasError = true
    } else {
      hasError = true
      console.error('Erro ao buscar estatísticas da Visão Geral:', statsResult.reason)
    }

    if (cnhsResult.status === 'fulfilled') {
      vencidas = cnhsResult.value
    } else {
      hasError = true
      console.error('Erro ao buscar CNHs vencidas:', cnhsResult.reason)
    }

    return { stats, vencidas, hasError }
  })()

  try {
    const result = await inflight
    setCachedData(CACHE_KEY, result)
    return result
  } finally {
    inflight = null
  }
}
