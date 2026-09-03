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
const RETRY_BASE_DELAY_MS = 800
/** Jitter máximo somado ao backoff (ms), para não sincronizar retries concorrentes. */
const RETRY_JITTER_MS = 400

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
      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * RETRY_JITTER_MS
      await wait(delay)
    }
  }
}

export interface EmployeeFilters {
  search?: string
  empresa?: string
  filial?: string
  funcao?: string
  situacao?: string
  situacaoCnh?: string
  customFilter?: string
  page?: number
  perPage?: number
  sort?: string
}

export function buildFilter(filters: EmployeeFilters): string {
  const parts: string[] = []
  const search = (filters.search ?? '').trim()
  if (search) {
    const escaped = search.replace(/"/g, '\\"')
    parts.push(
      `(name ~ "${escaped}" || chapa ~ "${escaped}" || cnh_numero ~ "${escaped}" || registro ~ "${escaped}" || funcao ~ "${escaped}")`,
    )
  }
  if (filters.empresa) parts.push(`company = "${filters.empresa}"`)
  if (filters.filial) parts.push(`filial = "${filters.filial}"`)
  if (filters.funcao) parts.push(`funcao = "${filters.funcao}"`)
  if (filters.situacao) parts.push(`situacao = "${filters.situacao}"`)
  if (filters.situacaoCnh) parts.push(`situacao_cnh = "${filters.situacaoCnh}"`)
  if (filters.customFilter) parts.push(`(${filters.customFilter})`)
  return parts.join(' && ')
}

export async function listEmployees(filters: EmployeeFilters = {}) {
  const filter = buildFilter(filters)
  return withRetry(() =>
    pb.collection<Employee>(COLLECTION).getList(filters.page ?? 1, filters.perPage ?? 10, {
      filter: filter || undefined,
      sort: filters.sort || 'chapa',
      requestKey: null,
    }),
  )
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
export const CNH_VALIDA_FIELD_FILTER =
  'cnh_numero != "" && situacao_cnh != "Sem CNH" && situacao_cnh != ""'

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

export interface GaragemStat {
  garagem: string
  total: number
}

export interface VisaoGeralStats {
  totalColaboradores: number
  ativos: number
  afastados: number
  vencidas: number
  fiscais: number
  porGaragem: Record<string, number>
  garagens: GaragemStat[]
}

/** Lista de filiais conhecidas para consulta pontual de contagem. */
export const KNOWN_FILIAIS = ['CURSINO', 'SAPOPEMBA', 'GUAIANASES', 'ITAQUERA'] as const

/**
 * Carrega todas as métricas da Visão Geral em paralelo usando contagens pontuais no backend,
 * tratando eventuais falhas individualmente para não derrubar o dashboard.
 * Total de colaboradores conta todas as filiais e garagens da base.
 */
export async function getVisaoGeralStats(): Promise<{ stats: VisaoGeralStats; hasError: boolean }> {
  let hasError = false

  const countSafe = async (filter?: string): Promise<number> => {
    try {
      return await countEmployees(filter)
    } catch (err) {
      console.error(`Erro ao contar colaboradores (${filter ?? 'total'}):`, err)
      hasError = true
      return 0
    }
  }

  // Consulta em paralelo todas as métricas e as contagens por filial/garagem
  const [totalColaboradores, ativos, afastados, vencidas, fiscais, ...filialCounts] =
    await Promise.all([
      countSafe(), // total geral de colaboradores na base employees (todas as 3165 registros)
      countSafe('situacao = "Ativo"'),
      countSafe('situacao = "Afastado"'),
      countSafe(CNH_VENCIDA_FILTER),
      countSafe('funcao ~ "fiscal"'),
      ...KNOWN_FILIAIS.map((garagem) => countSafe(`filial = "${garagem}"`)),
    ])

  const porGaragem: Record<string, number> = {}
  const garagens: GaragemStat[] = []

  KNOWN_FILIAIS.forEach((garagem, index) => {
    const total = filialCounts[index] ?? 0
    porGaragem[garagem] = total
    if (total > 0) {
      garagens.push({ garagem, total })
    }
  })

  // Se houver registros sem filial ou em filial não listada, verifica a diferença para totalColaboradores
  const somaConhecidas = Object.values(porGaragem).reduce((acc, curr) => acc + curr, 0)
  if (totalColaboradores > somaConhecidas) {
    const outros = totalColaboradores - somaConhecidas
    porGaragem['OUTRAS'] = outros
    garagens.push({ garagem: 'OUTRAS', total: outros })
  }

  return {
    stats: {
      totalColaboradores,
      ativos,
      afastados,
      vencidas,
      fiscais,
      porGaragem,
      garagens,
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
export interface FuncionariosSummary {
  total: number
  ativos: number
  afastados: number
  cnhVencida: number
}

export interface FiscaisSummary {
  total: number
  ativos: number
  afastados: number
}

/**
 * Calcula os contadores dos cards da tela de Atualização Fiscal diretamente no backend.
 * Considera apenas colaboradores com função de fiscal (funcao ~ "fiscal") e aplica
 * eventuais filtros de busca, filial/garagem e status de CNH.
 */
export async function getFiscaisSummary(
  baseFilters: {
    search?: string
    filial?: string
    cnhCategoryFilter?: 'todos' | 'Vencida' | 'A vencer' | 'Válida'
  } = {},
): Promise<{ summary: FiscaisSummary; hasError: boolean }> {
  let hasError = false

  const countSafe = async (situacao?: 'Ativo' | 'Afastado'): Promise<number> => {
    try {
      const parts: string[] = ['funcao ~ "fiscal"']
      const search = (baseFilters.search ?? '').trim()
      if (search) {
        const escaped = search.replace(/"/g, '\\"')
        parts.push(
          `(name ~ "${escaped}" || chapa ~ "${escaped}" || cnh_numero ~ "${escaped}" || registro ~ "${escaped}" || funcao ~ "${escaped}")`,
        )
      }
      if (baseFilters.filial) {
        parts.push(`filial = "${baseFilters.filial}"`)
      }
      if (situacao) {
        parts.push(`situacao = "${situacao}"`)
      }
      if (baseFilters.cnhCategoryFilter === 'Vencida') {
        parts.push(
          '(situacao_cnh = "Vencida" || situacao_cnh = "Vencida CNH" || (cnh_numero != "" && situacao_cnh != "Sem CNH" && validade_cnh != "" && validade_cnh < @now))',
        )
      } else if (baseFilters.cnhCategoryFilter === 'A vencer') {
        parts.push(
          '(situacao_cnh = "A vencer" || (cnh_numero != "" && situacao_cnh != "Sem CNH" && validade_cnh != "" && validade_cnh >= @now && validade_cnh <= @now + 2592000))',
        )
      } else if (baseFilters.cnhCategoryFilter === 'Válida') {
        parts.push(
          '(cnh_numero != "" && situacao_cnh != "Sem CNH" && situacao_cnh != "Vencida" && situacao_cnh != "Vencida CNH" && situacao_cnh != "A vencer" && (validade_cnh = "" || validade_cnh > @now + 2592000))',
        )
      }

      return await countEmployees(parts.join(' && '))
    } catch (err) {
      console.error('Erro ao contar fiscais no backend:', err)
      hasError = true
      return 0
    }
  }

  // Executa com pequena pausa sequencial para evitar rajada de requisições simultâneas
  let total = 0
  let ativos = 0
  let afastados = 0

  try {
    total = await countSafe()
  } catch {
    hasError = true
  }

  await wait(150)
  try {
    ativos = await countSafe('Ativo')
  } catch {
    hasError = true
  }

  await wait(150)
  try {
    afastados = await countSafe('Afastado')
  } catch {
    hasError = true
  }

  return {
    summary: { total, ativos, afastados },
    hasError,
  }
}

export interface CnhsSummary {
  todas: number
  valida: number
  aVencer: number
  vencida: number
}

/**
 * Calcula os contadores dos cards e abas da tela de CNHs diretamente no backend PocketBase.
 * Respeita os filtros ativos de busca, filial/garagem e situação do funcionário (Ativo/Afastado).
 */
export async function getCnhsSummary(
  baseFilters: {
    search?: string
    filial?: string
    situacao?: string
  } = {},
): Promise<{ summary: CnhsSummary; hasError: boolean }> {
  let hasError = false

  const countSafe = async (extraFilter?: string): Promise<number> => {
    try {
      const parts: string[] = [CNH_VALIDA_FIELD_FILTER]
      const search = (baseFilters.search ?? '').trim()
      if (search) {
        const escaped = search.replace(/"/g, '\\"')
        parts.push(
          `(name ~ "${escaped}" || chapa ~ "${escaped}" || cnh_numero ~ "${escaped}" || registro ~ "${escaped}" || funcao ~ "${escaped}")`,
        )
      }
      if (baseFilters.filial) {
        parts.push(`filial = "${baseFilters.filial}"`)
      }
      if (baseFilters.situacao) {
        parts.push(`situacao = "${baseFilters.situacao}"`)
      }
      if (extraFilter) {
        parts.push(`(${extraFilter})`)
      }

      const combined = parts.join(' && ')
      return await countEmployees(combined)
    } catch (err) {
      console.error('Erro ao contar CNHs no backend:', err)
      hasError = true
      return 0
    }
  }

  // Executa as contagens de forma sequencial espaçada para evitar rajada e erro 429
  let todas = 0
  let valida = 0
  let aVencer = 0
  let vencida = 0

  try {
    todas = await countSafe()
  } catch {
    hasError = true
  }

  await wait(180)
  try {
    valida = await countSafe('situacao_cnh = "Válida"')
  } catch {
    hasError = true
  }

  await wait(180)
  try {
    aVencer = await countSafe('situacao_cnh = "A vencer"')
  } catch {
    hasError = true
  }

  await wait(180)
  try {
    vencida = await countSafe('situacao_cnh = "Vencida" || situacao_cnh = "Vencida CNH"')
  } catch {
    hasError = true
  }

  return {
    summary: {
      todas,
      valida,
      aVencer,
      vencida,
    },
    hasError,
  }
}

/**
 * Calcula os cards de resumo da tela Matriz de Funcionários
 * em paralelo diretamente no backend PocketBase com tratamento individual de erro.
 * Se houver filtros de busca/empresa/filial/função ativos, eles são incorporados.
 */
export async function getFuncionariosSummary(
  baseFilters: Omit<
    EmployeeFilters,
    'situacao' | 'situacaoCnh' | 'customFilter' | 'page' | 'perPage'
  > = {},
): Promise<{ summary: FuncionariosSummary; hasError: boolean }> {
  let hasError = false

  const countSafe = async (extraFilter?: string): Promise<number> => {
    try {
      const combined = buildFilter({
        ...baseFilters,
        customFilter: extraFilter,
      })
      return await countEmployees(combined || undefined)
    } catch (err) {
      console.error('Erro ao contar colaboradores no backend:', err)
      hasError = true
      return 0
    }
  }

  // Executa com Promise.allSettled e pequena pausa sequencial/controlada para não disparar rajadas no backend
  const results = await Promise.allSettled([
    (async () => countSafe())(),
    (async () => {
      await wait(120)
      return countSafe('situacao = "Ativo"')
    })(),
    (async () => {
      await wait(240)
      return countSafe('situacao = "Afastado"')
    })(),
    (async () => {
      await wait(360)
      return countSafe(CNH_VENCIDA_FILTER)
    })(),
  ])

  const total = results[0].status === 'fulfilled' ? results[0].value : 0
  const ativos = results[1].status === 'fulfilled' ? results[1].value : 0
  const afastados = results[2].status === 'fulfilled' ? results[2].value : 0
  const cnhVencida = results[3].status === 'fulfilled' ? results[3].value : 0

  if (results.some((r) => r.status === 'rejected')) {
    hasError = true
  }

  return {
    summary: {
      total,
      ativos,
      afastados,
      cnhVencida,
    },
    hasError,
  }
}

/** Busca todos os funcionários aplicando os filtros informados, com paginação sequencial e retry para evitar 429. */
/**
 * Busca funcionários de forma paginada e sequencial controlada com retry e backoff para evitar erros 429.
 * Permite customizar o tamanho da página (padrão 200 para balancear velocidade e carga no PocketBase)
 * e callback de progresso opcional.
 */
export async function listEmployeesControlled(
  filters: EmployeeFilters = {},
  options: {
    batchSize?: number
    pageDelayMs?: number
    onProgress?: (loaded: number, total: number) => void
  } = {},
): Promise<Employee[]> {
  const batchSize = Math.min(options.batchSize ?? 200, 500)
  const pageDelayMs = options.pageDelayMs ?? 250
  const filter = buildFilter(filters)

  const first = await withRetry(() =>
    pb.collection<Employee>(COLLECTION).getList(1, batchSize, {
      filter: filter || undefined,
      sort: filters.sort || 'chapa',
      requestKey: null,
    }),
  )

  const items = [...first.items]
  const totalPages = first.totalPages
  const totalItems = first.totalItems

  if (options.onProgress) {
    options.onProgress(items.length, totalItems)
  }

  for (let page = 2; page <= totalPages; page++) {
    // Pausa controlada entre páginas para proteger contra rate limit (429)
    await wait(pageDelayMs)
    const next = await withRetry(() =>
      pb.collection<Employee>(COLLECTION).getList(page, batchSize, {
        filter: filter || undefined,
        sort: filters.sort || 'chapa',
        requestKey: null,
      }),
    )
    items.push(...next.items)
    if (options.onProgress) {
      options.onProgress(items.length, totalItems)
    }
  }

  return items
}

/** Busca todos os funcionários aplicando os filtros informados, com paginação sequencial e retry para evitar 429. */
export async function listAllEmployees(filters: EmployeeFilters = {}): Promise<Employee[]> {
  return listEmployeesControlled(filters)
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
