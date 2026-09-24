import type { RecordSubscription } from 'pocketbase'

import pb from '@/lib/pocketbase/client'
import type { Employee } from '@/lib/types'

const COLLECTION = 'employees'
const PAGE_SIZE = 500

/** Status HTTP que vale a pena repetir (rate limit e instabilidade do backend). */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504])
/** Número máximo de tentativas extras antes de desistir. */
const MAX_RETRIES = 6
/** Atraso base do backoff exponencial (ms). */
const RETRY_BASE_DELAY_MS = 800
/** Jitter máximo somado ao backoff (ms), para não sincronizar retries concorrentes. */
const RETRY_JITTER_MS = 400

function isRetryableError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false

  // PocketBase ClientResponseError ou status HTTP
  if ('status' in error && typeof (error as { status?: unknown }).status === 'number') {
    const status = (error as { status: number }).status
    if (RETRYABLE_STATUS.has(status)) return true
    // Status 0 indica interrupção transitória de conexão / offline temporário
    if (status === 0) return true
  }

  // Falha transitória de rede (TypeError: Failed to fetch)
  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
    return true
  }

  return false
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Repete a chamada em caso de 429/5xx/rede com backoff exponencial + jitter,
 * até MAX_RETRIES tentativas extras. Outros erros são propagados direto.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    onRetry?: (attempt: number, delayMs: number, err: unknown) => void
  } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? MAX_RETRIES
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt >= maxRetries || !isRetryableError(error)) throw error
      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * RETRY_JITTER_MS
      if (options.onRetry) {
        options.onRetry(attempt + 1, delay, error)
      }
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
  excludeDesligados?: boolean
  page?: number
  perPage?: number
  sort?: string
}

