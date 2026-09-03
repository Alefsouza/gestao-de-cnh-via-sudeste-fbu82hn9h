import pb from '@/lib/pocketbase/client'

export interface CartaRecord {
  id: string
  numero_carta: string
  colaborador: string
  matricula: string
  funcao_carta: string
  tipo_carta: string
  cnh: string
  prontuario: string
  comprovante_residencia: string
  atestado: string
  doc_assinado_gestora: string
  created: string
  updated: string
}

export interface CreateCartaInput {
  numero_carta: string
  colaborador: string
  matricula: string
  funcao_carta: string
  tipo_carta: string
  cnh: File
  prontuario: File
  comprovante_residencia: File
  atestado: File
  doc_assinado_gestora: File
  garagem?: string
}

/**
 * Cria um novo registro na coleção `cartas` enviando os arquivos via FormData
 * e garante que o processo correspondente em `processos_cadastrais` tenha a
 * situação alterada para "Regular" (seja atualizando o existente ou criando).
 */
export async function createCarta(input: CreateCartaInput): Promise<CartaRecord> {
  const formData = new FormData()
  formData.append('numero_carta', input.numero_carta.trim())
  formData.append('colaborador', input.colaborador.trim())
  formData.append('matricula', input.matricula.trim())
  formData.append('funcao_carta', input.funcao_carta.trim())
  formData.append('tipo_carta', input.tipo_carta.trim())

  formData.append('cnh', input.cnh)
  formData.append('prontuario', input.prontuario)
  formData.append('comprovante_residencia', input.comprovante_residencia)
  formData.append('atestado', input.atestado)
  formData.append('doc_assinado_gestora', input.doc_assinado_gestora)

  const createdRecord = await pb.collection('cartas').create<CartaRecord>(formData)

  // Atualiza ou cria o processo correspondente como "Regular" no frontend também,
  // como redundância segura caso o hook do banco demore ou falhe
  try {
    const mat = input.matricula.trim()
    const colab = input.colaborador.trim()
    const matUnpadded = mat.replace(/^0+/, '')

    const safeMat = mat.replace(/"/g, '\\"')
    const safeColab = colab.replace(/"/g, '\\"')

    let matchingProcessos = await pb.collection('processos_cadastrais').getFullList({
      filter: `matricula = "${safeMat}" || colaborador = "${safeColab}"`,
    })

    if (matchingProcessos.length === 0 && matUnpadded) {
      const safeUnpadded = matUnpadded.replace(/"/g, '\\"')
      matchingProcessos = await pb.collection('processos_cadastrais').getFullList({
        filter: `matricula = "${safeUnpadded}"`,
      })
    }

    if (matchingProcessos.length > 0) {
      for (const proc of matchingProcessos) {
        if (proc.situacao !== 'Regular') {
          await pb.collection('processos_cadastrais').update(proc.id, {
            situacao: 'Regular',
          })
        }
      }
    } else {
      // Nenhum processo cadastral existia para esse colaborador; cria um novo processo com situação "Regular"
      await pb.collection('processos_cadastrais').create({
        matricula: mat,
        colaborador: colab,
        funcao: input.funcao_carta || 'Motorista',
        processo: 'Inclusão',
        etapa: 'Documentos solicitados',
        prazo: new Date().toISOString(),
        situacao: 'Regular',
        garagem: input.garagem || 'CURSINO',
        alerta_trafego: '',
      })
    }
  } catch (err) {
    console.warn('Erro ao atualizar situação em processos_cadastrais pelo frontend:', err)
  }

  return createdRecord
}

/**
 * Retorna a lista de todas as cartas cadastradas, ordenadas pelas mais recentes.
 */
export async function listCartas(): Promise<CartaRecord[]> {
  const records = await pb.collection('cartas').getFullList<CartaRecord>({
    sort: '-created',
  })
  return records
}

/**
 * Retorna a URL completa para visualização ou download do arquivo anexo de uma carta.
 */
export function getCartaFileUrl(
  record: CartaRecord,
  filename: string,
  options?: { download?: boolean; thumb?: string },
): string {
  if (!filename) return ''
  return pb.files.getURL(record as never, filename, options)
}
