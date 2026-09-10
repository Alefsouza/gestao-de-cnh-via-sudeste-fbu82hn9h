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

import { createTimelineItem } from '@/services/processoTimeline'
import type { UserRole } from '@/lib/types'

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
  responsavel_nome?: string
  responsavel_perfil?: UserRole
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

    const respNome =
      input.responsavel_nome ||
      pb.authStore.record?.name ||
      pb.authStore.record?.email ||
      'Analista RH'
    const respPerfil: UserRole =
      input.responsavel_perfil ||
      ((pb.authStore.record?.role as UserRole) === 'Admin' ? 'Admin' : 'RH')

    const anexosDocumentos = [
      'CNH',
      'Prontuário',
      'Comprovante de Residência',
      'Atestado',
      'Doc. Assinado pela Gestora',
    ]

    const baseTimestamp = Date.now()

    if (matchingProcessos.length > 0) {
      for (const proc of matchingProcessos) {
        if (proc.situacao !== 'Regular') {
          await pb.collection('processos_cadastrais').update(proc.id, {
            situacao: 'Regular',
          })
        }

        // Verificação de duplicidade como proteção extra antes de gravar o evento Carta criada no processo existente:
        // checa se já existe item na processo_timeline com etapa "Carta criada" e o mesmo número de carta
        try {
          const numCarta = input.numero_carta.trim()
          const safeProcId = proc.id.replace(/"/g, '\\"')
          const safeNumCarta = numCarta.replace(/"/g, '\\"')

          const jaExiste = await pb.collection('processo_timeline').getFullList({
            filter: `processo = "${safeProcId}" && etapa = "Carta criada" && observacoes ~ "${safeNumCarta}"`,
            batch: 1,
          })

          if (jaExiste.length === 0) {
            await createTimelineItem({
              processo: proc.id,
              etapa: 'Carta criada',
              responsavel_nome: respNome,
              responsavel_perfil: respPerfil,
              observacoes: `Carta N.º ${numCarta} criada — todos os documentos anexados (5): CNH, Prontuário, Comprovante de Residência, Atestado, Doc. Assinado pela Gestora.`,
              motivo: '',
              documentos_recebidos: anexosDocumentos,
              documentos_pendentes: [],
              status_documentacao: 'Documentação completa (5/5)',
              data_hora: new Date(baseTimestamp).toISOString(),
            })
          }
        } catch (timelineErr) {
          console.warn(
            'Erro ao registrar evento de carta criada na timeline do processo existente:',
            timelineErr,
          )
        }
      }
    } else {
      // Nenhum processo cadastral existia para esse colaborador; cria um novo processo com situação "Regular"
      const novoProc = await pb.collection('processos_cadastrais').create({
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

      // 1. Processo recém-criado nasce com "Processo criado"
      try {
        await createTimelineItem({
          processo: novoProc.id,
          etapa: 'Processo criado',
          responsavel_nome: respNome,
          responsavel_perfil: respPerfil,
          observacoes: `Processo criado a partir da Carta N.º ${input.numero_carta}`,
          motivo: '',
          data_hora: new Date(baseTimestamp - 2000).toISOString(),
        })
      } catch (timelineErr) {
        console.warn(
          'Erro ao registrar primeiro item na timeline do novo processo gerado por carta:',
          timelineErr,
        )
      }

      // 2. Registra o evento "Carta criada" posicionado ACIMA de "Processo criado" (com verificação de duplicidade)
      try {
        const numCarta = input.numero_carta.trim()
        const safeProcId = novoProc.id.replace(/"/g, '\\"')
        const safeNumCarta = numCarta.replace(/"/g, '\\"')

        const jaExiste = await pb.collection('processo_timeline').getFullList({
          filter: `processo = "${safeProcId}" && etapa = "Carta criada" && observacoes ~ "${safeNumCarta}"`,
          batch: 1,
        })

        if (jaExiste.length === 0) {
          await createTimelineItem({
            processo: novoProc.id,
            etapa: 'Carta criada',
            responsavel_nome: respNome,
            responsavel_perfil: respPerfil,
            observacoes: `Carta N.º ${numCarta} criada — todos os documentos anexados (5): CNH, Prontuário, Comprovante de Residência, Atestado, Doc. Assinado pela Gestora.`,
            motivo: '',
            documentos_recebidos: anexosDocumentos,
            documentos_pendentes: [],
            status_documentacao: 'Documentação completa (5/5)',
            data_hora: new Date(baseTimestamp).toISOString(),
          })
        }
      } catch (timelineErr) {
        console.warn(
          'Erro ao registrar evento de carta criada na timeline do novo processo:',
          timelineErr,
        )
      }
    }
  } catch (err) {
    console.warn('Erro ao atualizar situação em processos_cadastrais pelo frontend:', err)
  }

  return createdRecord
}

/**
 * Restaura a situação do processo cadastral correspondente para a situação
 * anterior à emissão da carta, com base na marcação de alerta_trafego:
 * - Se tinha a marcação de ciência "Bloquear foto" (alerta_trafego === 'bloquear_foto') -> "Foto Bloqueada"
 * - Se tinha "Impossibilitar de Trabalhar" (alerta_trafego === 'impossibilitado_trabalhar') -> "Impossibilitado de Trabalhar"
 * - Caso contrário -> "Pendente"
 *
 * Se não encontrar o processo, ignora silenciosamente sem quebrar.
 */
export async function restaurarProcessoAnterior(
  matricula?: string,
  colaborador?: string,
): Promise<void> {
  const mat = (matricula || '').trim()
  const colab = (colaborador || '').trim()
  if (!mat && !colab) return

  try {
    const matUnpadded = mat.replace(/^0+/, '')
    const safeMat = mat.replace(/"/g, '\\"')
    const safeColab = colab.replace(/"/g, '\\"')

    let matchingProcessos = await pb.collection('processos_cadastrais').getFullList({
      filter:
        safeMat && safeColab
          ? `matricula = "${safeMat}" || colaborador = "${safeColab}"`
          : safeMat
            ? `matricula = "${safeMat}"`
            : `colaborador = "${safeColab}"`,
    })

    if (matchingProcessos.length === 0 && matUnpadded) {
      const safeUnpadded = matUnpadded.replace(/"/g, '\\"')
      matchingProcessos = await pb.collection('processos_cadastrais').getFullList({
        filter: `matricula = "${safeUnpadded}"`,
      })
    }

    if (matchingProcessos.length > 0) {
      for (const proc of matchingProcessos) {
        let novaSituacao: 'Foto Bloqueada' | 'Impossibilitado de Trabalhar' | 'Pendente' =
          'Pendente'
        const alerta = (proc.alerta_trafego || '').trim().toLowerCase()
        if (alerta === 'bloquear_foto') {
          novaSituacao = 'Foto Bloqueada'
        } else if (alerta === 'impossibilitado_trabalhar') {
          novaSituacao = 'Impossibilitado de Trabalhar'
        }

        await pb.collection('processos_cadastrais').update(proc.id, {
          situacao: novaSituacao,
        })
      }
    }
  } catch (err) {
    // Ignora silenciosamente sem quebrar a exclusão da carta
    console.warn('Erro ao restaurar situação anterior em processos_cadastrais:', err)
  }
}

/**
 * Exclui um colaborador específico de uma carta (pelo ID do registro na coleção cartas)
 * e restaura a situação do processo dele em processos_cadastrais.
 */
export async function deleteColaboradorCarta(cartaRecord: CartaRecord): Promise<void> {
  // 1. Exclui o registro da coleção cartas
  await pb.collection('cartas').delete(cartaRecord.id)

  // 2. Restaura o processo correspondente dele
  await restaurarProcessoAnterior(cartaRecord.matricula, cartaRecord.colaborador)
}

/**
 * Exclui a carta inteira: todos os registros com aquele numero_carta
 * e restaura a situação de cada processo vinculado.
 */
export async function deleteCartaCompleta(numeroCarta: string): Promise<void> {
  const num = numeroCarta.trim()
  if (!num) return

  const safeNum = num.replace(/"/g, '\\"')
  const registros = await pb.collection('cartas').getFullList<CartaRecord>({
    filter: `numero_carta = "${safeNum}"`,
  })

  // Exclui cada registro e restaura o processo
  for (const reg of registros) {
    try {
      await pb.collection('cartas').delete(reg.id)
    } catch (err) {
      console.warn(`Erro ao excluir registro ${reg.id} da carta ${num}:`, err)
    }

    await restaurarProcessoAnterior(reg.matricula, reg.colaborador)
  }
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
