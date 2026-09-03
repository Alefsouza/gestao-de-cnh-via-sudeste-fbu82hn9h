import pb from '@/lib/pocketbase/client'
import type { ProcessoCadastralRecord, ProcessoSituacao } from '@/lib/types'

export async function listProcessosCadastrais(): Promise<ProcessoCadastralRecord[]> {
  const records = await pb.collection('processos_cadastrais').getFullList<ProcessoCadastralRecord>({
    sort: '-created',
  })
  return records
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
  await pb.collection('processos_cadastrais').delete(id)
  return true
}
