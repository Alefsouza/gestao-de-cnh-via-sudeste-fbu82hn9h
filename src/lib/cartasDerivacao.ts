/**
 * Derivação dos dados de uma CARTA JÁ REGISTRADA (coleção `cartas`) para
 * gerar o documento oficial (modelos em cartaModelos.ts) SEM tela de escolha:
 * o Tipo da carta, o Número e os colaboradores vêm da própria carta; os dados
 * pessoais (nome, função, CPF, grupo) vêm SEMPRE do cadastro real (employees),
 * nunca dos exemplos dos modelos.
 */
import type { CartaModeloId, CartaColaboradorDados } from '@/lib/cartaModelos'
import { labelTipoCartaParaModelo } from '@/lib/cartaModelos'
import type { CartaRecord } from '@/services/cartas'
import type { Employee, ProcessoCadastralRecord } from '@/lib/types'

/** Comparação de nomes tolerante (sem acentos, minúsculo). */
export function compararNomes(a?: string | null, b?: string | null): boolean {
  const norm = (s?: string | null) =>
    (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

/** Matrículas equivalentes: "01234" === "1234". */
export function mesmaMatricula(a?: string | null, b?: string | null): boolean {
  const na = (a || '').trim()
  const nb = (b || '').trim()
  if (!na || !nb) return false
  return na === nb || na.replace(/^0+/, '') === nb.replace(/^0+/, '')
}

/**
 * Mapeia o tipo_carta gravado na coleção `cartas` para o id do modelo oficial
 * usado na geração do documento. Tipos que não correspondem a um dos 3 modelos
 * oficiais (Inclusão, Mudança de Função, Exclusão…) retornam null — para eles
 * a geração automática não se aplica.
 */
export function modeloIdParaTipoCarta(tipoCarta?: string | null): CartaModeloId | null {
  const t = (tipoCarta || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

  if (!t) return null

  if (t.includes('retorno')) return 'inss_retorno'
  if (t.includes('afast')) return 'inss_afastados'
  if (t === 'prat' || t.includes('prat') || t.includes('acidente')) return 'prat'
  return null
}

export interface CartaDerivadaInput {
  /** Linha da coleção `cartas` selecionada em Cartas Emitidas. */
  carta: CartaRecord
  /** Todas as linhas da coleção `cartas` com o mesmo numero_carta. */
  linhasDaCarta: CartaRecord[]
  /** Cadastro real de colaboradores (fonte dos dados pessoais). */
  employees: Employee[]
  /** Processos da tela — fonte de data de afastamento/retorno. */
  processos?: ProcessoCadastralRecord[]
}

export interface CartaDerivada {
  modelo: CartaModeloId
  numeroCarta: string
  colaboradores: CartaColaboradorDados[]
  dataRetorno?: string
  prefixoVeiculo?: string
  dataSinistro?: string
  /** Modelo identificado a partir do tipo gravado (sempre true na prática). */
  ok: boolean
  /** Avisos para o usuário quando faltar dado não derivável. */
  avisos: string[]
}

function procurarEmployee(
  matricula: string,
  nome: string,
  employees: Employee[],
): Employee | undefined {
  const porMatricula = employees.find((e) => mesmaMatricula(e.registro || e.chapa, matricula))
  if (porMatricula) return porMatricula
  return employees.find((e) => compararNomes(e.name, nome))
}

function dataAfastamentoDe(
  matricula: string,
  nome: string,
  employees: Employee[],
  processos?: ProcessoCadastralRecord[],
): string {
  const emp = procurarEmployee(matricula, nome, employees)
  if (emp) {
    const d = emp.inicio_afastamento || emp.data_afastamento || ''
    if (d) return d
  }
  const proc = processos?.find(
    (p) => mesmaMatricula(p.matricula, matricula) || compararNomes(p.colaborador, nome),
  )
  return proc?.data_afastamento || ''
}

function dataRetornoDe(
  matricula: string,
  nome: string,
  employees: Employee[],
  processos?: ProcessoCadastralRecord[],
): string {
  const emp = procurarEmployee(matricula, nome, employees)
  if (emp) {
    const d = emp.data_retorno_afastamento || emp.previsao_retorno || ''
    if (d) return d
  }
  const proc = processos?.find(
    (p) => mesmaMatricula(p.matricula, matricula) || compararNomes(p.colaborador, nome),
  )
  return proc?.data_retorno_afastamento || ''
}

/**
 * Extrai "prefixo" e "data do sinistro" de textos livres relacionados ao
 * processo PRAT (observações do processo e eventos da timeline), sem exigir
 * nenhuma tela de escolha quando esses dados já existem.
 */
function extrairPratDeTextos(
  matricula: string,
  nome: string,
  processos?: ProcessoCadastralRecord[],
): { prefixo?: string; dataSinistro?: string } {
  if (!processos?.length) return {}
  const proc = processos.find(
    (p) => mesmaMatricula(p.matricula, matricula) || compararNomes(p.colaborador, nome),
  )
  if (!proc) return {}

  const textos: string[] = []
  if (proc.observacoes) textos.push(proc.observacoes)
  const tl = (proc as unknown as { timeline?: Array<{ observacoes?: string }> }).timeline
  if (Array.isArray(tl)) {
    for (const item of tl) if (item?.observacoes) textos.push(item.observacoes)
  }

  for (const texto of textos) {
    if (!texto) continue
    // "prefixo 51042" / "prefixo: 51042" / "veículo de prefixo 51042"
    const mPrefixo = texto.match(
      /prefixo(?:\s+(?:do\s+ve[íi]culo))?\s*[:\-–]?\s*([A-Za-z0-9]{2,10})/i,
    )
    // data em DD/MM/AAAA ou AAAA-MM-DD
    const mData =
      texto.match(/(\d{2})\/(\d{2})\/(\d{4})/) ||
      texto.match(/sinistro[^\d]{0,20}(\d{4})-(\d{2})-(\d{2})/)
    if (mPrefixo || mData) {
      let dataSinistro: string | undefined
      if (mData) {
        dataSinistro =
          mData.length === 4 && mData[0].includes('/')
            ? `${mData[3]}-${mData[2]}-${mData[1]}`
            : mData[0]
      }
      return {
        prefixo: mPrefixo?.[1],
        dataSinistro,
      }
    }
  }
  return {}
}

export function derivarDadosDaCarta(input: CartaDerivadaInput): CartaDerivada {
  const { carta, linhasDaCarta, employees, processos } = input
  const numeroCarta = (carta.numero_carta || '').trim()
  const modelo = modeloIdParaTipoCarta(carta.tipo_carta) ?? 'inss_afastados'
  const avisos: string[] = []

  const colaboradores: CartaColaboradorDados[] = linhasDaCarta.map((linha) => {
    const emp = procurarEmployee(linha.matricula || '', linha.colaborador || '', employees)
    return {
      employeeId: emp?.id,
      nome: emp?.name || linha.colaborador || '',
      registro: emp?.registro || emp?.chapa || linha.matricula || '',
      funcao: emp?.funcao || linha.funcao_carta || '',
      cpf: emp?.cpf || '',
      grupo: emp?.filial || '',
      dataAfastamento:
        modelo === 'inss_afastados'
          ? dataAfastamentoDe(linha.matricula || '', linha.colaborador || '', employees, processos)
          : undefined,
    }
  })

  let dataRetorno: string | undefined
  let prefixoVeiculo: string | undefined
  let dataSinistro: string | undefined

  if (modelo === 'inss_retorno') {
    // Retorno usa a data do PRIMEIRO colaborador da carta (comum a todos).
    const first = linhasDaCarta[0]
    dataRetorno =
      dataRetornoDe(first?.matricula || '', first?.colaborador || '', employees, processos) ||
      undefined
    if (!dataRetorno) {
      avisos.push(
        'Data de retorno não encontrada no cadastro — preencha na carta antes de imprimir.',
      )
    }
  }

  if (modelo === 'inss_afastados') {
    if (colaboradores.some((c) => !c.dataAfastamento)) {
      avisos.push('Data de afastamento de algum colaborador não encontrada no cadastro.')
    }
  }

  if (modelo === 'prat') {
    const linha = linhasDaCarta[0]
    const extraido = extrairPratDeTextos(
      linha?.matricula || '',
      linha?.colaborador || '',
      processos,
    )
    prefixoVeiculo = extraido.prefixo
    dataSinistro = extraido.dataSinistro
    if (!prefixoVeiculo || !dataSinistro) {
      avisos.push('Prefixo do veículo e/ou data do sinistro não encontrados no processo.')
    }
  }

  return {
    modelo,
    numeroCarta,
    colaboradores,
    dataRetorno,
    prefixoVeiculo,
    dataSinistro,
    ok: colaboradores.length > 0 && !!numeroCarta,
    avisos,
  }
}

/** Rótulo do tipo de carta gravado — usado para validar a conversão. */
export function tipoCartaConhecido(tipoCarta?: string | null): boolean {
  return (
    modeloIdParaTipoCarta(tipoCarta) !== null ||
    labelTipoCartaParaModelo('prat') === (tipoCarta || '').trim()
  )
}
