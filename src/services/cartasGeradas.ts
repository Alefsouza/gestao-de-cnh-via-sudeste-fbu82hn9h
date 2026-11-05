import pb from '@/lib/pocketbase/client'
import { createTimelineItem } from '@/services/processoTimeline'
import type { UserRole } from '@/lib/types'

/**
 * Registro do evento "Carta criada" na timeline dos processos vinculados.
 *
 * IMPORTANTE: desde a correção das duplicatas (nov/2026), GERAR a carta de um
 * registro já existente em "Cartas Emitidas" NÃO grava nada na coleção `cartas`
 * — o botão "Gerar Carta" apenas renderiza o documento (pré-visualização A4).
 * Novas linhas na coleção `cartas` só nascem no fluxo original de criação da
 * carta (CartaProcessoModal). Aqui fica apenas o registro idempotente na
 * timeline: se o processo já tem o evento "Carta criada" da mesma numeração,
 * nada é criado de novo.
 */

/** Texto canônico do evento — o mesmo gravado pelo hook de criação de cartas. */
export function observacoesCartaCriada(numeroCarta: string): string {
  return `Carta N.º ${numeroCarta || '—'} criada — todos os documentos anexados (5): CNH, Prontuário, Comprovante de Residência, Atestado, Doc. Assinado pela Gestora.`
}

function escaparFiltro(valor: string): string {
  return valor.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Registra o evento "Carta criada" na timeline do processo, UMA única vez por
 * (processo, número da carta). Se o evento já existir (gravado pelo hook na
 * criação da carta ou por uma geração anterior), não duplica.
 */
export async function registrarCartaNaTimeline(
  processoId: string,
  numeroCarta: string,
): Promise<void> {
  const num = (numeroCarta || '').trim()
  try {
    const filtro = num
      ? `processo = "${escaparFiltro(processoId)}" && etapa = "Carta criada" && observacoes ~ "Carta N.º ${escaparFiltro(num)}"`
      : `processo = "${escaparFiltro(processoId)}" && etapa = "Carta criada"`
    const existentes = await pb.collection('processo_timeline').getList(1, 1, { filter: filtro })
    if (existentes.items.length > 0) return

    const record = pb.authStore.record
    await createTimelineItem({
      processo: processoId,
      etapa: 'Carta criada',
      data_hora: new Date().toISOString(),
      responsavel_nome: record?.name || record?.email || 'Emissão de Carta',
      responsavel_perfil: ((record?.role as string) || 'RH') as UserRole,
      observacoes: observacoesCartaCriada(num),
      documentos_recebidos: [
        'CNH',
        'Prontuário',
        'Comprovante de Residência',
        'Atestado',
        'Doc. Assinado pela Gestora',
      ],
      documentos_pendentes: [],
      status_documentacao: 'Documentação completa (5/5)',
    })
  } catch (err) {
    // A timeline é registro auxiliar: uma falha aqui não pode impedir a
    // pré-visualização/impressão da carta — apenas avisa no console.
    console.warn('Erro ao registrar evento "Carta criada" na timeline:', err)
  }
}
