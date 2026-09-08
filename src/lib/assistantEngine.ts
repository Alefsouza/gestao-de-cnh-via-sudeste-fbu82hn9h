import * as XLSX from 'xlsx'
import { daysUntil, formatCnh, formatDate } from '@/lib/format'
import { comparable, isCnhVencida as isCnhVencidaLib, parseFlexibleDate } from '@/lib/normalize'
import type { Employee } from '@/lib/types'

export interface AssistantAnswer {
  content: string
  exportableRows?: Employee[]
  exportFileName?: string
  exportSheetName?: string
  autoDownload?: boolean
  matchedEmployee?: Employee
  extractedContext?: ConversationContext
}

export interface ConversationHistoryMessage {
  role: 'user' | 'assistant'
  content: string
  exportableRows?: Employee[]
  matchedEmployee?: Employee
}

export interface ConversationContext {
  funcao?: string | null
  funcoesList?: string[]
  filial?: 'CURSINO' | 'SAPOPEMBA' | 'ITAQUERA' | 'GUAIANASES' | null
  situacao?: 'Ativo' | 'Afastado' | 'Desligado' | null
  dateFilter?: DateFilter | null
  cnhFilter?: 'com_cnh' | 'sem_cnh' | null
  futureFilter?: boolean | null
  lastTopic?:
    | 'cnh_vencida'
    | 'cnh_geral'
    | 'cnh_futura'
    | 'afastados'
    | 'funcao'
    | 'garagem'
    | 'geral'
  lastExportableRows?: Employee[]
}

const MAIN_COMPANY = 'Via Sudeste Transportes'

const MONTH_NAMES_MAP: Record<string, number> = {
  janeiro: 1,
  jan: 1,
  fevereiro: 2,
  fev: 2,
  marco: 3,
  março: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  maio: 5,
  mai: 5,
  junho: 6,
  jun: 6,
  julho: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  setembro: 9,
  set: 9,
  outubro: 10,
  out: 10,
  novembro: 11,
  nov: 11,
  dezembro: 12,
  dez: 12,
}

export interface DateFilter {
  type: 'month' | 'year' | 'range' | 'until' | 'since' | 'exact'
  start: Date
  end: Date
  description: string
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/** Cria uma data UTC segura para início ou fim de dia */
function makeUtcDate(year: number, monthIndex: number, day: number, endOfDay = false): Date {
  if (endOfDay) {
    return new Date(Date.UTC(year, monthIndex, day, 23, 59, 59, 999))
  }
  return new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0))
}

function daysInMonth(year: number, month1To12: number): number {
  return new Date(year, month1To12, 0).getDate()
}

/**
 * Extrai filtros de data/período de uma pergunta em linguagem natural em pt-BR.
 */
export function extractDateFilter(rawQuestion: string, now = new Date()): DateFilter | null {
  const q = normalizeText(rawQuestion)

  // 1. Período "entre X e Y"
  const rangeMatch = q.match(/entre\s+([a-z0-9/\s-]+?)\s+e\s+([a-z0-9/\s-]+?)(?=$|\s|,|\?|\.)/)
  if (rangeMatch) {
    const startFilter = extractSingleDateOrMonth(rangeMatch[1], now)
    const endFilter = extractSingleDateOrMonth(rangeMatch[2], now)
    if (startFilter && endFilter) {
      return {
        type: 'range',
        start: startFilter.start,
        end: endFilter.end,
        description: `entre ${startFilter.description} e ${endFilter.description}`,
      }
    }
  }

  // 2. "ate X" / "vencida ate X" / "vencendo ate X" / "limite ate X"
  const untilMatch = q.match(
    /(?:ate|ateh|antes de)\s+([a-z0-9/\s-]+?)(?=$|\s*(?:da|do|na|no|em|com|para|\?|\.))/i,
  )
  if (untilMatch) {
    const target = extractSingleDateOrMonth(untilMatch[1], now)
    if (target) {
      return {
        type: 'until',
        start: makeUtcDate(1970, 0, 1),
        end: target.end,
        description: `até ${target.description}`,
      }
    }
  }

  // 3. "desde X" / "a partir de X"
  const sinceMatch = q.match(
    /(?:desde|a partir de)\s+([a-z0-9/\s-]+?)(?=$|\s*(?:da|do|na|no|em|com|para|\?|\.))/i,
  )
  if (sinceMatch) {
    const target = extractSingleDateOrMonth(sinceMatch[1], now)
    if (target) {
      return {
        type: 'since',
        start: target.start,
        end: makeUtcDate(2099, 11, 31, true),
        description: `a partir de ${target.description}`,
      }
    }
  }

  // 4. "neste mes" / "mes atual"
  if (q.includes('neste mes') || q.includes('este mes') || q.includes('mes atual')) {
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const lastDay = daysInMonth(y, m)
    return {
      type: 'month',
      start: makeUtcDate(y, m - 1, 1),
      end: makeUtcDate(y, m - 1, lastDay, true),
      description: `${String(m).padStart(2, '0')}/${y}`,
    }
  }

  // 5. "proximo mes" / "mes que vem"
  if (q.includes('proximo mes') || q.includes('mes que vem')) {
    const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const y = nextDate.getFullYear()
    const m = nextDate.getMonth() + 1
    const lastDay = daysInMonth(y, m)
    return {
      type: 'month',
      start: makeUtcDate(y, m - 1, 1),
      end: makeUtcDate(y, m - 1, lastDay, true),
      description: `${String(m).padStart(2, '0')}/${y}`,
    }
  }

  // 6. "neste ano" / "ano atual"
  if (q.includes('neste ano') || q.includes('este ano') || q.includes('ano atual')) {
    const y = now.getFullYear()
    return {
      type: 'year',
      start: makeUtcDate(y, 0, 1),
      end: makeUtcDate(y, 11, 31, true),
      description: `ano de ${y}`,
    }
  }

  // 7. "proximo ano" / "ano que vem"
  if (q.includes('proximo ano') || q.includes('ano que vem')) {
    const y = now.getFullYear() + 1
    return {
      type: 'year',
      start: makeUtcDate(y, 0, 1),
      end: makeUtcDate(y, 11, 31, true),
      description: `ano de ${y}`,
    }
  }

  // 8. Padrão genérico de mês/ano, mês isolado ou ano isolado
  return extractSingleDateOrMonth(q, now)
}

