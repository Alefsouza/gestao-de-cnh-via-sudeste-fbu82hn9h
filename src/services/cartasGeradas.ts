import pb from '@/lib/pocketbase/client'
import type { CartaModeloId } from '@/lib/cartaModelos'
import { labelTipoCartaParaModelo } from '@/lib/cartaModelos'
import { createTimelineItem } from '@/services/processoTimeline'
import type { ProcessoCadastralRecord, UserRole } from '@/lib/types'
import type { SendOptionsWithSignal } from '@/lib/modalNet'

/**
 * Serviço de persistência das CARTAS GERADAS (modelos de texto → SPTrans).
 * Grava uma linha na coleção `cartas` existente por colaborador, com
 * tipo_carta identificando o modelo usado (Retorno INSS / Afastados INSS / PRAT),
 * de modo que a carta aparece na área "Cartas Emitidas" reutilizando a
 * numeração sequencial já existente (getProximoNumeroCartaSequencial).
 */
export interface PersistirCartaGeradaInput {
  modelo: CartaModeloId
  numeroCarta: string
  colaboradores: Array<{
    employeeId?: string
    nome: string
    registro: string
    funcao: string
    cpf: string
    grupo?: string
    dataAfastamento?: string
  }>
  dataRetorno?: string
  prefixoVeiculo?: string
  dataSinistro?: string
}

/** Opções de envio do PocketBase (inclui signal para abort de timeout). */
type CartaCreateOptions = SendOptionsWithSignal

export async function persistirCartaGerada(
  input: PersistirCartaGeradaInput,
  options: { sendOptions?: CartaCreateOptions } = {},
): Promise<string> {
  const tipoCarta = labelTipoCartaParaModelo(input.modelo)
  const numeroCarta = input.numeroCarta.trim()

  // Campos contextuais para rastreio (retornados para uso opcional pela chamada)
  const detalheExtra = [
    input.modelo === 'prat' && input.prefixoVeiculo
      ? `Veículo prefixo ${input.prefixoVeiculo}`
      : '',
    input.modelo === 'prat' && input.dataSinistro ? `Sinistro em ${input.dataSinistro}` : '',
    input.modelo === 'inss_retorno' && input.dataRetorno ? `Retorno em ${input.dataRetorno}` : '',
    input.modelo === 'inss_afastados'
      ? `Afastamento em ${input.colaboradores.map((c) => c.dataAfastamento || '—').join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ')

  for (const colab of input.colaboradores) {
    await pb.collection('cartas').create(
      {
        numero_carta: numeroCarta,
        colaborador: colab.nome,
        matricula: colab.registro,
        funcao_carta: colab.funcao || '',
        tipo_carta: tipoCarta,
      },
      options.sendOptions,
    )
  }
  return detalheExtra
}

/** Registra um evento na timeline de um processo (usado pela tela de processos). */
export async function registrarCartaNaTimeline(
  processo: Pick<ProcessoCadastralRecord, 'id' | 'matricula' | 'colaborador'>,
  tipoCarta: string,
  numeroCarta: string,
  detalhe?: string,
): Promise<void> {
  try {
    await createTimelineItem({
      processo: processo.id,
      etapa: 'Carta criada',
      data_hora: new Date().toISOString(),
      responsavel_nome: pb.authStore.record?.name || pb.authStore.record?.email || 'Analista RH',
      responsavel_perfil: ((pb.authStore.record?.role as string) || 'RH') as UserRole,
      observacoes: `Carta ${tipoCarta} N.º ${numeroCarta} gerada e enviada à SPTrans${detalhe ? ` (${detalhe})` : ''}`,
    })
  } catch (err) {
    console.warn('Erro ao registrar timeline da carta gerada:', err)
  }
}
