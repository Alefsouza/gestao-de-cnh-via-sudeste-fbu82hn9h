import pb from '@/lib/pocketbase/client'

export interface ProcessoAnexoRecord {
  id: string
  processo?: string
  numero_carta?: string
  matricula?: string
  colaborador?: string
  titulo?: string
  arquivo: string
  tamanho?: number
  criado_por?: string
  criado_por_nome?: string
  created: string
  updated: string
}

export interface UploadAnexoInput {
  processoId?: string
  numero_carta?: string
  matricula?: string
  colaborador?: string
  titulo?: string
  arquivo: File
  criado_por?: string
  criado_por_nome?: string
}

/**
 * Faz upload de um anexo para um colaborador dentro de uma carta/processo.
 */
export async function uploadProcessoAnexo(input: UploadAnexoInput): Promise<ProcessoAnexoRecord> {
  const formData = new FormData()
  if (input.processoId) formData.append('processo', input.processoId)
  if (input.numero_carta) formData.append('numero_carta', input.numero_carta.trim())
  if (input.matricula) formData.append('matricula', input.matricula.trim())
  if (input.colaborador) formData.append('colaborador', input.colaborador.trim())
  if (input.titulo) formData.append('titulo', input.titulo.trim())
  formData.append('arquivo', input.arquivo)
  formData.append('tamanho', String(input.arquivo.size))

  const currentUserId = input.criado_por || pb.authStore.record?.id || ''
  const currentUserName =
    input.criado_por_nome || pb.authStore.record?.name || pb.authStore.record?.email || 'Usuário'

  if (currentUserId) formData.append('criado_por', currentUserId)
  if (currentUserName) formData.append('criado_por_nome', currentUserName)

  const record = await pb.collection('processo_anexos').create<ProcessoAnexoRecord>(formData)
  return record
}

/**
 * Lista anexos por processoId
 */
export async function listAnexosByProcesso(processoId: string): Promise<ProcessoAnexoRecord[]> {
  if (!processoId) return []
  const safeId = processoId.replace(/"/g, '\\"')
  const records = await pb.collection('processo_anexos').getFullList<ProcessoAnexoRecord>({
    filter: `processo = "${safeId}"`,
    sort: '-created',
  })
  return records
}

/**
 * Lista anexos por número da carta
 */
export async function listAnexosByCarta(numeroCarta: string): Promise<ProcessoAnexoRecord[]> {
  const num = (numeroCarta || '').trim()
  if (!num) return []
  const safeNum = num.replace(/"/g, '\\"')
  const records = await pb.collection('processo_anexos').getFullList<ProcessoAnexoRecord>({
    filter: `numero_carta = "${safeNum}"`,
    sort: '-created',
  })
  return records
}

/**
 * Lista anexos por número da carta E matrícula/colaborador
 */
export async function listAnexosByCartaEColaborador(
  numeroCarta: string,
  matricula?: string,
  colaborador?: string,
): Promise<ProcessoAnexoRecord[]> {
  const num = (numeroCarta || '').trim()
  const mat = (matricula || '').trim()
  const colab = (colaborador || '').trim()

  if (!num) return []
  const safeNum = num.replace(/"/g, '\\"')
  let filter = `numero_carta = "${safeNum}"`

  if (mat && colab) {
    const safeMat = mat.replace(/"/g, '\\"')
    const safeColab = colab.replace(/"/g, '\\"')
    filter += ` && (matricula = "${safeMat}" || colaborador = "${safeColab}")`
  } else if (mat) {
    const safeMat = mat.replace(/"/g, '\\"')
    filter += ` && matricula = "${safeMat}"`
  } else if (colab) {
    const safeColab = colab.replace(/"/g, '\\"')
    filter += ` && colaborador = "${safeColab}"`
  }

  const records = await pb.collection('processo_anexos').getFullList<ProcessoAnexoRecord>({
    filter,
    sort: '-created',
  })
  return records
}

/**
 * Exclui um anexo pelo ID
 */
export async function deleteProcessoAnexo(anexoId: string): Promise<void> {
  if (!anexoId) return
  await pb.collection('processo_anexos').delete(anexoId)
}

/**
 * Retorna a URL pública de download/visualização de um arquivo de processo_anexos
 */
export function getProcessoAnexoFileUrl(
  record: ProcessoAnexoRecord,
  filename?: string,
  options?: { download?: boolean; thumb?: string },
): string {
  const file = filename || record.arquivo
  if (!file) return ''
  return pb.files.getURL(record as never, file, options)
}
