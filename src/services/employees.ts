import type { RecordSubscription } from 'pocketbase'

import pb from '@/lib/pocketbase/client'
import type { Employee } from '@/lib/types'

const COLLECTION = 'employees'
const PAGE_SIZE = 500

/** Status HTTP que vale a pena repetir (rate limit e instabilidade do backend). */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504])
/** Número máximo de tentativas extras antes de desistir. */
const MAX_RETRIES = 5
/** Atraso base do backoff exponencial (ms). */
const RETRY_BASE_DELAY_MS = 500
/** Jitter máximo somado ao backoff (ms), para não sincronizar retries concorrentes. */
const RETRY_JITTER_MS = 250

function isRetryableError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number' &&
    RETRYABLE_STATUS.has((error as { status: number }).status)
  )
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Repete a chamada em caso de 429/5xx com backoff exponencial + jitter,
 * até MAX_RETRIES tentativas extras. Outros erros são propagados direto.
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt >= MAX_RETRIES || !isRetryableError(error)) throw error
      await wait(RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * RETRY_JITTER_MS)
    }
  }
}

export interface EmployeeFilters {
  search?: string
  filial?: string
  funcao?: string
  situacao?: string
  situacaoCnh?: string
  page?: number
  perPage?: number
}

function buildFilter(filters: EmployeeFilters): string {
  const parts: string[] = []
  const search = (filters.search ?? '').trim()
  if (search) {
    const escaped = search.replace(/"/g, '\\"')
    parts.push(`(name ~ "${escaped}" || chapa ~ "${escaped}")`)
  }
  if (filters.filial) parts.push(`filial = "${filters.filial}"`)
  if (filters.funcao) parts.push(`funcao = "${filters.funcao}"`)
  if (filters.situacao) parts.push(`situacao = "${filters.situacao}"`)
  if (filters.situacaoCnh) parts.push(`situacao_cnh = "${filters.situacaoCnh}"`)
  return parts.join(' && ')
}

export async function listEmployees(filters: EmployeeFilters = {}) {
  return pb.collection<Employee>(COLLECTION).getList(filters.page ?? 1, filters.perPage ?? 10, {
    filter: buildFilter(filters),
    sort: 'chapa',
  })
}

/**
 * Busca uma única página da base, sem filtros. Repete automaticamente
 * em caso de 429 (rate limit) ou instabilidade do backend, com backoff exponencial.
 */
export async function listEmployeesPage(page: number, perPage: number) {
  return withRetry(() =>
    pb.collection<Employee>(COLLECTION).getList(page, perPage, { sort: 'chapa' }),
  )
}

/**
 * Filtro padrão para identificar CNHs vencidas no backend PocketBase:
 * 1) situacao_cnh = 'Vencida' OU 'Vencida CNH'
 * 2) OU situacao_cnh != 'Sem CNH' E validade_cnh preenchida e anterior à data/hora atual.
 */
export const CNH_VENCIDA_FILTER =
  'situacao_cnh = "Vencida" || situacao_cnh = "Vencida CNH" || (situacao_cnh != "Sem CNH" && validade_cnh != "" && validade_cnh < @now)'

/**
 * Retorna a contagem de registros que atendem a um determinado filtro,
 * fazendo uma requisição leve com perPage=1 e lendo totalItems.
 */
export async function countEmployees(filter?: string): Promise<number> {
  return withRetry(async () => {
    const res = await pb.collection<Employee>(COLLECTION).getList(1, 1, {
      filter: filter || undefined,
      fields: 'id',
      requestKey: null,
    })
    return res.totalItems
  })
}

export interface VisaoGeralStats {
  ativos: number
  afastados: number
  vencidas: number
  fiscais: number
  porGaragem: {
    CURSINO: number
    SAPOPEMBA: number
  }
}

/**
 * Carrega todas as métricas da Visão Geral em paralelo usando contagens pontuais no backend,
 * tratando eventuais falhas individualmente para não derrubar o dashboard.
 */
export async function getVisaoGeralStats(): Promise<{ stats: VisaoGeralStats; hasError: boolean }> {
  let hasError = false

  const countSafe = async (filter: string): Promise<number> => {
    try {
      return await countEmployees(filter)
    } catch (err) {
      console.error(`Erro ao contar colaboradores (${filter}):`, err)
      hasError = true
      return 0
    }
  }

  const [ativos, afastados, vencidas, fiscais, cursino, sapopemba] = await Promise.all([
    countSafe('situacao = "Ativo"'),
    countSafe('situacao = "Afastado"'),
    countSafe(CNH_VENCIDA_FILTER),
    countSafe('funcao ~ "fiscal"'),
    countSafe('filial = "CURSINO"'),
    countSafe('filial = "SAPOPEMBA"'),
  ])

  return {
    stats: {
      ativos,
      afastados,
      vencidas,
      fiscais,
      porGaragem: {
        CURSINO: cursino,
        SAPOPEMBA: sapopemba,
      },
    },
    hasError,
  }
}

/**
 * Busca as primeiras CNHs vencidas para a tabela da Visão Geral (ordenadas por validade_cnh ascendente).
 */
export async function listCnhsVencidasTop(limit = 5): Promise<Employee[]> {
  return withRetry(async () => {
    const res = await pb.collection<Employee>(COLLECTION).getList(1, limit, {
      filter: CNH_VENCIDA_FILTER,
      sort: 'validade_cnh,chapa',
      requestKey: null,
    })
    return res.items
  })
}

/** Busca todos os funcionários aplicando os filtros informados, com paginação sequencial e retry para evitar 429. */
export async function listAllEmployees(filters: EmployeeFilters = {}): Promise<Employee[]> {
  const filter = buildFilter(filters)
  const first = await withRetry(() =>
    pb.collection<Employee>(COLLECTION).getList(1, PAGE_SIZE, {
      filter,
      sort: 'chapa',
    }),
  )

  const items = [...first.items]
  const totalPages = first.totalPages

  for (let page = 2; page <= totalPages; page++) {
    // Pausa breve entre páginas para não exceder o rate limit do backend (429)
    await wait(150)
    const next = await withRetry(() =>
      pb.collection<Employee>(COLLECTION).getList(page, PAGE_SIZE, {
        filter,
        sort: 'chapa',
      }),
    )
    items.push(...next.items)
  }

  return items
}

export async function getEmployee(id: string): Promise<Employee> {
  return pb.collection<Employee>(COLLECTION).getOne(id)
}

export async function updateEmployee(id: string, data: Partial<Employee>): Promise<Employee> {
  return pb.collection<Employee>(COLLECTION).update(id, data)
}

export function subscribeEmployees(callback: (data: RecordSubscription<Employee>) => void) {
  return pb.collection<Employee>(COLLECTION).subscribe('*', callback)
}