function extractSingleDateOrMonth(text: string, now = new Date()): DateFilter | null {
  const clean = text.trim()

  // Data completa dd/mm/aaaa ou dd-mm-aaaa
  const fullDateMatch = clean.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/)
  if (fullDateMatch) {
    const d = parseInt(fullDateMatch[1], 10)
    const m = parseInt(fullDateMatch[2], 10)
    const y = parseInt(fullDateMatch[3], 10)
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return {
        type: 'exact',
        start: makeUtcDate(y, m - 1, d),
        end: makeUtcDate(y, m - 1, d, true),
        description: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
      }
    }
  }

  // Padrão mm/aaaa ou mm-aaaa (ex.: "09/2026", "9/2026", "09-2026")
  const numMonthYear = clean.match(/\b(\d{1,2})[/-](\d{4})\b/)
  if (numMonthYear) {
    const m = parseInt(numMonthYear[1], 10)
    const y = parseInt(numMonthYear[2], 10)
    if (m >= 1 && m <= 12 && y >= 1990 && y <= 2099) {
      const lastDay = daysInMonth(y, m)
      return {
        type: 'month',
        start: makeUtcDate(y, m - 1, 1),
        end: makeUtcDate(y, m - 1, lastDay, true),
        description: `${String(m).padStart(2, '0')}/${y}`,
      }
    }
  }

  // Padrão "09 de 2026" ou "9 de 2026"
  const numDeYear = clean.match(/\b(\d{1,2})\s+de\s+(\d{4})\b/)
  if (numDeYear) {
    const m = parseInt(numDeYear[1], 10)
    const y = parseInt(numDeYear[2], 10)
    if (m >= 1 && m <= 12 && y >= 1990 && y <= 2099) {
      const lastDay = daysInMonth(y, m)
      return {
        type: 'month',
        start: makeUtcDate(y, m - 1, 1),
        end: makeUtcDate(y, m - 1, lastDay, true),
        description: `${String(m).padStart(2, '0')}/${y}`,
      }
    }
  }

  // Padrão mês por extenso + ano: "setembro de 2026", "set/2026", "set 2026"
  const monthNameMatch = clean.match(
    /\b(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s*(?:de|\/|-|\s)?\s*(\d{4})\b/,
  )
  if (monthNameMatch) {
    const monthKey = normalizeText(monthNameMatch[1])
    const m = MONTH_NAMES_MAP[monthKey]
    const y = parseInt(monthNameMatch[2], 10)
    if (m && y >= 1990 && y <= 2099) {
      const lastDay = daysInMonth(y, m)
      return {
        type: 'month',
        start: makeUtcDate(y, m - 1, 1),
        end: makeUtcDate(y, m - 1, lastDay, true),
        description: `${String(m).padStart(2, '0')}/${y}`,
      }
    }
  }

  // Padrão mês isolado com preposição ou menção a mês: "no mes 09", "mes 9", "no mes de setembro"
  // Ex.: "e os vencidos no mes 09?", "e no mes 10?", "no mes de outubro"
  const isolatedMonthMatch = clean.match(
    /(?:no\s+mes\s+(?:de\s+)?|mes\s+|para\s+o\s+mes\s+(?:de\s+)?|em\s+)(0?[1-9]|1[0-2]|janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/,
  )
  if (isolatedMonthMatch) {
    const rawVal = isolatedMonthMatch[1]
    let m: number | undefined
    if (/^\d{1,2}$/.test(rawVal)) {
      m = parseInt(rawVal, 10)
    } else {
      m = MONTH_NAMES_MAP[normalizeText(rawVal)]
    }
    if (m && m >= 1 && m <= 12) {
      const y = now.getFullYear()
      const lastDay = daysInMonth(y, m)
      return {
        type: 'month',
        start: makeUtcDate(y, m - 1, 1),
        end: makeUtcDate(y, m - 1, lastDay, true),
        description: `${String(m).padStart(2, '0')}/${y}`,
      }
    }
  }

  // Padrão "ano de 2026" ou "em 2026" ou "para 2026" ou "2026" isolado
  const yearMatch = clean.match(/(?:ano(?:\s+de)?|em|no ano de)\s+(\d{4})\b|\b(20[2-3]\d)\b/)
  if (yearMatch) {
    const yStr = yearMatch[1] || yearMatch[2]
    const y = parseInt(yStr, 10)
    if (y >= 1990 && y <= 2099) {
      return {
        type: 'year',
        start: makeUtcDate(y, 0, 1),
        end: makeUtcDate(y, 11, 31, true),
        description: `ano de ${y}`,
      }
    }
  }

  return null
}

/** Verifica se a data da CNH cai dentro do filtro de período */
export function matchesDateFilter(
  cnhDateStr: string | null | undefined,
  filter: DateFilter,
): boolean {
  if (!cnhDateStr) return false
  const date = new Date(cnhDateStr)
  if (Number.isNaN(date.getTime())) return false
  const time = date.getTime()
  return time >= filter.start.getTime() && time <= filter.end.getTime()
}

/** Detecta filial/garagem na pergunta */
export function extractFilial(
  question: string,
): 'CURSINO' | 'SAPOPEMBA' | 'ITAQUERA' | 'GUAIANASES' | null {
  const q = normalizeText(question)
  if (q.includes('cursino')) return 'CURSINO'
  if (q.includes('sapopemba')) return 'SAPOPEMBA'
  if (q.includes('itaquera')) return 'ITAQUERA'
  if (q.includes('guaianases') || q.includes('guaianazes')) return 'GUAIANASES'
  return null
}

/** Detecta função primária na pergunta */
export function extractFuncao(question: string): string | null {
  const q = normalizeText(question)
  if (q.includes('motorist')) return 'Motorista'
  if (q.includes('fiscal')) return 'Fiscal'
  if (q.includes('cobrador')) return 'Cobrador'
  if (q.includes('auxiliar') || q.includes('administrativ')) return 'Auxiliar Administrativo'
  return null
}

/**
 * Detecta múltiplas funções ou adições explícitas de funções na pergunta.
 * Ex.: "leve em consideração também os fiscais I, fiscal II, e fiscal III e aux. de fiscal"
 */
export function extractFuncoesList(question: string): string[] {
  const q = normalizeText(question)
  const funcoes = new Set<string>()

  // Casos específicos de fiscais
  if (q.includes('fiscal i') && !q.includes('fiscal ii') && !q.includes('fiscal iii')) {
    funcoes.add('Fiscal I')
  }
  if (q.includes('fiscal ii') || q.includes('fiscais ii')) {
    funcoes.add('Fiscal II')
  }
  if (q.includes('fiscal iii') || q.includes('fiscais iii')) {
    funcoes.add('Fiscal III')
  }
  if (q.includes('fiscal 1') || q.includes('fiscais 1')) {
    funcoes.add('Fiscal I')
  }
  if (q.includes('fiscal 2') || q.includes('fiscais 2')) {
    funcoes.add('Fiscal II')
  }
  if (q.includes('fiscal 3') || q.includes('fiscais 3')) {
    funcoes.add('Fiscal III')
  }
  if (
    q.includes('aux. de fiscal') ||
    q.includes('aux de fiscal') ||
    q.includes('auxiliar de fiscal') ||
    q.includes('aux. fiscal')
  ) {
    funcoes.add('Aux. de Fiscal')
  }
  if (
    q.includes('fiscal de viajem') ||
    q.includes('fiscal de viagem') ||
    q.includes('fiscais de viajem') ||
    q.includes('fiscais de viagem')
  ) {
    funcoes.add('Fiscal de Viajem')
  }

  // Se mencionou "fiscais" ou "fiscal" de forma genérica/radical
  if (
    q.includes('fiscal') &&
    funcoes.size === 0 &&
    !q.includes('auxiliar administrativo') &&
    !q.includes('motorist')
  ) {
    funcoes.add('Fiscal')
  }

  // Motoristas
  if (q.includes('motorist')) {
    funcoes.add('Motorista')
  }
  // Cobradores
  if (q.includes('cobrador')) {
    funcoes.add('Cobrador')
  }
  // Auxiliar Administrativo
  if (q.includes('administrativ')) {
    funcoes.add('Auxiliar Administrativo')
  }

  return Array.from(funcoes)
}

/** Verifica se a função do funcionário casa com a lista ou radical desejado */
export function matchesFuncoes(empFuncao: string | undefined | null, targets: string[]): boolean {
  if (!empFuncao) return false
  const normEmp = normalizeText(empFuncao)
  for (const t of targets) {
    const normT = normalizeText(t)
    // Se o target for "fiscal", casa com qualquer família fiscal ("Fiscal de Viajem", "Fiscal I", "Fiscal II", "Fiscal III", "Aux. De Fiscal")
    if (normT === 'fiscal') {
      if (normEmp.includes('fiscal')) return true
    } else if (normT === 'aux. de fiscal' || normT === 'aux de fiscal') {
      if (normEmp.includes('fiscal') && normEmp.includes('aux')) return true
    } else {
      if (normEmp.includes(normT)) return true
    }
  }
  return false
}

/** Detecta se o usuário está pedindo para incluir/adicionar variações ou considerar também */
export function isAdditiveQuery(question: string): boolean {
  const q = normalizeText(question)
  return (
    q.includes('leve em consideracao') ||
    q.includes('leve em conta') ||
    q.includes('tambem') ||
    q.includes('inclua') ||
    q.includes('incluir') ||
    q.includes('adicione') ||
    q.includes('adicionar') ||
    q.includes('considere')
  )
}

/** Detecta intenção de CNH futura / a vencer futuramente / próximos meses / anos */
export function isFutureVencimentoQuery(question: string): boolean {
  const q = normalizeText(question)
  return (
    q.includes('futuramente') ||
    q.includes('futura') ||
    q.includes('futuras') ||
    q.includes('futuro') ||
    q.includes('futuros') ||
    q.includes('vao vencer') ||
    q.includes('vai vencer') ||
    q.includes('a vencer') ||
    q.includes('proximos meses') ||
    q.includes('proximos anos') ||
    q.includes('proximos meses/anos') ||
    q.includes('meses/anos') ||
    q.includes('meses futuros') ||
    q.includes('anos futuros')
  )
}

/** Detecta filtro explícito de "tem CNH" vs "não tem CNH" */
export function extractCnhPresenceFilter(question: string): 'com_cnh' | 'sem_cnh' | null {
  const q = normalizeText(question)

  // Negativa primeiro
  if (
    q.includes('nao tem cnh') ||
    q.includes('nao possuem cnh') ||
    q.includes('sem cnh') ||
    q.includes('esses nao tem cnh') ||
    q.includes('esses nao possuem cnh') ||
    q.includes('aqueles sem cnh') ||
    q.includes('os que nao tem') ||
    q.includes('somente os que nao tem')
  ) {
    return 'sem_cnh'
  }

  // Positiva
  if (
    q.includes('os que tem cnh') ||
    q.includes('somente os que tem cnh') ||
    q.includes('so os que tem cnh') ||
    q.includes('apenas os que tem cnh') ||
    q.includes('com cnh') ||
    q.includes('que possuem cnh') ||
    q.includes('somente com cnh') ||
    q.includes('apenas com cnh') ||
    q.includes('habilitados') ||
    q.includes('tem cnh')
  ) {
    return 'com_cnh'
  }

  return null
}

/** Detecta situação funcional (Ativo/Afastado/Desligado) */
export function extractSituacao(question: string): 'Ativo' | 'Afastado' | 'Desligado' | null {
  const q = normalizeText(question)
  if (q.includes('afastad')) return 'Afastado'
  if (q.includes('desligad')) return 'Desligado'
  if (q.includes('ativ')) return 'Ativo'
  return null
}

/** Verifica se o usuário pediu para gerar/exportar planilha ou arquivo .xlsx */
export function isExportRequest(question: string): boolean {
  const q = normalizeText(question)
  return (
    q.includes('xlsx') ||
    q.includes('excel') ||
    q.includes('planilha') ||
    q.includes('export') ||
    q.includes('gere um arquivo') ||
    q.includes('gerar arquivo') ||
    q.includes('gerar planilha') ||
    q.includes('baixar') ||
    q.includes('download')
  )
}

/**
 * Detecta expressões pronominais ou anafóricas que indicam continuidade do resultado anterior
 * Ex: "dessa lista...", "destes...", "deles...", "deles quem...", "desses...", "e os vencidos...", "e na sapopemba?"
 */
export function isFollowUpOrReference(question: string): boolean {
  const q = normalizeText(question)
  return (
    q.startsWith('e ') ||
    q.startsWith('e, ') ||
    q.startsWith('mas ') ||
    q.includes('dessa lista') ||
    q.includes('desta lista') ||
    q.includes('dessa') ||
    q.includes('desta') ||
    q.includes('desses') ||
    q.includes('destes') ||
    q.includes('deles') ||
    q.includes('delas') ||
    q.includes('da mesma') ||
    q.includes('dos mesmos') ||
    q.includes('quem e da') ||
    q.includes('quem sao da') ||
    q.includes('quem e de') ||
    q.includes('e os ') ||
    q.includes('e as ') ||
    q.includes('e quanto a')
  )
}

/**
 * Extrai o contexto acumulado dos turnos anteriores da conversa.
 * Analisa as mensagens da mais recente para a mais antiga para obter os valores vigentes.
 */
export function extractConversationContext(
  history: ConversationHistoryMessage[],
): ConversationContext {
  const context: ConversationContext = {}

  if (!history || history.length === 0) {
    return context
  }

  // Pega até os últimos 10 turnos (mais que suficiente para conversação ativa)
  const recentTurns = [...history].slice(-10)

  // Encontra as últimas linhas exportadas / resultados de lista
  for (let i = recentTurns.length - 1; i >= 0; i--) {
    const msg = recentTurns[i]
    if (msg.role === 'assistant' && msg.exportableRows && msg.exportableRows.length > 0) {
      context.lastExportableRows = msg.exportableRows
      break
    }
  }

  const accumulatedFuncoes = new Set<string>()

  // Percorre as mensagens para extrair o contexto mais recente de filtros
  for (let i = recentTurns.length - 1; i >= 0; i--) {
    const msg = recentTurns[i]
    const content = msg.content

    // Funções
    const flist = extractFuncoesList(content)
    for (const f of flist) {
      accumulatedFuncoes.add(f)
    }
    if (!context.funcao) {
      const f = extractFuncao(content)
      if (f) context.funcao = f
    }

    // Filial / Garagem
    if (!context.filial) {
      const g = extractFilial(content)
      if (g) context.filial = g
    }

    // Situação
    if (!context.situacao) {
      const s = extractSituacao(content)
      if (s) context.situacao = s
    }

    // DateFilter
    if (!context.dateFilter && msg.role === 'user') {
      const df = extractDateFilter(content)
      if (df) context.dateFilter = df
    }

    // CNH presence filter
    if (!context.cnhFilter && msg.role === 'user') {
      const cnhP = extractCnhPresenceFilter(content)
      if (cnhP) context.cnhFilter = cnhP
    }

    // Future vencimento
    if (context.futureFilter === undefined && msg.role === 'user') {
      if (isFutureVencimentoQuery(content)) {
        context.futureFilter = true
      }
    }

    // Tópico mais recente
    if (!context.lastTopic) {
      const norm = normalizeText(content)
      if (isFutureVencimentoQuery(content)) {
        context.lastTopic = 'cnh_futura'
      } else if (norm.includes('cnh') && (norm.includes('venc') || norm.includes('expir'))) {
        context.lastTopic = 'cnh_vencida'
      } else if (norm.includes('cnh') || norm.includes('habilitac')) {
        context.lastTopic = 'cnh_geral'
      } else if (norm.includes('afastad')) {
        context.lastTopic = 'afastados'
      } else if (extractFuncao(content)) {
        context.lastTopic = 'funcao'
      } else if (extractFilial(content)) {
        context.lastTopic = 'garagem'
      }
    }
  }

  if (accumulatedFuncoes.size > 0) {
    context.funcoesList = Array.from(accumulatedFuncoes)
  }

  return context
}

/**
 * Busca funcionário específico por chapa/registro ou nome.
 */
export function findSpecificEmployee(question: string, employees: Employee[]): Employee | null {
  const raw = question.trim()
  const qNorm = normalizeText(question)

  // 1. Busca por chapa ou registro explícito
  const chapaMatch = raw.match(/(?:chapa|registro|matricula|matrícula)\s*[:#-]?\s*(\d{1,8})\b/i)
  if (chapaMatch) {
    const digits = chapaMatch[1]
    const found = employees.find((e) => {
      const c = (e.chapa ?? '').trim()
      const r = (e.registro ?? '').trim()
      return c === digits || r === digits || parseInt(c, 10) === parseInt(digits, 10)
    })
    if (found) return found
  }

  // 2. Busca por menção explícita de nome
  const nameIntroMatch = raw.match(
    /(?:funcionario|colaborador|motorista|fiscal|cnh\s+do|cnh\s+da|sobre\s+o|sobre\s+a)\s+([A-Za-zÀ-ÖØ-öø-ÿ\s]{3,})/i,
  )
  if (nameIntroMatch) {
    const candidateName = normalizeText(nameIntroMatch[1])
      .replace(/\s+(?:tem|esta|estah|vence|venceu|com|da|do|de|na|no|em)\b.*/, '')
      .trim()

    if (candidateName.length >= 3) {
      const exact = employees.find((e) => normalizeText(e.name) === candidateName)
      if (exact) return exact

      const starts = employees.find((e) => normalizeText(e.name).startsWith(candidateName))
      if (starts) return starts

      if (candidateName.length >= 4) {
        const contains = employees.find((e) => normalizeText(e.name).includes(candidateName))
        if (contains) return contains
      }
    }
  }

  // 3. Busca por nome próprio se a pergunta parecer um nome de colaborador direto
  for (const emp of employees) {
    const empNorm = normalizeText(emp.name)
    if (empNorm.length > 5 && qNorm.includes(empNorm)) {
      return emp
    }
  }

  return null
}

/** Formata resposta detalhada de um funcionário específico */
export function formatEmployeeDetails(emp: Employee): string {
  const days = daysUntil(emp.validade_cnh)
  let statusValidade = ''
  if (days !== null) {
    if (days < 0) {
      statusValidade = ` (Vencida há ${Math.abs(days)} dia(s))`
    } else if (days === 0) {
      statusValidade = ' (Vence HOJE)'
    } else {
      statusValidade = ` (Vence em ${days} dia(s))`
    }
  }

  const linhas = [
    `Dados do colaborador **${emp.name}**:`,
    `• Chapa/Registro: ${emp.chapa || emp.registro || '—'}`,
    `• Função: ${emp.funcao || 'Não informada'}`,
    `• Situação: ${emp.situacao || 'Ativo'}`,
    `• Filial/Garagem: ${emp.filial || 'Não informada'}`,
    `• Empresa: ${emp.company || MAIN_COMPANY}`,
    `• CNH: ${formatCnh(emp.cnh_categoria, emp.cnh_numero)}`,
    `• Categoria CNH: ${emp.cnh_categoria || '—'}`,
    `• Validade da CNH: ${formatDate(emp.validade_cnh)}${statusValidade}`,
    `• Situação da CNH: ${emp.situacao_cnh || (days !== null && days < 0 ? 'Vencida' : 'Válida')}`,
  ]

  if (comparable(emp.situacao) === 'afastado') {
    linhas.push(
      `• Motivo afastamento: ${emp.motivo_afastamento || 'Não informado'}`,
      `• Retorno previsto: ${formatDate(emp.previsao_retorno)}`,
    )
  }

  return linhas.join('\n')
}

/** Exporta lista de funcionários para planilha Excel */
export function exportEmployeesToXlsx(
  employees: Employee[],
  filename = 'consulta-cnh.xlsx',
  sheetName = 'Consulta',
): void {
  const rows = employees.map((employee) => {
    const days = daysUntil(employee.validade_cnh)
    let diasLabel = '—'
    if (days !== null) {
      if (days < 0) diasLabel = `Venceu há ${Math.abs(days)}d`
      else if (days === 0) diasLabel = 'Vence hoje'
      else diasLabel = `${days}d restantes`
    }

    return {
      REGISTRO: employee.chapa || employee.registro || '',
      Nome: employee.name,
      Função: employee.funcao || '',
      'Filial/Garagem': employee.filial || '',
      CNH: formatCnh(employee.cnh_categoria, employee.cnh_numero),
      Categoria: employee.cnh_categoria || '',
      Validade: formatDate(employee.validade_cnh),
      'Dias para vencer': diasLabel,
      Situação: employee.situacao || 'Ativo',
      'Situação CNH': employee.situacao_cnh || '',
      Empresa: employee.company || MAIN_COMPANY,
    }
  })

  const worksheet = XLSX.utils.json_to_sheet(rows)
  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 34 },
    { wch: 22 },
    { wch: 18 },
    { wch: 20 },
    { wch: 12 },
    { wch: 16 },
    { wch: 20 },
    { wch: 14 },
    { wch: 16 },
    { wch: 24 },
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31))
  XLSX.writeFile(workbook, filename)
}

