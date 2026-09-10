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
