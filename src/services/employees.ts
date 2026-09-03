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
 * Busca uma única página da base, sem filtros — usada pelo carregamento
 * paginado do dashboard. Repete automaticamente em caso de 429 (rate limit)
 * ou instabilidade do backend, com backoff exponencial.
 */
export async function listEmployeesPage(page: number, perPage: number) {
  return withRetry(() =>
    pb.collection<Employee>(COLLECTION).getList(page, perPage, { sort: 'chapa' }),
  )
}

/** Busca todos os funcionários (até PAGE_SIZE) aplicando os filtros informados. */
export async function listAllEmployees(filters: EmployeeFilters = {}): Promise<Employee[]> {
  const result = await pb.collection<Employee>(COLLECTION).getFullList({
    filter: buildFilter(filters),
    sort: 'chapa',
    batch: PAGE_SIZE,
  })
  return result
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