function labelFilial(employee: Employee): string {
  return employee.filial || 'Sem filial'
}

function groupCount(
  employees: Employee[],
  keyOf: (employee: Employee) => string,
): [string, number][] {
  const map = new Map<string, number>()
  for (const employee of employees) {
    const key = keyOf(employee) || '—'
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

const MAX_DISPLAY_BULLETS = 25

/**
 * Função principal que processa a pergunta do usuário e produz uma resposta completa.
 * Agora suporta histórico de mensagens para interpretação contextualizada.
 */
function internalProcessAssistantQuery(
  rawQuestion: string,
  employees: Employee[],
  history: ConversationHistoryMessage[],
  now: Date,
): AssistantAnswer {
  const questionNorm = normalizeText(rawQuestion)
  const wantsExport = isExportRequest(rawQuestion)
  const todayStr = new Date().toISOString().slice(0, 10)
  const defaultExportName = `consulta-${todayStr}.xlsx`

  if (employees.length === 0) {
    return {
      content:
        'A base de colaboradores não possui registros no momento. Assim que houver dados importados, poderei responder suas consultas.',
    }
  }

  // 1. Extração de contexto conversacional acumulado dos turnos anteriores
  const prevContext = extractConversationContext(history)

  // 2. Extração de entidades explícitas na pergunta atual
  const explicitDateFilter = extractDateFilter(rawQuestion, now)
  const explicitFilial = extractFilial(rawQuestion)
  const explicitFuncao = extractFuncao(rawQuestion)
  const explicitFuncoesList = extractFuncoesList(rawQuestion)
  const explicitSituacao = extractSituacao(rawQuestion)
  const explicitCnhFilter = extractCnhPresenceFilter(rawQuestion)
  const isFutureQuery = isFutureVencimentoQuery(rawQuestion)
  const isAdditive = isAdditiveQuery(rawQuestion)

  // Verifica se o usuário fez uma pergunta de retomada ou pronome ("dessa lista...", "e os vencidos em 09?", "quais deles...", etc.)
  const isReferenceQuery =
    isFollowUpOrReference(rawQuestion) ||
    questionNorm.includes('quais deles') ||
    questionNorm.includes('cada um') ||
    questionNorm.includes('data de vencimento') ||
    isFutureQuery ||
    explicitCnhFilter !== null ||
    isAdditive ||
    (history.length > 0 &&
      !explicitFilial &&
      !explicitSituacao &&
      (explicitFuncoesList.length === 0 || isAdditive))

  // Montagem da lista efetiva de funções
  let effectiveFuncoesList: string[] = []
  if (isAdditive) {
    // Adiciona as novas funções às já acumuladas no contexto
    const existing = new Set(
      prevContext.funcoesList ?? (prevContext.funcao ? [prevContext.funcao] : []),
    )
    for (const f of explicitFuncoesList) {
      existing.add(f)
    }
    if (explicitFuncao) existing.add(explicitFuncao)
    effectiveFuncoesList = Array.from(existing)
  } else if (explicitFuncoesList.length > 0) {
    effectiveFuncoesList = explicitFuncoesList
  } else if (explicitFuncao) {
    effectiveFuncoesList = [explicitFuncao]
  } else if (prevContext.funcoesList && prevContext.funcoesList.length > 0) {
    effectiveFuncoesList = prevContext.funcoesList
  } else if (prevContext.funcao) {
    effectiveFuncoesList = [prevContext.funcao]
  }

  // Se o usuário já adicionou funções na conversa e a pergunta atual é genérica de retomada (ex.: vencimento, etc.),
  // garante que effectiveFuncoesList mantenha as funções da família acumulada.
  if (
    effectiveFuncoesList.length === 0 &&
    prevContext.funcoesList &&
    prevContext.funcoesList.length > 0
  ) {
    effectiveFuncoesList = prevContext.funcoesList
  }

  const effectiveFuncao =
    effectiveFuncoesList.length > 0
      ? effectiveFuncoesList[0]
      : (explicitFuncao ?? prevContext.funcao ?? null)
  const effectiveFilial = explicitFilial ?? (isReferenceQuery ? (prevContext.filial ?? null) : null)
  const effectiveSituacao =
    explicitSituacao ?? (isReferenceQuery ? (prevContext.situacao ?? null) : null)

  // Regra de DateFilter:
  // Um filtro de mês específico só deve persistir se a pergunta atual mencionar período/mês de forma explícita.
  // Se a pergunta for genérica sobre vencidos ("quais deles terão sua CNH vencida?", "me mande a data de vencimento"), NÃO herda mês específico!
  const mentionsMonthOrSpecificDate =
    explicitDateFilter !== null ||
    /\b(?:mes|mês|ano|janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|\d{1,2}\/\d{2,4})\b/i.test(
      rawQuestion,
    )

  const effectiveDateFilter =
    explicitDateFilter ??
    (mentionsMonthOrSpecificDate && isReferenceQuery ? (prevContext.dateFilter ?? null) : null)

  const effectiveCnhFilter =
    explicitCnhFilter ?? (isReferenceQuery ? (prevContext.cnhFilter ?? null) : null)
  const effectiveFutureFilter =
    isFutureQuery || (!explicitDateFilter && isReferenceQuery && prevContext.futureFilter === true)

  const isGeneralQuery =
    explicitDateFilter !== null ||
    effectiveDateFilter !== null ||
    questionNorm.includes('quantos') ||
    questionNorm.includes('quais') ||
    questionNorm.includes('listar') ||
    questionNorm.includes('lista')

  // Se NÃO for uma pergunta de quantificação/listagem, tenta colaborador específico
  // OU se a pergunta cita "chapa" ou "registro" explicitamente, prioriza o colaborador
  const hasExplicitChapa = /(?:chapa|registro|matricula|matrícula)\s*[:#-]?\s*\d{1,8}\b/i.test(
    rawQuestion,
  )
  const specificEmp =
    isGeneralQuery && !hasExplicitChapa ? null : findSpecificEmployee(rawQuestion, employees)
  if (specificEmp) {
    const detail = formatEmployeeDetails(specificEmp)
    if (wantsExport) {
      return {
        content: `${detail}\n\nPlanilha com os dados de ${specificEmp.name} gerada para download.`,
        exportableRows: [specificEmp],
        exportFileName: `colaborador-${specificEmp.chapa || 'dados'}-${todayStr}.xlsx`,
        exportSheetName: 'Colaborador',
        autoDownload: true,
        matchedEmployee: specificEmp,
        extractedContext: {
          funcao: specificEmp.funcao,
          filial: specificEmp.filial as any,
          situacao: specificEmp.situacao as any,
        },
      }
    }
    return {
      content: detail,
      matchedEmployee: specificEmp,
      extractedContext: {
        funcao: specificEmp.funcao,
        filial: specificEmp.filial as any,
        situacao: specificEmp.situacao as any,
      },
    }
  }

  // 3. Verifica menções de CNH e vencimento
  const mentionsCnh =
    questionNorm.includes('cnh') ||
    questionNorm.includes('habilitac') ||
    questionNorm.includes('carteira')

  const mentionsVencimento =
    questionNorm.includes('venc') ||
    questionNorm.includes('expir') ||
    questionNorm.includes('validade')

  // FILTRAGEM BASE COM REGRAS DE RETOMADA E REFINAMENTO:
  // Se houver filtro de CNH explícito ("os que tem CNH", "esses não tem CNH", etc.),
  // e tivermos uma lista anterior recente ou contexto de função, aplicamos o filtro CNH.
  const hasCnhFilterMention = explicitCnhFilter !== null

  // CASO DE REFERÊNCIA DIRETA A UMA LISTA ANTERIOR ("dessa lista...", "esses...", "deles...")
  // OU pergunta de CNH em cima do resultado anterior ("os que tem CNH", "esses não tem CNH")
  const isDirectReferenceToList =
    (questionNorm.includes('dessa lista') ||
      questionNorm.includes('desta lista') ||
      questionNorm.includes('desses') ||
      questionNorm.includes('destes') ||
      questionNorm.includes('deles') ||
      hasCnhFilterMention) &&
    !isFutureQuery &&
    !mentionsVencimento &&
    Boolean(prevContext.lastExportableRows && prevContext.lastExportableRows.length > 0)

  if (
    isDirectReferenceToList &&
    prevContext.lastExportableRows &&
    prevContext.lastExportableRows.length > 0
  ) {
    let subList = [...prevContext.lastExportableRows]

    if (explicitFilial) {
      subList = subList.filter((emp) => emp.filial === explicitFilial)
    }
    if (effectiveFuncoesList.length > 0 && !hasCnhFilterMention) {
      subList = subList.filter((emp) => matchesFuncoes(emp.funcao, effectiveFuncoesList))
    }
    if (explicitSituacao) {
      subList = subList.filter((emp) => comparable(emp.situacao) === comparable(explicitSituacao))
    }
    if (effectiveCnhFilter === 'com_cnh') {
      subList = subList.filter(
        (emp) =>
          Boolean(emp.cnh_numero && emp.cnh_numero.trim() !== '') && emp.situacao_cnh !== 'Sem CNH',
      )
    } else if (effectiveCnhFilter === 'sem_cnh') {
      subList = subList.filter(
        (emp) => !emp.cnh_numero || emp.cnh_numero.trim() === '' || emp.situacao_cnh === 'Sem CNH',
      )
    }

    const cnhDesc =
      effectiveCnhFilter === 'com_cnh'
        ? 'com CNH cadastrada'
        : effectiveCnhFilter === 'sem_cnh'
          ? 'sem CNH'
          : null
    const descList = [
      cnhDesc,
      explicitFilial ? `da garagem ${explicitFilial}` : null,
      explicitFuncao ? `com a função ${explicitFuncao}` : null,
      explicitSituacao ? `na situação ${explicitSituacao}` : null,
    ]
      .filter(Boolean)
      .join(', ')

    if (subList.length === 0) {
      const msgVazia =
        effectiveCnhFilter === 'com_cnh'
          ? `Dos colaboradores da listagem anterior, nenhum possui CNH cadastrada na base de dados.`
          : effectiveCnhFilter === 'sem_cnh'
            ? `Dos colaboradores da listagem anterior, nenhum está sem CNH (todos possuem CNH cadastrada).`
            : `Dessa lista de colaboradores anteriores, nenhum corresponde ao filtro solicitado${descList ? ` (${descList})` : ''}.`

      return {
        content: msgVazia,
        extractedContext: {
          funcao: effectiveFuncao,
          funcoesList: effectiveFuncoesList,
          filial: effectiveFilial,
          situacao: effectiveSituacao,
          cnhFilter: effectiveCnhFilter,
          lastExportableRows: [],
        },
      }
    }

    const total = subList.length
    const exibidos = subList.slice(0, MAX_DISPLAY_BULLETS)
    const linhas = exibidos.map(
      (emp) =>
        `• ${emp.name} (chapa ${emp.chapa}) — ${emp.funcao || '—'} · sit.: ${emp.situacao || 'Ativo'} · CNH: ${formatCnh(emp.cnh_categoria, emp.cnh_numero)} · venc.: ${formatDate(emp.validade_cnh)} (${labelFilial(emp)})`,
    )

    let resposta = `Dessa lista anterior, encontrei ${total} colaborador(es)${descList ? ` (${descList})` : ''}:`
    resposta += '\n' + linhas.join('\n')

    if (total > MAX_DISPLAY_BULLETS) {
      resposta += `\n\n… e outros ${total - MAX_DISPLAY_BULLETS} colaborador(es). Solicite a planilha para visualizar todos.`
    }

    if (wantsExport) {
      resposta += `\n\nArquivo .xlsx com os ${total} registros foi gerado para download.`
      return {
        content: resposta,
        exportableRows: subList,
        exportFileName: `sublista-filtrada-${todayStr}.xlsx`,
        exportSheetName: 'Filtrados',
        autoDownload: true,
        extractedContext: {
          funcao: effectiveFuncao,
          funcoesList: effectiveFuncoesList,
          filial: effectiveFilial,
          situacao: effectiveSituacao,
          cnhFilter: effectiveCnhFilter,
          lastExportableRows: subList,
        },
      }
    }

    return {
      content: resposta,
      exportableRows: subList,
      exportFileName: `sublista-filtrada-${todayStr}.xlsx`,
      exportSheetName: 'Filtrados',
      extractedContext: {
        funcao: effectiveFuncao,
        funcoesList: effectiveFuncoesList,
        filial: effectiveFilial,
        situacao: effectiveSituacao,
        cnhFilter: effectiveCnhFilter,
        lastExportableRows: subList,
      },
    }
  }

  // 4. Consultas focadas em CNH com filtro de data ou período (explícito ou herdado)
  const dateFilterToUse = explicitDateFilter || (isReferenceQuery ? effectiveDateFilter : null)

  if (dateFilterToUse) {
    // Filtrar funcionários cuja CNH vence no período especificado
    let filtered = employees.filter((emp) => matchesDateFilter(emp.validade_cnh, dateFilterToUse))

    // Aplica função, filial e situação vigentes no contexto
    if (effectiveFilial) {
      filtered = filtered.filter((emp) => emp.filial === effectiveFilial)
    }
    if (effectiveFuncoesList.length > 0) {
      filtered = filtered.filter((emp) => matchesFuncoes(emp.funcao, effectiveFuncoesList))
    } else if (effectiveFuncao) {
      filtered = filtered.filter((emp) =>
        normalizeText(emp.funcao).includes(normalizeText(effectiveFuncao)),
      )
    }
    if (effectiveSituacao) {
      filtered = filtered.filter(
        (emp) => comparable(emp.situacao) === comparable(effectiveSituacao),
      )
    }
    if (effectiveCnhFilter === 'com_cnh') {
      filtered = filtered.filter(
        (emp) =>
          Boolean(emp.cnh_numero && emp.cnh_numero.trim() !== '') && emp.situacao_cnh !== 'Sem CNH',
      )
    } else if (effectiveCnhFilter === 'sem_cnh') {
      filtered = filtered.filter(
        (emp) => !emp.cnh_numero || emp.cnh_numero.trim() === '' || emp.situacao_cnh === 'Sem CNH',
      )
    }

    filtered.sort((a, b) => (a.validade_cnh ?? '').localeCompare(b.validade_cnh ?? ''))

    const descDetalhada = [
      effectiveFilial ? `da garagem ${effectiveFilial}` : null,
      effectiveFuncoesList.length > 0
        ? `função ${effectiveFuncoesList.join(', ')}`
        : effectiveFuncao
          ? `função ${effectiveFuncao}`
          : null,
      effectiveSituacao ? `situação ${effectiveSituacao}` : null,
      effectiveCnhFilter === 'com_cnh'
        ? 'com CNH'
        : effectiveCnhFilter === 'sem_cnh'
          ? 'sem CNH'
          : null,
    ]
      .filter(Boolean)
      .join(', ')

    const complementoFiltro = descDetalhada ? ` (${descDetalhada})` : ''

    if (filtered.length === 0) {
      const msg = `Nenhum colaborador com CNH com vencimento para ${dateFilterToUse.description}${complementoFiltro} foi encontrado na base.`
      return {
        content: msg,
        extractedContext: {
          funcao: effectiveFuncao,
          funcoesList: effectiveFuncoesList,
          filial: effectiveFilial,
          situacao: effectiveSituacao,
          dateFilter: dateFilterToUse,
          cnhFilter: effectiveCnhFilter,
        },
      }
    }

    const total = filtered.length
    const exibidos = filtered.slice(0, MAX_DISPLAY_BULLETS)
    const linhas = exibidos.map(
      (emp) =>
        `• ${emp.name} (chapa ${emp.chapa}) — ${emp.funcao || 'Motorista'} · CNH: ${formatCnh(emp.cnh_categoria, emp.cnh_numero)} · vencimento em ${formatDate(emp.validade_cnh)} (${labelFilial(emp)})`,
    )

    let resposta = `Existem ${total} colaborador(es) com CNH com vencimento em ${dateFilterToUse.description}${complementoFiltro}:`
    resposta += '\n' + linhas.join('\n')

    if (total > MAX_DISPLAY_BULLETS) {
      resposta += `\n\n… e outros ${total - MAX_DISPLAY_BULLETS} colaborador(es). Solicite a planilha para ver a lista completa.`
    }

    if (wantsExport) {
      resposta += `\n\nArquivo .xlsx com todos os ${total} colaborador(es) foi gerado para download.`
      return {
        content: resposta,
        exportableRows: filtered,
        exportFileName: `cnhs-vencimento-${dateFilterToUse.description.replace(/[^a-zA-Z0-9-]/g, '_')}-${todayStr}.xlsx`,
        exportSheetName: 'CNHs',
        autoDownload: true,
        extractedContext: {
          funcao: effectiveFuncao,
          funcoesList: effectiveFuncoesList,
          filial: effectiveFilial,
          situacao: effectiveSituacao,
          dateFilter: dateFilterToUse,
          cnhFilter: effectiveCnhFilter,
          lastTopic: 'cnh_vencida',
          lastExportableRows: filtered,
        },
      }
    }

    return {
      content: resposta,
      exportableRows: filtered,
      exportFileName: `cnhs-vencimento-${dateFilterToUse.description.replace(/[^a-zA-Z0-9-]/g, '_')}-${todayStr}.xlsx`,
      exportSheetName: 'CNHs',
      extractedContext: {
        funcao: effectiveFuncao,
        funcoesList: effectiveFuncoesList,
        filial: effectiveFilial,
        situacao: effectiveSituacao,
        dateFilter: dateFilterToUse,
        cnhFilter: effectiveCnhFilter,
        lastTopic: 'cnh_vencida',
        lastExportableRows: filtered,
      },
    }
  }

  // 4.5. Consultas de VENCIMENTOS FUTUROS (A VENCER / PRÓXIMOS MESES / ANOS)
  if (effectiveFutureFilter) {
    let candidatos = [...employees]

    // Aplica filtros de função, garagem, situação e presença de CNH
    if (effectiveFilial) {
      candidatos = candidatos.filter((emp) => emp.filial === effectiveFilial)
    }
    if (effectiveFuncoesList.length > 0) {
      candidatos = candidatos.filter((emp) => matchesFuncoes(emp.funcao, effectiveFuncoesList))
    } else if (effectiveFuncao) {
      candidatos = candidatos.filter((emp) =>
        normalizeText(emp.funcao).includes(normalizeText(effectiveFuncao)),
      )
    }
    if (effectiveSituacao) {
      candidatos = candidatos.filter(
        (emp) => comparable(emp.situacao) === comparable(effectiveSituacao),
      )
    }
    if (effectiveCnhFilter === 'com_cnh') {
      candidatos = candidatos.filter(
        (emp) =>
          Boolean(emp.cnh_numero && emp.cnh_numero.trim() !== '') && emp.situacao_cnh !== 'Sem CNH',
      )
    } else if (effectiveCnhFilter === 'sem_cnh') {
      candidatos = candidatos.filter(
        (emp) => !emp.cnh_numero || emp.cnh_numero.trim() === '' || emp.situacao_cnh === 'Sem CNH',
      )
    }

    // Filtra CNHs com vencimento futuro (situação_cnh === 'A vencer' ou validade > now)
    const futuros = candidatos
      .filter((emp) => {
        if (!emp.validade_cnh) return false
        // Se a CNH está vencida, descarta
        if (isCnhVencidaLib(emp, now)) return false
        const d = parseFlexibleDate(emp.validade_cnh)
        if (!d) return false
        const dateObj = new Date(d)
        return !isNaN(dateObj.getTime()) && dateObj.getTime() >= now.getTime()
      })
      .sort((a, b) => (a.validade_cnh ?? '').localeCompare(b.validade_cnh ?? ''))

    const descDetalhes = [
      effectiveFuncoesList.length > 0
        ? `da função ${effectiveFuncoesList.join(', ')}`
        : effectiveFuncao
          ? `da função ${effectiveFuncao}`
          : null,
      effectiveFilial ? `na garagem ${effectiveFilial}` : null,
      effectiveSituacao ? `na situação ${effectiveSituacao}` : null,
      effectiveCnhFilter === 'com_cnh'
        ? 'com CNH cadastrada'
        : effectiveCnhFilter === 'sem_cnh'
          ? 'sem CNH'
          : null,
    ]
      .filter(Boolean)
      .join(', ')

    const complemento = descDetalhes ? ` (${descDetalhes})` : ''

    if (futuros.length === 0) {
      return {
        content: `Nenhum colaborador com CNH a vencer futuramente foi encontrado na base${complemento}.`,
        extractedContext: {
          funcao: effectiveFuncao,
          funcoesList: effectiveFuncoesList,
          filial: effectiveFilial,
          situacao: effectiveSituacao,
          cnhFilter: effectiveCnhFilter,
          futureFilter: true,
          lastTopic: 'cnh_futura',
        },
      }
    }

    const total = futuros.length
    const exibidos = futuros.slice(0, MAX_DISPLAY_BULLETS)
    const linhas = exibidos.map(
      (emp) =>
        `• ${emp.name} (chapa ${emp.chapa}) — ${emp.funcao || '—'} · CNH: ${formatCnh(emp.cnh_categoria, emp.cnh_numero)} · a vencer em ${formatDate(emp.validade_cnh)} (${labelFilial(emp)})`,
    )

    let resposta = `Existem ${total} colaborador(es) com CNH a vencer futuramente${complemento}, ordenados pela data mais próxima:`
    resposta += '\n' + linhas.join('\n')

    if (total > MAX_DISPLAY_BULLETS) {
      resposta += `\n\n… e outros ${total - MAX_DISPLAY_BULLETS} colaborador(es). Solicite a planilha para visualizar a lista completa.`
    }

    const filePrefix = effectiveFuncao
      ? `cnhs-a-vencer-${normalizeText(effectiveFuncao).replace(/\s+/g, '-')}`
      : 'cnhs-a-vencer'

    if (wantsExport) {
      resposta += `\n\nArquivo .xlsx com os ${total} registros foi gerado para download.`
      return {
        content: resposta,
        exportableRows: futuros,
        exportFileName: `${filePrefix}-${todayStr}.xlsx`,
        exportSheetName: 'A Vencer',
        autoDownload: true,
        extractedContext: {
          funcao: effectiveFuncao,
          funcoesList: effectiveFuncoesList,
          filial: effectiveFilial,
          situacao: effectiveSituacao,
          cnhFilter: effectiveCnhFilter,
          futureFilter: true,
          lastTopic: 'cnh_futura',
          lastExportableRows: futuros,
        },
      }
    }

    return {
      content: resposta,
      exportableRows: futuros,
      exportFileName: `${filePrefix}-${todayStr}.xlsx`,
      exportSheetName: 'A Vencer',
      extractedContext: {
        funcao: effectiveFuncao,
        funcoesList: effectiveFuncoesList,
        filial: effectiveFilial,
        situacao: effectiveSituacao,
        cnhFilter: effectiveCnhFilter,
        futureFilter: true,
        lastTopic: 'cnh_futura',
        lastExportableRows: futuros,
      },
    }
  }

  // 5. CNHs Vencidas em geral (sem data específica)
  // Trata tanto menções diretas a CNH vencida como "quais deles terão sua CNH vencida?", "me mande a data de vencimento", etc.
  // IMPORTANTE: Se o usuário estiver fazendo uma pergunta aditiva ("leve em consideração também..."), o bloco aditivo tem prioridade!
  const isSpecificVencimentoDetail =
    questionNorm.includes('data de vencimento') ||
    questionNorm.includes('data de validade') ||
    (questionNorm.includes('cada um') && !questionNorm.includes('quantos'))

  const wantsVencimentoList =
    !isAdditive &&
    (mentionsVencimento ||
      (mentionsCnh &&
        (questionNorm.includes('vencid') || prevContext.lastTopic === 'cnh_vencida')) ||
      ((questionNorm.includes('quais deles') || isSpecificVencimentoDetail) &&
        (prevContext.lastTopic === 'cnh_vencida' ||
          prevContext.dateFilter !== null ||
          prevContext.funcoesList !== undefined ||
          prevContext.funcao !== undefined)))

  if (wantsVencimentoList) {
    let candidatos = [...employees]
    if (effectiveFilial) {
      candidatos = candidatos.filter((emp) => emp.filial === effectiveFilial)
    }
    if (effectiveFuncoesList.length > 0) {
      candidatos = candidatos.filter((emp) => matchesFuncoes(emp.funcao, effectiveFuncoesList))
    } else if (effectiveFuncao) {
      candidatos = candidatos.filter((emp) =>
        normalizeText(emp.funcao).includes(normalizeText(effectiveFuncao)),
      )
    }
    if (effectiveSituacao) {
      candidatos = candidatos.filter(
        (emp) => comparable(emp.situacao) === comparable(effectiveSituacao),
      )
    }
    if (effectiveCnhFilter === 'com_cnh') {
      candidatos = candidatos.filter(
        (emp) =>
          Boolean(emp.cnh_numero && emp.cnh_numero.trim() !== '') && emp.situacao_cnh !== 'Sem CNH',
      )
    } else if (effectiveCnhFilter === 'sem_cnh') {
      candidatos = candidatos.filter(
        (emp) => !emp.cnh_numero || emp.cnh_numero.trim() === '' || emp.situacao_cnh === 'Sem CNH',
      )
    }

    const vencidos = candidatos
      .filter((emp) => isCnhVencidaLib(emp, now))
      .sort((a, b) => (a.validade_cnh ?? '').localeCompare(b.validade_cnh ?? ''))

    const roleLabelDesc =
      effectiveFuncoesList.length > 0
        ? `da família/função ${effectiveFuncoesList.join(', ')}`
        : effectiveFuncao
          ? `da função ${effectiveFuncao}`
          : 'no geral'

    const descDetalhes = [
      roleLabelDesc,
      effectiveFilial ? `na garagem ${effectiveFilial}` : null,
      effectiveSituacao ? `na situação ${effectiveSituacao}` : null,
      effectiveCnhFilter === 'com_cnh'
        ? 'com CNH cadastrada'
        : effectiveCnhFilter === 'sem_cnh'
          ? 'sem CNH'
          : null,
    ]
      .filter(Boolean)
      .join(', ')

    const roleLabel = effectiveFuncao ? effectiveFuncao.toLowerCase() : 'colaborador'

    const exibidos = vencidos.slice(0, MAX_DISPLAY_BULLETS)
    const linhas = exibidos.map(
      (emp) =>
        `• ${emp.name} (chapa ${emp.chapa}) — ${emp.funcao || '—'} · CNH: ${formatCnh(emp.cnh_categoria, emp.cnh_numero)} · vencida em ${formatDate(emp.validade_cnh)} (${labelFilial(emp)})`,
    )

    let resposta = ''
    if (isSpecificVencimentoDetail) {
      resposta = `Data de vencimento dos ${vencidos.length} ${roleLabel}(s) com CNH vencida na base (${descDetalhes}):`
    } else {
      resposta = `Existem ${vencidos.length} ${roleLabel}(s) com a CNH vencida no momento na base (${descDetalhes}):`
    }

    if (linhas.length) {
      resposta += '\n' + linhas.join('\n')
    } else {
      resposta += `\n• Nenhum ${roleLabel} com a CNH vencida encontrado com esses filtros.`
    }

    if (vencidos.length > MAX_DISPLAY_BULLETS) {
      resposta += `\n\n… e outros ${vencidos.length - MAX_DISPLAY_BULLETS} ${roleLabel}(s). Baixe a planilha para conferir a listagem completa.`
    }

    if (vencidos.length > 0) {
      resposta += '\n\nRegularize essas CNHs para evitar restrições operacionais.'
    }

    const filePrefix = effectiveFuncao
      ? `cnhs-vencidas-${normalizeText(effectiveFuncao).replace(/\s+/g, '-')}`
      : 'cnhs-vencidas'

    if (wantsExport && vencidos.length > 0) {
      resposta += `\n\nArquivo .xlsx com todos os registros foi gerado para download.`
      return {
        content: resposta,
        exportableRows: vencidos,
        exportFileName: `${filePrefix}-${todayStr}.xlsx`,
        exportSheetName: 'Vencidas',
        autoDownload: true,
        extractedContext: {
          funcao: effectiveFuncao,
          funcoesList: effectiveFuncoesList,
          filial: effectiveFilial,
          situacao: effectiveSituacao,
          cnhFilter: effectiveCnhFilter,
          lastTopic: 'cnh_vencida',
          lastExportableRows: vencidos,
        },
      }
    }

    return {
      content: resposta,
      exportableRows: vencidos.length > 0 ? vencidos : undefined,
      exportFileName: `${filePrefix}-${todayStr}.xlsx`,
      exportSheetName: 'Vencidas',
      extractedContext: {
        funcao: effectiveFuncao,
        funcoesList: effectiveFuncoesList,
        filial: effectiveFilial,
        situacao: effectiveSituacao,
        cnhFilter: effectiveCnhFilter,
        lastTopic: 'cnh_vencida',
        lastExportableRows: vencidos,
      },
    }
  }

  // 5.5. CASO DE RETOMADA ADITIVA DE FUNÇÕES ("leve em consideração também os fiscais I, fiscal II, e fiscal III e aux. de fiscal")
  if (isAdditive && effectiveFuncoesList.length > 0) {
    let candidatos = [...employees]
    if (effectiveFilial) {
      candidatos = candidatos.filter((emp) => emp.filial === effectiveFilial)
    }
    candidatos = candidatos.filter((emp) => matchesFuncoes(emp.funcao, effectiveFuncoesList))
    if (effectiveSituacao) {
      candidatos = candidatos.filter(
        (emp) => comparable(emp.situacao) === comparable(effectiveSituacao),
      )
    }

    // Se havia um filtro de data recente no contexto anterior (ex.: 09/2026), aplica e informa
    const activeDateFilter = explicitDateFilter ?? prevContext.dateFilter ?? null
    if (activeDateFilter) {
      const comData = candidatos.filter((emp) =>
        matchesDateFilter(emp.validade_cnh, activeDateFilter),
      )
      comData.sort((a, b) => (a.validade_cnh ?? '').localeCompare(b.validade_cnh ?? ''))

      const funcoesLabel = effectiveFuncoesList.join(', ')
      const descGaragem = effectiveFilial ? ` na garagem ${effectiveFilial}` : ''

      if (comData.length === 0) {
        return {
          content: `Atualizei os critérios para incluir também (${funcoesLabel}), mas nenhum colaborador dessas funções possui CNH com vencimento para ${activeDateFilter.description}${descGaragem}. (Total de colaboradores considerados nessas funções: ${candidatos.length}).`,
          extractedContext: {
            funcao: effectiveFuncao,
            funcoesList: effectiveFuncoesList,
            filial: effectiveFilial,
            situacao: effectiveSituacao,
            dateFilter: activeDateFilter,
            cnhFilter: effectiveCnhFilter,
            lastExportableRows: [],
          },
        }
      }

      const total = comData.length
      const exibidos = comData.slice(0, MAX_DISPLAY_BULLETS)
      const linhas = exibidos.map(
        (emp) =>
          `• ${emp.name} (chapa ${emp.chapa}) — ${emp.funcao || '—'} · CNH: ${formatCnh(emp.cnh_categoria, emp.cnh_numero)} · vencimento em ${formatDate(emp.validade_cnh)} (${labelFilial(emp)})`,
      )

      let resposta = `Considerando as funções adicionadas (${funcoesLabel}), encontrei ${total} colaborador(es) com vencimento em ${activeDateFilter.description}${descGaragem}:`
      resposta += '\n' + linhas.join('\n')

      return {
        content: resposta,
        exportableRows: comData,
        extractedContext: {
          funcao: effectiveFuncao,
          funcoesList: effectiveFuncoesList,
          filial: effectiveFilial,
          situacao: effectiveSituacao,
          dateFilter: activeDateFilter,
          cnhFilter: effectiveCnhFilter,
          lastExportableRows: comData,
        },
      }
    }

    const funcoesLabel = effectiveFuncoesList.join(', ')
    const porCargo = groupCount(candidatos, (emp) => emp.funcao || 'Não informada')
    const total = candidatos.length
    const exibidos = candidatos.slice(0, MAX_DISPLAY_BULLETS)
    const linhas = exibidos.map(
      (emp) =>
        `• ${emp.name} (chapa ${emp.chapa}) — ${emp.funcao || '—'} · sit.: ${emp.situacao || 'Ativo'} · CNH: ${formatCnh(emp.cnh_categoria, emp.cnh_numero)} (${labelFilial(emp)})`,
    )

    let resposta = [
      `Atualizei os critérios para incluir também: ${funcoesLabel}.`,
      `Total encontrado: ${total} colaborador(es)${effectiveFilial ? ` na garagem ${effectiveFilial}` : ''}.`,
      '',
      'Distribuição por cargo:',
      ...porCargo.map(([c, count]) => `• ${c}: ${count}`),
      '',
      'Colaboradores:',
      ...linhas,
    ].join('\n')

    if (total > MAX_DISPLAY_BULLETS) {
      resposta += `\n\n… e outros ${total - MAX_DISPLAY_BULLETS} colaborador(es). Solicite a planilha para exportar todos.`
    }

    return {
      content: resposta,
      exportableRows: candidatos,
      extractedContext: {
        funcao: effectiveFuncao,
        funcoesList: effectiveFuncoesList,
        filial: effectiveFilial,
        situacao: effectiveSituacao,
        cnhFilter: effectiveCnhFilter,
        lastExportableRows: candidatos,
      },
    }
  }

  // 6. Consultas combinadas sem data específica:
  // Ex.: "afastados da SAPOPEMBA", "fiscais da CURSINO", "motoristas ativos da SAPOPEMBA"
  if (effectiveFilial && (effectiveSituacao || effectiveFuncao)) {
    let filtered = employees.filter((emp) => emp.filial === effectiveFilial)
    if (effectiveSituacao) {
      filtered = filtered.filter(
        (emp) => comparable(emp.situacao) === comparable(effectiveSituacao),
      )
    }
    if (effectiveFuncoesList.length > 0) {
      filtered = filtered.filter((emp) => matchesFuncoes(emp.funcao, effectiveFuncoesList))
    } else if (effectiveFuncao) {
      filtered = filtered.filter((emp) =>
        normalizeText(emp.funcao).includes(normalizeText(effectiveFuncao)),
      )
    }
    if (effectiveCnhFilter === 'com_cnh') {
      filtered = filtered.filter(
        (emp) =>
          Boolean(emp.cnh_numero && emp.cnh_numero.trim() !== '') && emp.situacao_cnh !== 'Sem CNH',
      )
    } else if (effectiveCnhFilter === 'sem_cnh') {
      filtered = filtered.filter(
        (emp) => !emp.cnh_numero || emp.cnh_numero.trim() === '' || emp.situacao_cnh === 'Sem CNH',
      )
    }

    const desc =
      `${effectiveSituacao ? effectiveSituacao.toLowerCase() + 's' : ''} ${effectiveFuncao ? effectiveFuncao.toLowerCase() + 's' : ''}`.trim()
    if (filtered.length === 0) {
      return {
        content: `Nenhum colaborador encontrado para a garagem ${effectiveFilial} com os filtros solicitados.`,
        extractedContext: {
          funcao: effectiveFuncao,
          funcoesList: effectiveFuncoesList,
          filial: effectiveFilial,
          situacao: effectiveSituacao,
          cnhFilter: effectiveCnhFilter,
        },
      }
    }

    const total = filtered.length
    const exibidos = filtered.slice(0, MAX_DISPLAY_BULLETS)
    const linhas = exibidos.map(
      (emp) =>
        `• ${emp.name} (chapa ${emp.chapa}) — ${emp.funcao || '—'} · sit.: ${emp.situacao || 'Ativo'} · CNH: ${formatCnh(emp.cnh_categoria, emp.cnh_numero)}`,
    )

    let resposta = `Há ${total} colaborador(es) ${desc} na garagem ${effectiveFilial}:`
    resposta += '\n' + linhas.join('\n')
    if (total > MAX_DISPLAY_BULLETS) {
      resposta += `\n\n… e outros ${total - MAX_DISPLAY_BULLETS} colaborador(es).`
    }

    if (wantsExport) {
      resposta += `\n\nArquivo .xlsx gerado com sucesso.`
      return {
        content: resposta,
        exportableRows: filtered,
        exportFileName: `colaboradores-${effectiveFilial.toLowerCase()}-${todayStr}.xlsx`,
        exportSheetName: effectiveFilial,
        autoDownload: true,
        extractedContext: {
          funcao: effectiveFuncao,
          funcoesList: effectiveFuncoesList,
          filial: effectiveFilial,
          situacao: effectiveSituacao,
          cnhFilter: effectiveCnhFilter,
          lastExportableRows: filtered,
        },
      }
    }

    return {
      content: resposta,
      exportableRows: filtered,
      exportFileName: `colaboradores-${effectiveFilial.toLowerCase()}-${todayStr}.xlsx`,
      exportSheetName: effectiveFilial,
      extractedContext: {
        funcao: effectiveFuncao,
        funcoesList: effectiveFuncoesList,
        filial: effectiveFilial,
        situacao: effectiveSituacao,
        cnhFilter: effectiveCnhFilter,
        lastExportableRows: filtered,
      },
    }
  }

  // 7. Afastados
  if (questionNorm.includes('afastad')) {
    let afastados = employees.filter((emp) => comparable(emp.situacao) === 'afastado')
    if (effectiveFilial) {
      afastados = afastados.filter((emp) => emp.filial === effectiveFilial)
    }
    if (effectiveFuncao) {
      afastados = afastados.filter((emp) =>
        normalizeText(emp.funcao).includes(normalizeText(effectiveFuncao)),
      )
    }

    const afastadosOutra = afastados.filter(
      (emp) => Boolean(emp.company) && emp.company !== MAIN_COMPANY,
    )
    const perguntaOutra =
      questionNorm.includes('outra') ||
      questionNorm.includes('outras') ||
      questionNorm.includes('outra(s)')

    if (perguntaOutra) {
      const exibidos = afastadosOutra.slice(0, MAX_DISPLAY_BULLETS)
      const linhas = exibidos.map(
        (emp) =>
          `• ${emp.name} (chapa ${emp.chapa}) — ${emp.company || 'empresa não informada'} · motivo: ${emp.motivo_afastamento || 'não informado'} · retorno previsto para ${formatDate(emp.previsao_retorno)}`,
      )

      let resposta = `Existem ${afastadosOutra.length} colaborador(es) afastado(s) em outra empresa:`
      if (linhas.length) {
        resposta += '\n' + linhas.join('\n')
      } else {
        resposta += '\n• Nenhum colaborador afastado em outra empresa.'
      }

      if (afastadosOutra.length > MAX_DISPLAY_BULLETS) {
        resposta += `\n\n… e outros ${afastadosOutra.length - MAX_DISPLAY_BULLETS} colaborador(es).`
      }

      if (wantsExport && afastadosOutra.length > 0) {
        resposta += '\n\nArquivo .xlsx com os afastados gerado para download.'
        return {
          content: resposta,
          exportableRows: afastadosOutra,
          exportFileName: `afastados-outra-empresa-${todayStr}.xlsx`,
          exportSheetName: 'Afastados',
          autoDownload: true,
          extractedContext: {
            situacao: 'Afastado',
            funcao: effectiveFuncao,
            filial: effectiveFilial,
            lastTopic: 'afastados',
            lastExportableRows: afastadosOutra,
          },
        }
      }

      return {
        content: resposta,
        exportableRows: afastadosOutra.length > 0 ? afastadosOutra : undefined,
        exportFileName: `afastados-outra-empresa-${todayStr}.xlsx`,
        extractedContext: {
          situacao: 'Afastado',
          funcao: effectiveFuncao,
          filial: effectiveFilial,
          lastTopic: 'afastados',
          lastExportableRows: afastadosOutra,
        },
      }
    }

    const afastadosMatriz = afastados.filter((emp) => !emp.company || emp.company === MAIN_COMPANY)
    let resposta = [
      `Existem ${afastados.length} colaborador(es) afastado(s) no total${effectiveFilial ? ` na garagem ${effectiveFilial}` : ''}, sendo ${afastadosMatriz.length} da matriz e ${afastadosOutra.length} em outra empresa.`,
      '',
      'Por empresa:',
      ...groupCount(afastados, (emp) => emp.company || 'Sem empresa').map(
        ([empresa, contagem]) => `• ${empresa}: ${contagem}`,
      ),
    ].join('\n')

    if (wantsExport && afastados.length > 0) {
      resposta +=
        '\n\nPlanilha .xlsx com todos os colaboradores afastados foi gerada para download.'
      return {
        content: resposta,
        exportableRows: afastados,
        exportFileName: `afastados-${todayStr}.xlsx`,
        exportSheetName: 'Afastados',
        autoDownload: true,
        extractedContext: {
          situacao: 'Afastado',
          funcao: effectiveFuncao,
          filial: effectiveFilial,
          lastTopic: 'afastados',
          lastExportableRows: afastados,
        },
      }
    }

    return {
      content: resposta,
      exportableRows: afastados.length > 0 ? afastados : undefined,
      exportFileName: `afastados-${todayStr}.xlsx`,
      extractedContext: {
        situacao: 'Afastado',
        funcao: effectiveFuncao,
        filial: effectiveFilial,
        lastTopic: 'afastados',
        lastExportableRows: afastados,
      },
    }
  }

  // 8. CNHs em geral (situação geral ou a vencer)
  if (mentionsCnh) {
    const targetFuncao = effectiveFuncao || 'Motorista'
    let subset = employees.filter((emp) =>
      normalizeText(emp.funcao).includes(normalizeText(targetFuncao)),
    )
    if (effectiveFilial) {
      subset = subset.filter((emp) => emp.filial === effectiveFilial)
    }

    const subsetVencidos = subset
      .filter((emp) => isCnhVencidaLib(emp, now))
      .sort((a, b) => (a.validade_cnh ?? '').localeCompare(b.validade_cnh ?? ''))

    const aVencer = subset.filter((emp) => {
      if (emp.situacao_cnh !== 'A vencer') return false
      const days = daysUntil(emp.validade_cnh)
      return days !== null && days <= 30
    })

    let resposta = [
      `Situação atual das CNHs de ${targetFuncao.toLowerCase()}s${effectiveFilial ? ` (${effectiveFilial})` : ''}:`,
      `• Vencidas: ${subsetVencidos.length}`,
      `• A vencer (próximos 30 dias): ${aVencer.length}`,
      '',
      'Mais críticas:',
      ...subsetVencidos
        .slice(0, 5)
        .map(
          (emp) =>
            `• ${emp.name} (chapa ${emp.chapa}) — vencida em ${formatDate(emp.validade_cnh)}`,
        ),
    ].join('\n')

    if (wantsExport) {
      resposta += '\n\nArquivo .xlsx com os registros de CNH gerado para download.'
      return {
        content: resposta,
        exportableRows: subsetVencidos,
        exportFileName: `cnhs-${normalizeText(targetFuncao)}-${todayStr}.xlsx`,
        exportSheetName: 'CNHs',
        autoDownload: true,
        extractedContext: {
          funcao: targetFuncao,
          filial: effectiveFilial,
          lastTopic: 'cnh_geral',
          lastExportableRows: subsetVencidos,
        },
      }
    }

    return {
      content: resposta,
      exportableRows: subsetVencidos.length > 0 ? subsetVencidos : undefined,
      exportFileName: `cnhs-${normalizeText(targetFuncao)}-${todayStr}.xlsx`,
      extractedContext: {
        funcao: targetFuncao,
        filial: effectiveFilial,
        lastTopic: 'cnh_geral',
        lastExportableRows: subsetVencidos,
      },
    }
  }

  // 9. Fiscais e Família de Fiscais
  if (
    questionNorm.includes('fiscal') ||
    effectiveFuncao === 'Fiscal' ||
    effectiveFuncao === 'Fiscal de Viajem' ||
    (effectiveFuncoesList.length > 0 &&
      effectiveFuncoesList.some((f) => normalizeText(f).includes('fiscal')))
  ) {
    let fiscais = employees.filter((emp) => {
      if (effectiveFuncoesList.length > 0) {
        return matchesFuncoes(emp.funcao, effectiveFuncoesList)
      }
      return normalizeText(emp.funcao).includes('fiscal')
    })

    if (effectiveFilial) {
      fiscais = fiscais.filter((emp) => emp.filial === effectiveFilial)
    }

    if (effectiveCnhFilter === 'com_cnh') {
      fiscais = fiscais.filter(
        (emp) =>
          Boolean(emp.cnh_numero && emp.cnh_numero.trim() !== '') && emp.situacao_cnh !== 'Sem CNH',
      )
    } else if (effectiveCnhFilter === 'sem_cnh') {
      fiscais = fiscais.filter(
        (emp) => !emp.cnh_numero || emp.cnh_numero.trim() === '' || emp.situacao_cnh === 'Sem CNH',
      )
    }

    const fiscaisAtivos = fiscais.filter((emp) => comparable(emp.situacao) === 'ativo')
    const funcoesDesc =
      effectiveFuncoesList.length > 0
        ? effectiveFuncoesList.join(', ')
        : 'Fiscal (todas as variações)'

    if (questionNorm.includes('ativo') || effectiveSituacao === 'Ativo') {
      const porGaragem = ['CURSINO', 'SAPOPEMBA', 'ITAQUERA', 'GUAIANASES']
        .map((g) => ({
          garagem: g,
          total: fiscaisAtivos.filter((emp) => emp.filial === g).length,
        }))
        .filter((item) => item.total > 0)

      const porFuncao = groupCount(fiscaisAtivos, (emp) => emp.funcao || 'Não informada')

      let resposta = [
        `Existem ${fiscaisAtivos.length} colaborador(es) ativo(s) na família fiscal (${funcoesDesc})${effectiveFilial ? ` na garagem ${effectiveFilial}` : ''}.`,
        '',
        'Distribuição por cargo:',
        ...porFuncao.map(([fnc, count]) => `• ${fnc}: ${count}`),
        ...(porGaragem.length && !effectiveFilial
          ? ['', 'Por garagem:', ...porGaragem.map((item) => `• ${item.garagem}: ${item.total}`)]
          : []),
      ].join('\n')

      if (wantsExport && fiscaisAtivos.length > 0) {
        resposta += '\n\nArquivo .xlsx com os fiscais ativos gerado para download.'
        return {
          content: resposta,
          exportableRows: fiscaisAtivos,
          exportFileName: `fiscais-ativos-${todayStr}.xlsx`,
          exportSheetName: 'Fiscais',
          autoDownload: true,
          extractedContext: {
            funcao: effectiveFuncao,
            funcoesList: effectiveFuncoesList,
            situacao: 'Ativo',
            filial: effectiveFilial,
            cnhFilter: effectiveCnhFilter,
            lastExportableRows: fiscaisAtivos,
          },
        }
      }

      return {
        content: resposta,
        exportableRows: fiscaisAtivos.length > 0 ? fiscaisAtivos : undefined,
        exportFileName: `fiscais-ativos-${todayStr}.xlsx`,
        extractedContext: {
          funcao: effectiveFuncao,
          funcoesList: effectiveFuncoesList,
          situacao: 'Ativo',
          filial: effectiveFilial,
          cnhFilter: effectiveCnhFilter,
          lastExportableRows: fiscaisAtivos,
        },
      }
    }

    const porFuncaoTotal = groupCount(fiscais, (emp) => emp.funcao || 'Não informada')

    let resposta = [
      `A base possui ${fiscais.length} colaborador(es) na família fiscal (${funcoesDesc})${effectiveFilial ? ` na garagem ${effectiveFilial}` : ''}, dos quais ${fiscaisAtivos.length} ativo(s) e ${fiscais.length - fiscaisAtivos.length} em outra situação.`,
      '',
      'Distribuição por cargo:',
      ...porFuncaoTotal.map(([fnc, count]) => `• ${fnc}: ${count}`),
    ].join('\n')

    return {
      content: resposta,
      exportableRows:
        wantsExport && fiscais.length > 0 ? fiscais : fiscais.length > 0 ? fiscais : undefined,
      exportFileName: `fiscais-${todayStr}.xlsx`,
      autoDownload: wantsExport && fiscais.length > 0,
      extractedContext: {
        funcao: effectiveFuncao,
        funcoesList: effectiveFuncoesList,
        filial: effectiveFilial,
        cnhFilter: effectiveCnhFilter,
        lastExportableRows: fiscais,
      },
    }
  }

  // 10. Filial/garagem isolada
  if (explicitFilial) {
    const naGaragem = employees.filter((emp) => emp.filial === explicitFilial)
    const ativosGaragem = naGaragem.filter((emp) => comparable(emp.situacao) === 'ativo').length
    const afastadosGaragem = naGaragem.filter(
      (emp) => comparable(emp.situacao) === 'afastado',
    ).length

    let resposta = [
      `Há ${naGaragem.length} colaborador(es) na garagem ${explicitFilial}:`,
      `• Ativos: ${ativosGaragem}`,
      `• Afastados: ${afastadosGaragem}`,
      `• Desligados/outros: ${naGaragem.length - ativosGaragem - afastadosGaragem}`,
    ].join('\n')

    if (wantsExport && naGaragem.length > 0) {
      resposta += `\n\nArquivo .xlsx com os colaboradores da garagem ${explicitFilial} gerado para download.`
      return {
        content: resposta,
        exportableRows: naGaragem,
        exportFileName: `garagem-${explicitFilial.toLowerCase()}-${todayStr}.xlsx`,
        exportSheetName: explicitFilial,
        autoDownload: true,
        extractedContext: {
          filial: explicitFilial,
          lastExportableRows: naGaragem,
        },
      }
    }

    return {
      content: resposta,
      exportableRows: naGaragem.length > 0 ? naGaragem : undefined,
      exportFileName: `garagem-${explicitFilial.toLowerCase()}-${todayStr}.xlsx`,
      extractedContext: {
        filial: explicitFilial,
        lastExportableRows: naGaragem,
      },
    }
  }

  // 11. Outras empresas
  if (questionNorm.includes('empresa')) {
    const outrasEmpresas = employees.filter(
      (emp) => Boolean(emp.company) && emp.company !== MAIN_COMPANY,
    )
    let resposta = [
      `Existem ${outrasEmpresas.length} registro(s) de outras empresas na base:`,
      ...groupCount(outrasEmpresas, (emp) => emp.company || 'Sem empresa').map(
        ([empresa, total]) => `• ${empresa}: ${total}`,
      ),
    ].join('\n')

    if (wantsExport && outrasEmpresas.length > 0) {
      resposta += '\n\nPlanilha gerada com os registros de outras empresas.'
      return {
        content: resposta,
        exportableRows: outrasEmpresas,
        exportFileName: `outras-empresas-${todayStr}.xlsx`,
        autoDownload: true,
      }
    }

    return { content: resposta }
  }

  // 12. Garagens em geral
  if (questionNorm.includes('garagem')) {
    return {
      content: [
        'Distribuição atual por garagem (filial):',
        ...['CURSINO', 'SAPOPEMBA', 'ITAQUERA', 'GUAIANASES'].map((g) => {
          const total = employees.filter((emp) => emp.filial === g).length
          return `• ${g}: ${total} colaborador(es)`
        }),
        '',
        `Total: ${employees.length}`,
      ].join('\n'),
    }
  }

  // 13. Motoristas em geral
  if (questionNorm.includes('motorista') || explicitFuncao === 'Motorista') {
    let motoristas = employees.filter((emp) => normalizeText(emp.funcao).includes('motorista'))
    if (effectiveFilial) {
      motoristas = motoristas.filter((emp) => emp.filial === effectiveFilial)
    }

    const motoristasVencidos = motoristas.filter((emp) => isCnhVencidaLib(emp, now))
    return {
      content: [
        `A base possui ${motoristas.length} motorista(s)${effectiveFilial ? ` na garagem ${effectiveFilial}` : ''}, dos quais ${motoristasVencidos.length} com a CNH vencida.`,
        ...(!effectiveFilial
          ? [
              '',
              'Por garagem:',
              ...['CURSINO', 'SAPOPEMBA', 'ITAQUERA', 'GUAIANASES'].map((g) => {
                const total = motoristas.filter((emp) => emp.filial === g).length
                return `• ${g}: ${total}`
              }),
            ]
          : []),
      ].join('\n'),
      exportableRows: wantsExport ? motoristas : undefined,
      exportFileName: `motoristas-${todayStr}.xlsx`,
      autoDownload: wantsExport && motoristas.length > 0,
      extractedContext: {
        funcao: 'Motorista',
        filial: effectiveFilial,
        lastExportableRows: motoristas,
      },
    }
  }

  // 14. Ativos em geral
  if (questionNorm.includes('ativo')) {
    let ativos = employees.filter((emp) => comparable(emp.situacao) === 'ativo')
    if (effectiveFuncoesList.length > 0) {
      ativos = ativos.filter((emp) => matchesFuncoes(emp.funcao, effectiveFuncoesList))
    } else if (effectiveFuncao) {
      ativos = ativos.filter((emp) =>
        normalizeText(emp.funcao).includes(normalizeText(effectiveFuncao)),
      )
    }
    if (effectiveFilial) {
      ativos = ativos.filter((emp) => emp.filial === effectiveFilial)
    }
    if (effectiveCnhFilter === 'com_cnh') {
      ativos = ativos.filter(
        (emp) =>
          Boolean(emp.cnh_numero && emp.cnh_numero.trim() !== '') && emp.situacao_cnh !== 'Sem CNH',
      )
    } else if (effectiveCnhFilter === 'sem_cnh') {
      ativos = ativos.filter(
        (emp) => !emp.cnh_numero || emp.cnh_numero.trim() === '' || emp.situacao_cnh === 'Sem CNH',
      )
    }

    const funcaoLabel =
      effectiveFuncoesList.length > 0 ? effectiveFuncoesList.join(', ') : effectiveFuncao

    return {
      content: [
        `A base possui ${ativos.length} colaborador(es) ativo(s) no total${funcaoLabel ? ` na função ${funcaoLabel}` : ''}${effectiveFilial ? ` na garagem ${effectiveFilial}` : ''}.`,
        ...(!effectiveFilial
          ? [
              '',
              'Por garagem:',
              ...['CURSINO', 'SAPOPEMBA', 'ITAQUERA', 'GUAIANASES'].map((g) => {
                const total = ativos.filter((emp) => emp.filial === g).length
                return `• ${g}: ${total}`
              }),
            ]
          : []),
      ].join('\n'),
      exportableRows: wantsExport ? ativos : undefined,
      exportFileName: `ativos-${todayStr}.xlsx`,
      autoDownload: wantsExport && ativos.length > 0,
      extractedContext: {
        situacao: 'Ativo',
        funcao: effectiveFuncao,
        funcoesList: effectiveFuncoesList,
        filial: effectiveFilial,
        cnhFilter: effectiveCnhFilter,
        lastExportableRows: ativos,
      },
    }
  }

  // 15. Pergunta genérica por exportação / planilha
  if (wantsExport) {
    return {
      content: `Gerei uma planilha com todos os ${employees.length} colaboradores da base de dados. O download foi iniciado automaticamente.`,
      exportableRows: employees,
      exportFileName: defaultExportName,
      exportSheetName: 'Colaboradores',
      autoDownload: true,
    }
  }

  // 16. Contagem total
  if (
    questionNorm.includes('colaborador') ||
    questionNorm.includes('quantos') ||
    questionNorm.includes('total')
  ) {
    let pool = [...employees]
    if (effectiveFilial) {
      pool = pool.filter((emp) => emp.filial === effectiveFilial)
    }
    if (effectiveFuncoesList.length > 0) {
      pool = pool.filter((emp) => matchesFuncoes(emp.funcao, effectiveFuncoesList))
    } else if (effectiveFuncao) {
      pool = pool.filter((emp) =>
        normalizeText(emp.funcao).includes(normalizeText(effectiveFuncao)),
      )
    }

    const ativos = pool.filter((emp) => comparable(emp.situacao) === 'ativo').length
    const afastados = pool.filter((emp) => comparable(emp.situacao) === 'afastado').length
    const desligados = pool.filter((emp) => comparable(emp.situacao) === 'desligado').length
    const escopoDesc = effectiveFuncao ? ` da função ${effectiveFuncao}` : ''
    const filialDesc = effectiveFilial ? ` na garagem ${effectiveFilial}` : ''

    return {
      content: [
        `A base de colaboradores possui ${pool.length} registro(s)${escopoDesc}${filialDesc}:`,
        `• Ativos: ${ativos}`,
        `• Afastados: ${afastados}`,
        `• Desligados: ${desligados}`,
      ].join('\n'),
      exportableRows: wantsExport && pool.length > 0 ? pool : undefined,
      exportFileName: `contagem-colaboradores-${todayStr}.xlsx`,
      autoDownload: wantsExport && pool.length > 0,
      extractedContext: {
        funcao: effectiveFuncao,
        funcoesList: effectiveFuncoesList,
        filial: effectiveFilial,
        situacao: effectiveSituacao,
        lastExportableRows: pool,
      },
    }
  }

  // 17. Se houver contexto anterior com exportableRows e o usuário fez uma pergunta de retomada não mapeada
  if (
    prevContext.lastExportableRows &&
    prevContext.lastExportableRows.length > 0 &&
    isReferenceQuery
  ) {
    return {
      content: `Mantenho o contexto com os ${prevContext.lastExportableRows.length} colaborador(es) anteriores. Você pode me pedir para filtrar por quem tem CNH, quem não tem, garagem, situação ou solicitar a planilha.`,
      exportableRows: prevContext.lastExportableRows,
      extractedContext: prevContext,
    }
  }

  return {
    content:
      'Posso ajudar com consultas detalhadas da base:\n' +
      '• Datas: "Quais funcionários terão a CNH vencida no mês 09/2026?", "CNHs vencendo até 12/2026"\n' +
      '• Funcionário específico: "CNH do José Carlos", "Dados da chapa 003054"\n' +
      '• Combinações: "Motoristas da Cursino com CNH vencida em 09/2026", "Afastados da Sapopemba"\n' +
      '• Continuidade no chat: "e os vencidos no mês 09?", "dessa lista, quem é da Sapopemba?"\n' +
      '• Exportação: adicione "gere uma planilha" ou "exporte para excel" a qualquer consulta.',
  }
}

/**
 * Função principal pública exportada com proteção contra repetição idêntica de respostas.
 */
export function processAssistantQuery(
  rawQuestion: string,
  employees: Employee[],
  historyOrNow?: ConversationHistoryMessage[] | Date,
  maybeNow?: Date,
): AssistantAnswer {
  let history: ConversationHistoryMessage[] = []
  let now = new Date()

  if (Array.isArray(historyOrNow)) {
    history = historyOrNow
    if (maybeNow instanceof Date) {
      now = maybeNow
    }
  } else if (historyOrNow instanceof Date) {
    now = historyOrNow
  }

  const result = internalProcessAssistantQuery(rawQuestion, employees, history, now)

  // Verificação de não-repetição:
  // Se a resposta calculada for idêntica à última resposta do assistente no histórico,
  // verificamos se o usuário forneceu uma pergunta com intenção ou filtro novo.
  if (history && history.length > 0) {
    const lastAssistantMsg = [...history].reverse().find((m) => m.role === 'assistant')
    if (lastAssistantMsg && lastAssistantMsg.content.trim() === result.content.trim()) {
      // Se o usuário pediu um filtro que resultou na mesma contagem ou se o filtro não alterou os dados,
      // explicitamos para o usuário que a lista não mudou com esse critério.
      result.content = `Com os critérios solicitados, o resultado permanece o mesmo da resposta anterior:\n\n${result.content}`
    }
  }

  return result
}
