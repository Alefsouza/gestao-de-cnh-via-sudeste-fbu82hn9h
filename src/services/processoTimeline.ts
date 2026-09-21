import pb from '@/lib/pocketbase/client'
import type { ProcessoTimelineRecord, UserRole } from '@/lib/types'

export interface CreateTimelineInput {
  processo: string
  etapa: string
  responsavel_nome: string
  responsavel_perfil: UserRole
  observacoes?: string
  motivo?: string
  documentos_recebidos?: string[]
  documentos_pendentes?: string[]
  status_documentacao?: string
  data_hora?: string
}

export interface UpdateTimelineItemInput {
  etapa?: string
  data_hora?: string
  responsavel_nome?: string
  responsavel_perfil?: UserRole
  observacoes?: string
  motivo?: string
  documentos_recebidos?: string[]
  documentos_pendentes?: string[]
  status_documentacao?: string
  alterado_por: string
  alterado_em?: string
}

export async function listTimelineByProcesso(
  processoId: string,
): Promise<ProcessoTimelineRecord[]> {
  if (!processoId || processoId.startsWith('seed-')) {
    return []
  }

  try {
    const records = await pb.collection('processo_timeline').getFullList<ProcessoTimelineRecord>({
      filter: `processo = "${processoId}"`,
      sort: 'created',
    })
    return records
  } catch (error) {
    console.error('Erro ao buscar timeline do processo:', error)
    return []
  }
}

export async function createTimelineItem(
  input: CreateTimelineInput,
): Promise<ProcessoTimelineRecord> {
  const dataHora = input.data_hora || new Date().toISOString()
  const payload = {
    processo: input.processo,
    etapa: input.etapa,
    data_hora: dataHora,
    responsavel_nome: input.responsavel_nome,
    responsavel_perfil: input.responsavel_perfil,
    observacoes: input.observacoes || '',
    motivo: input.motivo || '',
    documentos_recebidos: input.documentos_recebidos || [],
    documentos_pendentes: input.documentos_pendentes || [],
    status_documentacao: input.status_documentacao || '',
  }

  const record = await pb.collection('processo_timeline').create<ProcessoTimelineRecord>(payload)

  return record
}

export async function updateTimelineItem(
  id: string,
  input: UpdateTimelineItemInput,
): Promise<ProcessoTimelineRecord> {
  const alteradoEm = input.alterado_em || new Date().toISOString()
  const payload: Record<string, unknown> = {
    alterado_por: input.alterado_por,
    alterado_em: alteradoEm,
  }

  if (input.etapa !== undefined) payload.etapa = input.etapa
  if (input.data_hora !== undefined) payload.data_hora = input.data_hora
  if (input.responsavel_nome !== undefined) payload.responsavel_nome = input.responsavel_nome
  if (input.responsavel_perfil !== undefined) payload.responsavel_perfil = input.responsavel_perfil
  if (input.observacoes !== undefined) payload.observacoes = input.observacoes
  if (input.motivo !== undefined) payload.motivo = input.motivo
  if (input.documentos_recebidos !== undefined)
    payload.documentos_recebidos = input.documentos_recebidos
  if (input.documentos_pendentes !== undefined)
    payload.documentos_pendentes = input.documentos_pendentes
  if (input.status_documentacao !== undefined)
    payload.status_documentacao = input.status_documentacao

  const record = await pb
    .collection('processo_timeline')
    .update<ProcessoTimelineRecord>(id, payload)
  return record
}