export function buildFilter(filters: EmployeeFilters): string {
  const parts: string[] = []
  const search = (filters.search ?? '').trim()
  if (search) {
    const escaped = search.replace(/"/g, '\\"')
    const digitsOnly = search.replace(/\D/g, '')
    const cpfClause =
      digitsOnly.length >= 3 ? ` || cpf ~ "${digitsOnly}"` : ` || cpf ~ "${escaped}"`
    parts.push(
      `(name ~ "${escaped}" || chapa ~ "${escaped}" || cnh_numero ~ "${escaped}" || registro ~ "${escaped}" || funcao ~ "${escaped}" || funcao_anterior ~ "${escaped}" || motivo_afastamento ~ "${escaped}"${cpfClause})`,
    )
  }
  if (filters.empresa) parts.push(`company = "${filters.empresa}"`)
  if (filters.filial) parts.push(`filial = "${filters.filial}"`)
  if (filters.funcao) parts.push(`funcao = "${filters.funcao.replace(/"/g, '\\"')}"`)
  if (filters.situacao) {
    parts.push(`situacao = "${filters.situacao}"`)
  } else if (filters.excludeDesligados) {
    parts.push('situacao != "Desligado"')
  }
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
  '(situacao_cnh = "Vencida" || situacao_cnh = "Vencida CNH" || (situacao_cnh != "Sem CNH" && validade_cnh != "" && validade_cnh < @now)) && situacao != "Desligado"'

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
  total?: number
  totalColaboradores: number
  ativos: number
  afastados: number
  vencidas: number
  aVencer30d?: number
  emDia?: number
  fiscais: number
  porGaragem: Record<string, number>
  garagens: GaragemStat[]
}

export interface AfastadosSummary {
  total: number
  cursino: number
  sapopemba: number
  outros: number
}

/**
 * Calcula os contadores dos cards da tela de Afastados diretamente no backend.
 * Considera colaboradores com situação de afastamento (situacao = "Afastado").
 * Retorna o total geral de afastados e o detalhamento por garagem/filial (CURSINO, SAPOPEMBA, outros).
 */
export async function getAfastadosSummary(
  baseFilters: {
    search?: string
    empresa?: string
    filial?: string
  } = {},
): Promise<{ summary: AfastadosSummary; hasError: boolean }> {
  let hasError = false

  const countSafe = async (extraFilter?: string): Promise<number> => {
    try {
      const parts: string[] = ['situacao = "Afastado"']
      const search = (baseFilters.search ?? '').trim()
      if (search) {
        const escaped = search.replace(/"/g, '\\"')
        parts.push(
          `(name ~ "${escaped}" || chapa ~ "${escaped}" || cnh_numero ~ "${escaped}" || registro ~ "${escaped}" || funcao ~ "${escaped}" || funcao_anterior ~ "${escaped}" || motivo_afastamento ~ "${escaped}")`,
        )
      }
      if (baseFilters.empresa) {
        parts.push(`company = "${baseFilters.empresa.replace(/"/g, '\\"')}"`)
      }
      if (baseFilters.filial) {
        parts.push(
          `(filial = "${baseFilters.filial}" || filial = "${baseFilters.filial.toLowerCase()}" || filial = "${baseFilters.filial.toUpperCase()}")`,
        )
      }
      if (extraFilter) {
        parts.push(`(${extraFilter})`)
      }

      return await countEmployees(parts.join(' && '))
    } catch (err) {
      console.error('Erro ao contar afastados no backend:', err)
      hasError = true
      return 0
    }
  }

  let total = 0
  let cursino = 0
  let sapopemba = 0

  try {
    total = await countSafe()
  } catch {
    hasError = true
  }

  await wait(120)
  try {
    cursino = await countSafe('filial = "CURSINO" || filial = "cursino"')
  } catch {
    hasError = true
  }

  await wait(120)
  try {
    sapopemba = await countSafe('filial = "SAPOPEMBA" || filial = "sapopemba"')
  } catch {
    hasError = true
  }

  const outros = Math.max(0, total - (cursino + sapopemba))

  return {
    summary: { total, cursino, sapopemba, outros },
    hasError,
  }
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
  // REQUISITO: considerar SOMENTE colaboradores Ativos e Afastados (excluir Desligados de tudo)
  const [totalColaboradores, ativos, afastados, vencidas, fiscais, ...filialCounts] =
    await Promise.all([
      countSafe('situacao != "Desligado"'),
      countSafe('situacao = "Ativo"'),
      countSafe('situacao = "Afastado"'),
      countSafe(CNH_VENCIDA_FILTER),
      countSafe('funcao ~ "fiscal" && situacao != "Desligado"'),
      ...KNOWN_FILIAIS.map((garagem) =>
        countSafe(`filial = "${garagem}" && situacao != "Desligado"`),
      ),
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
      filter: `${CNH_VENCIDA_FILTER} && situacao != "Desligado"`,
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
          `(name ~ "${escaped}" || chapa ~ "${escaped}" || cnh_numero ~ "${escaped}" || registro ~ "${escaped}" || funcao ~ "${escaped}" || funcao_anterior ~ "${escaped}")`,
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
 * Respeita os filtros ativos de busca, filial/garagem, função e situação do funcionário (Ativo/Afastado).
 */
export async function getCnhsSummary(
  baseFilters: {
    search?: string
    filial?: string
    funcao?: string
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
          `(name ~ "${escaped}" || chapa ~ "${escaped}" || cnh_numero ~ "${escaped}" || registro ~ "${escaped}" || funcao ~ "${escaped}" || funcao_anterior ~ "${escaped}")`,
        )
      }
      if (baseFilters.filial) {
        parts.push(`filial = "${baseFilters.filial}"`)
      }
      if (baseFilters.funcao) {
        parts.push(`funcao = "${baseFilters.funcao.replace(/"/g, '\\"')}"`)
      }
      if (baseFilters.situacao) {
        parts.push(`situacao = "${baseFilters.situacao}"`)
      } else {
        // Se nenhuma situação foi selecionada explicitamente, considera somente Ativos e Afastados
        parts.push('situacao != "Desligado"')
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
 * Lista as funções distintas que existem na base de colaboradores COM CNH registrada
 * (cnh_numero != "" && situacao_cnh != "Sem CNH"), ordenadas alfabeticamente.
 * Tenta via endpoint leve dedicado (/api/distinct-funcoes) ou varredura paginada com cache em memória.
 */
let distinctFuncoesCache: string[] | null = null
let distinctFuncoesPromise: Promise<string[]> | null = null

export async function listDistinctFuncoes(): Promise<string[]> {
  if (distinctFuncoesCache && distinctFuncoesCache.length > 0) {
    return distinctFuncoesCache
  }
  if (distinctFuncoesPromise) {
    return distinctFuncoesPromise
  }

  distinctFuncoesPromise = (async () => {
    try {
      // Tenta chamar endpoint dedicado caso disponível
      const endpointRes = await fetch(`${pb.baseUrl}/api/distinct-funcoes`, {
        headers: pb.authStore.token ? { Authorization: pb.authStore.token } : {},
      })
      if (endpointRes.ok) {
        const json = await endpointRes.json()
        if (Array.isArray(json?.funcoes) && json.funcoes.length > 0) {
          distinctFuncoesCache = json.funcoes
          return json.funcoes
        }
      }
    } catch {
      // endpoint customizado ainda não disponível, segue fallback
    }

    try {
      // Fallback: busca registros consultando apenas o campo `funcao` dos que têm CNH registrada
      const set = new Set<string>()
      let page = 1
      let totalPages = 1
      const perPage = 500

      while (page <= totalPages && page <= 10) {
        const res = await withRetry(() =>
          pb.collection<Employee>(COLLECTION).getList(page, perPage, {
            fields: 'funcao',
            filter: `funcao != "" && ${CNH_VALIDA_FIELD_FILTER}`,
            requestKey: null,
          }),
        )
        for (const item of res.items) {
          const fn = String(item.funcao || '').trim()
          if (fn) set.add(fn)
        }
        totalPages = res.totalPages
        page++
        if (page <= totalPages) {
          await wait(150)
        }
      }

      if (set.size === 0) {
        // Fallback defensivo com as funções com CNH conhecidas da Via Sudeste
        const fallback = [
          'Ag.terminal Ii',
          'Cobrador',
          'Eletricista',
          'Enc De Trafego',
          'Encar.operaciona',
          'Fiscal de Viajem',
          'Inspetor',
          'Instrutor',
          'Lavad/abast/manobr',
          'Lider Manutencao',
          'Mecanico',
          'Mecanico Socorr',
          'Mecanico Validador',
          'Motorista',
          'Motorista Manutenc',
          'Motorista-socorris',
          'Motorista-van',
          'Supervisor',
        ].sort((a, b) => a.localeCompare(b, 'pt-BR'))
        distinctFuncoesCache = fallback
        return fallback
      }

      const list = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
      distinctFuncoesCache = list
      return list
    } catch (err) {
      console.warn('Erro ao carregar lista de funções distintas com CNH:', err)
      const fallback = [
        'Ag.terminal Ii',
        'Cobrador',
        'Eletricista',
        'Enc De Trafego',
        'Encar.operaciona',
        'Fiscal de Viajem',
        'Inspetor',
        'Instrutor',
        'Lavad/abast/manobr',
        'Lider Manutencao',
        'Mecanico',
        'Mecanico Socorr',
        'Mecanico Validador',
        'Motorista',
        'Motorista Manutenc',
        'Motorista-socorris',
        'Motorista-van',
        'Supervisor',
      ].sort((a, b) => a.localeCompare(b, 'pt-BR'))
      distinctFuncoesCache = fallback
      return fallback
    } finally {
      distinctFuncoesPromise = null
    }
  })()

  return distinctFuncoesPromise
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
        excludeDesligados: true,
      })
      return await countEmployees(combined || undefined)
    } catch (err) {
      console.error('Erro ao contar colaboradores no backend:', err)
      hasError = true
      return 0
    }
  }

  // Executa com Promise.allSettled e pequena pausa sequencial/controlada para não disparar rajadas no backend
  // Requisito: Total considera apenas Ativos e Afastados (exclui desligados)
  const results = await Promise.allSettled([
    (async () => countSafe('situacao != "Desligado"'))(),
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

  const first = await withRetry(
    () =>
      pb.collection<Employee>(COLLECTION).getList(1, batchSize, {
        filter: filter || undefined,
        sort: filters.sort || 'chapa',
        requestKey: null,
      }),
    { maxRetries: 6 },
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
    const next = await withRetry(
      () =>
        pb.collection<Employee>(COLLECTION).getList(page, batchSize, {
          filter: filter || undefined,
          sort: filters.sort || 'chapa',
          requestKey: null,
        }),
      { maxRetries: 6 },
    )
    items.push(...next.items)
    if (options.onProgress) {
      options.onProgress(items.length, totalItems)
    }
  }

  return items
}

/** Cache em memória da base completa de funcionários para evitar recargas excessivas */
let employeesCache: Employee[] | null = null
let employeesPromise: Promise<Employee[]> | null = null

/**
 * Retorna a lista completa de funcionários em memória.
 * Se já estiver em andamento, compartilha a mesma Promise.
 * Se já carregada, retorna o cache a menos que forceReload seja verdadeiro.
 */
export async function getCachedEmployees(
  options: {
    forceReload?: boolean
    filter?: string
    onProgress?: (loaded: number, total: number) => void
  } = {},
): Promise<Employee[]> {
  if (!options.forceReload && employeesCache && employeesCache.length > 0) {
    if (options.onProgress) {
      options.onProgress(employeesCache.length, employeesCache.length)
    }
    return employeesCache
  }

  if (employeesPromise && !options.forceReload) {
    return employeesPromise
  }

  employeesPromise = (async () => {
    try {
      const filters: EmployeeFilters = options.filter ? { customFilter: options.filter } : {}
      const items = await listEmployeesControlled(filters, {
        batchSize: 200,
        pageDelayMs: 200,
        onProgress: options.onProgress,
      })
      employeesCache = items
      return items
    } catch (err) {
      // Em caso de falha, não trava futuras tentativas
      employeesPromise = null
      throw err
    } finally {
      employeesPromise = null
    }
  })()

  return employeesPromise
}

/**
 * Atualiza incrementalmente um registro de funcionário no cache em memória.
 * Evita recarregar a base inteira (~3.180 colaboradores) em tempo real.
 */
export function updateCachedEmployee(
  action: 'create' | 'update' | 'delete',
  record: Employee,
): Employee[] | null {
  if (!employeesCache) return null

  if (action === 'delete') {
    employeesCache = employeesCache.filter((e) => e.id !== record.id)
    return employeesCache
  }

  const index = employeesCache.findIndex((e) => e.id === record.id)
  if (index >= 0) {
    employeesCache[index] = { ...employeesCache[index], ...record }
  } else {
    employeesCache.push(record)
  }
  return employeesCache
}

/**
 * Limpa o cache de funcionários caso seja necessário forçar recarga completa externa.
 */
export function invalidateEmployeesCache(): void {
  employeesCache = null
  employeesPromise = null
}

/** Busca todos os funcionários aplicando os filtros informados, com paginação sequencial e retry para evitar 429. */
export async function listAllEmployees(filters: EmployeeFilters = {}): Promise<Employee[]> {
  // Se não tem filtros específicos, aproveita o cache compartilhado se disponível
  const hasFilter = Object.values(filters).some((v) => v !== undefined && v !== '')
  if (!hasFilter && employeesCache && employeesCache.length > 0) {
    return employeesCache
  }
  return listEmployeesControlled(filters)
}

/**
 * Busca rápida e pontual de um colaborador por matrícula, registro ou chapa.
 * Usa os índices dedicados idx_employees_chapa e idx_employees_registro do PocketBase.
 * Sem filtro de situação (encontra Ativos, Afastados e Desligados).
 */
export async function findEmployeeByMatriculaOrChapa(
  term: string,
  options: { allowDesligados?: boolean } = {},
): Promise<Employee | null> {
  const cleanTerm = term.trim()
  if (!cleanTerm) return null

  // Limpa caracteres especiais mantendo dígitos e letras (evita injeção no filter PocketBase)
  const digitsOnly = cleanTerm.replace(/\D/g, '')
  const safe = cleanTerm.replace(/["\\]/g, '')
  const candidates = new Set<string>()

  if (safe) candidates.add(safe)
  if (digitsOnly) {
    candidates.add(digitsOnly)
    candidates.add(digitsOnly.padStart(6, '0'))
    candidates.add(digitsOnly.padStart(5, '0'))
    candidates.add(digitsOnly.padStart(4, '0'))
    const unpadded = digitsOnly.replace(/^0+/, '')
    if (unpadded) candidates.add(unpadded)
  }

  const clauses: string[] = []
  for (const cand of candidates) {
    clauses.push(`chapa = "${cand}"`)
    clauses.push(`registro = "${cand}"`)
  }

  let finalFilter = clauses.join(' || ')
  // Se não permitir desligados (ex.: Inclusão, PRAT, Retorno do Afastamento, Mudança de Função, Atualização),
  // filtra apenas registros Ativos e Afastados (exclui Desligado e Demitido).
  // Se allowDesligados for true (processo de Exclusão), permite Ativos, Afastados e Demitidos/Desligados.
  if (!options.allowDesligados) {
    finalFilter = `(${finalFilter}) && situacao != "Desligado" && situacao != "Demitido"`
  }

  // Executa com indexed filter direto no PocketBase (rápido e sem carregar a base toda)
  try {
    const res = await withRetry(() =>
      pb.collection<Employee>(COLLECTION).getList(1, 1, {
        filter: finalFilter,
        requestKey: null,
      }),
    )
    if (res.items.length > 0) {
      return res.items[0]
    }
  } catch (err) {
    console.error('Erro na busca pontual por chapa/registro:', err)
  }

  return null
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
