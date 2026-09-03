import pb from '@/lib/pocketbase/client'
import type { ProcessoCadastralRecord, ProcessoSituacao } from '@/lib/types'

export interface ListProcessosOptions {
  filter?: string
  sort?: string
  page?: number
  perPage?: number
}

export interface ListProcessosResult {
  items: ProcessoCadastralRecord[]
  totalItems: number
  totalPages: number
  page: number
  perPage: number
}

export async function listProcessosCadastrais(
  options?: ListProcessosOptions,
): Promise<ProcessoCadastralRecord[]> {
  const records = await pb.collection('processos_cadastrais').getFullList<ProcessoCadastralRecord>({
    sort: options?.sort ?? '-created',
    filter: options?.filter,
  })
  return records
}

export async function listProcessosCadastraisPage(
  page: number = 1,
  perPage: number = 20,
  options?: Omit<ListProcessosOptions, 'page' | 'perPage'>,
): Promise<ListProcessosResult> {
  const result = await pb
    .collection('processos_cadastrais')
    .getList<ProcessoCadastralRecord>(page, perPage, {
      sort: options?.sort ?? '-created',
      filter: options?.filter,
    })
  return {
    items: result.items,
    totalItems: result.totalItems,
    totalPages: result.totalPages,
    page: result.page,
    perPage: result.perPage,
  }
}

export async function createProcessoCadastral(
  data: Omit<ProcessoCadastralRecord, 'id' | 'created' | 'updated'>,
): Promise<ProcessoCadastralRecord> {
  const record = await pb.collection('processos_cadastrais').create<ProcessoCadastralRecord>({
    ...data,
    garagem: data.garagem || 'CURSINO',
  })
  return record
}

export async function updateProcessoCadastral(
  id: string,
  data: Partial<Omit<ProcessoCadastralRecord, 'id' | 'created' | 'updated'>>,
): Promise<ProcessoCadastralRecord> {
  const record = await pb
    .collection('processos_cadastrais')
    .update<ProcessoCadastralRecord>(id, data)
  return record
}

export async function updateProcessoSituacao(
  id: string,
  situacao: ProcessoSituacao,
): Promise<ProcessoCadastralRecord> {
  const record = await pb
    .collection('processos_cadastrais')
    .update<ProcessoCadastralRecord>(id, { situacao })
  return record
}

export async function deleteProcessoCadastral(id: string): Promise<boolean> {
  // IDs com prefixo 'seed-' ou sintéticos não existem no PocketBase
  if (id.startsWith('seed-')) {
    return true
  }

  try {
    await pb.collection('processos_cadastrais').delete(id)
    return true
  } catch (error: any) {
    // Se o registro já não existe (404), trata como sucesso pois o objetivo (não existir mais) foi atingido
    const status = error?.status ?? error?.response?.status ?? error?.statusCode
    const message = error?.message || ''
    if (status === 404 || message.includes("The requested resource wasn't found")) {
      return true
    }
    throw error
  }
}
