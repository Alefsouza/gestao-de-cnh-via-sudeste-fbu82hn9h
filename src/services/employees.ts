import type { RecordSubscription } from 'pocketbase'

import pb from '@/lib/pocketbase/client'
import type { Employee } from '@/lib/types'

const COLLECTION = 'employees'
const PAGE_SIZE = 500

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
