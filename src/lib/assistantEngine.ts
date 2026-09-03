import * as XLSX from 'xlsx'
import { daysUntil, formatCnh, formatDate } from '@/lib/format'
import { comparable, isCnhVencida as isCnhVencidaLib } from '@/lib/normalize'
import type { Employee } from '@/lib/types'

export interface AssistantAnswer {
  content: string
  exportableRows?: Employee[]
  exportFileName?: string
  exportSheetName?: string
  autoDownload?: boolean
  matchedEmployee?: Employee
}

const MAIN_COMPANY = 'Via Sudeste Transportes'

const MONTH_NAMES_MAP: Record<string, number> = {
  janeiro: 1,
  jan: 1,
  fevereiro: 2,
  fev: 2,
  marco: 3,
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
  // Ex: "entre 01/2026 e 12/2026", "entre janeiro de 2026 e marco de 2026"
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

  // 8. Padrão genérico de mês/ano ou ano isolado
  return extractSingleDateOrMonth(q, now)
}

function extractSingleDateOrMonth(text: string, _now = new Date()): DateFilter | null {
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

/** Detecta função na pergunta */
export function extractFuncao(question: string): string | null {
  const q = normalizeText(question)
  if (q.includes('motorist')) return 'Motorista'
  if (q.includes('fiscal')) return 'Fiscal de Viajem'
  if (q.includes('cobrador')) return 'Cobrador'
  if (q.includes('auxiliar') || q.includes('administrativ')) return 'Auxiliar Administrativo'
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
 * Busca funcionário específico por chapa/registro ou nome.
 */
export function findSpecificEmployee(question: string, employees: Employee[]): Employee | null {
  const raw = question.trim()
  const qNorm = normalizeText(question)

  // 1. Busca por chapa ou registro explícito
  // Ex: "chapa 013233", "chapa: 013233", "registro 000055", "chapa 55"
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
  // Ex: "funcionario JOSE CARLOS", "colaborador JOAO DA SILVA", "cnh do JOSE CARLOS"
  const nameIntroMatch = raw.match(
    /(?:funcionario|colaborador|motorista|fiscal|cnh\s+do|cnh\s+da|sobre\s+o|sobre\s+a)\s+([A-Za-zÀ-ÖØ-öø-ÿ\s]{3,})/i,
  )
  if (nameIntroMatch) {
    const candidateName = normalizeText(nameIntroMatch[1])
      // Remove trailing stopwords
      .replace(/\s+(?:tem|esta|estah|vence|venceu|com|da|do|de|na|no|em)\b.*/, '')
      .trim()

    if (candidateName.length >= 3) {
      // Procura correspondência exata primeiro, depois prefixo, depois substring
      const exact = employees.find((e) => normalizeText(e.name) === candidateName)
      if (exact) return exact

      const starts = employees.find((e) => normalizeText(e.name).startsWith(candidateName))
      if (starts) return starts

      // Só aceita substring se o termo tiver mais de 4 caracteres (evita falsos positivos como "ana")
      if (candidateName.length >= 4) {
        const contains = employees.find((e) => normalizeText(e.name).includes(candidateName))
        if (contains) return contains
      }
    }
  }

  // 3. Busca por nome próprio se a pergunta parecer um nome de colaborador direto
  // Ex.: "JOSE CARLOS NOVAES" ou "Quem e Lourival Ferreira da Silva?"
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
    { wch: 14 }, // REGISTRO
    { wch: 34 }, // Nome
    { wch: 22 }, // Função
    { wch: 18 }, // Filial/Garagem
    { wch: 20 }, // CNH
    { wch: 12 }, // Categoria
    { wch: 16 }, // Validade
    { wch: 20 }, // Dias para vencer
    { wch: 14 }, // Situação
    { wch: 16 }, // Situação CNH
    { wch: 24 }, // Empresa
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
 */
export function processAssistantQuery(
  rawQuestion: string,
  employees: Employee[],
  now = new Date(),
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

  // 1. Extração de filtros combinados primeiro para evitar falso positivo de colaborador
  const dateFilter = extractDateFilter(rawQuestion, now)
  const isGeneralQuery =
    dateFilter !== null ||
    questionNorm.includes('quantos') ||
    questionNorm.includes('quais') ||
    questionNorm.includes('listar') ||
    questionNorm.includes('lista')

  // Se NÃO for uma pergunta de quantificação/listagem com data/lista, tenta colaborador específico
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
      }
    }
    return {
      content: detail,
      matchedEmployee: specificEmp,
    }
  }
  const filial = extractFilial(rawQuestion)
  const funcao = extractFuncao(rawQuestion)
  const situacao = extractSituacao(rawQuestion)

  // 3. Consultas focadas em CNH com filtro de data ou período
  const mentionsCnh =
    questionNorm.includes('cnh') ||
    questionNorm.includes('habilitac') ||
    questionNorm.includes('carteira')

  const mentionsVencimento =
    questionNorm.includes('venc') ||
    questionNorm.includes('expir') ||
    questionNorm.includes('validade')

  // Se tem filtro de data e menciona CNH ou vencimento OU pergunta "quais funcionários..." com data
  if (dateFilter) {
    // Filtrar funcionários cuja CNH vence no período especificado
    let filtered = employees.filter((emp) => matchesDateFilter(emp.validade_cnh, dateFilter))

    // Filtros combinados opcionais
    if (filial) {
      filtered = filtered.filter((emp) => emp.filial === filial)
    }
    if (funcao) {
      filtered = filtered.filter((emp) => normalizeText(emp.funcao).includes(normalizeText(funcao)))
    }
    if (situacao) {
      filtered = filtered.filter((emp) => comparable(emp.situacao) === comparable(situacao))
    }

    filtered.sort((a, b) => (a.validade_cnh ?? '').localeCompare(b.validade_cnh ?? ''))

    const descDetalhada = [
      filial ? `da garagem ${filial}` : null,
      funcao ? `função ${funcao}` : null,
      situacao ? `situação ${situacao}` : null,
    ]
      .filter(Boolean)
      .join(', ')

    const complementoFiltro = descDetalhada ? ` (${descDetalhada})` : ''

    if (filtered.length === 0) {
      const msg = `Nenhum colaborador com CNH com vencimento para ${dateFilter.description}${complementoFiltro} foi encontrado na base.`
      return { content: msg }
    }

    const total = filtered.length
    const exibidos = filtered.slice(0, MAX_DISPLAY_BULLETS)
    const linhas = exibidos.map(
      (emp) =>
        `• ${emp.name} (chapa ${emp.chapa}) — ${emp.funcao || 'Motorista'} · CNH: ${formatCnh(emp.cnh_categoria, emp.cnh_numero)} · vencimento em ${formatDate(emp.validade_cnh)} (${labelFilial(emp)})`,
    )

    let resposta = `Existem ${total} colaborador(es) com CNH com vencimento em ${dateFilter.description}${complementoFiltro}:`
    resposta += '\n' + linhas.join('\n')

    if (total > MAX_DISPLAY_BULLETS) {
      resposta += `\n\n… e outros ${total - MAX_DISPLAY_BULLETS} colaborador(es). Solicite a planilha para ver a lista completa.`
    }

    if (wantsExport) {
      resposta += `\n\nArquivo .xlsx com todos os ${total} colaborador(es) foi gerado para download.`
      return {
        content: resposta,
        exportableRows: filtered,
        exportFileName: `cnhs-vencimento-${dateFilter.description.replace(/[^a-zA-Z0-9-]/g, '_')}-${todayStr}.xlsx`,
        exportSheetName: 'CNHs',
        autoDownload: true,
      }
    }

    return {
      content: resposta,
      exportableRows: filtered,
      exportFileName: `cnhs-vencimento-${dateFilter.description.replace(/[^a-zA-Z0-9-]/g, '_')}-${todayStr}.xlsx`,
      exportSheetName: 'CNHs',
    }
  }

  // 4. Consultas combinadas sem data específica:
  // Ex.: "afastados da SAPOPEMBA", "fiscais da CURSINO", "motoristas ativos da SAPOPEMBA"
  if (filial && (situacao || funcao)) {
    let filtered = employees.filter((emp) => emp.filial === filial)
    if (situacao) {
      filtered = filtered.filter((emp) => comparable(emp.situacao) === comparable(situacao))
    }
    if (funcao) {
      filtered = filtered.filter((emp) => normalizeText(emp.funcao).includes(normalizeText(funcao)))
    }

    const desc =
      `${situacao ? situacao.toLowerCase() + 's' : ''} ${funcao ? funcao.toLowerCase() + 's' : ''}`.trim()
    if (filtered.length === 0) {
      return {
        content: `Nenhum colaborador encontrado para a garagem ${filial} com os filtros solicitados.`,
      }
    }

    const total = filtered.length
    const exibidos = filtered.slice(0, MAX_DISPLAY_BULLETS)
    const linhas = exibidos.map(
      (emp) =>
        `• ${emp.name} (chapa ${emp.chapa}) — ${emp.funcao || '—'} · sit.: ${emp.situacao || 'Ativo'} · CNH: ${formatCnh(emp.cnh_categoria, emp.cnh_numero)}`,
    )

    let resposta = `Há ${total} colaborador(es) ${desc} na garagem ${filial}:`
    resposta += '\n' + linhas.join('\n')
    if (total > MAX_DISPLAY_BULLETS) {
      resposta += `\n\n… e outros ${total - MAX_DISPLAY_BULLETS} colaborador(es).`
    }

    if (wantsExport) {
      resposta += `\n\nArquivo .xlsx gerado com sucesso.`
      return {
        content: resposta,
        exportableRows: filtered,
        exportFileName: `colaboradores-${filial.toLowerCase()}-${todayStr}.xlsx`,
        exportSheetName: filial,
        autoDownload: true,
      }
    }

    return {
      content: resposta,
      exportableRows: filtered,
      exportFileName: `colaboradores-${filial.toLowerCase()}-${todayStr}.xlsx`,
      exportSheetName: filial,
    }
  }

  // 5. Afastados
  if (questionNorm.includes('afastad')) {
    const afastados = employees.filter((emp) => comparable(emp.situacao) === 'afastado')
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
        }
      }

      return {
        content: resposta,
        exportableRows: afastadosOutra.length > 0 ? afastadosOutra : undefined,
        exportFileName: `afastados-outra-empresa-${todayStr}.xlsx`,
      }
    }

    const afastadosMatriz = afastados.filter((emp) => !emp.company || emp.company === MAIN_COMPANY)
    let resposta = [
      `Existem ${afastados.length} colaborador(es) afastado(s) no total, sendo ${afastadosMatriz.length} da matriz e ${afastadosOutra.length} em outra empresa.`,
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
      }
    }

    return {
      content: resposta,
      exportableRows: afastados.length > 0 ? afastados : undefined,
      exportFileName: `afastados-${todayStr}.xlsx`,
    }
  }

  // 6. CNHs em geral (sem data específica)
  if (mentionsCnh || (mentionsVencimento && questionNorm.includes('motorist'))) {
    const motoristas = employees.filter((emp) => normalizeText(emp.funcao).includes('motorista'))
    const motoristasVencidos = motoristas
      .filter((emp) => isCnhVencidaLib(emp, now))
      .sort((a, b) => (a.validade_cnh ?? '').localeCompare(b.validade_cnh ?? ''))

    if (mentionsVencimento) {
      const exibidos = motoristasVencidos.slice(0, MAX_DISPLAY_BULLETS)
      const linhas = exibidos.map(
        (emp) =>
          `• ${emp.name} (chapa ${emp.chapa}) — vencida em ${formatDate(emp.validade_cnh)} (${labelFilial(emp)})`,
      )

      let resposta = `Existem ${motoristasVencidos.length} motorista(s) com a CNH vencida na base:`
      if (linhas.length) {
        resposta += '\n' + linhas.join('\n')
      } else {
        resposta += '\n• Nenhum motorista com a CNH vencida.'
      }

      if (motoristasVencidos.length > MAX_DISPLAY_BULLETS) {
        resposta += `\n\n… e outros ${motoristasVencidos.length - MAX_DISPLAY_BULLETS} motorista(s). Baixe a planilha para conferir a listagem completa.`
      }

      resposta += '\n\nRegularize essas CNHs para evitar restrições operacionais.'

      if (wantsExport && motoristasVencidos.length > 0) {
        resposta += '\n\nArquivo .xlsx com todos os motoristas vencidos foi gerado para download.'
        return {
          content: resposta,
          exportableRows: motoristasVencidos,
          exportFileName: `cnhs-vencidas-${todayStr}.xlsx`,
          exportSheetName: 'Vencidas',
          autoDownload: true,
        }
      }

      return {
        content: resposta,
        exportableRows: motoristasVencidos.length > 0 ? motoristasVencidos : undefined,
        exportFileName: `cnhs-vencidas-${todayStr}.xlsx`,
        exportSheetName: 'Vencidas',
      }
    }

    // Situação geral de CNHs
    const aVencer = employees.filter((emp) => {
      if (emp.situacao_cnh !== 'A vencer') return false
      const days = daysUntil(emp.validade_cnh)
      return days !== null && days <= 30
    })

    let resposta = [
      'Situação atual das CNHs de motoristas:',
      `• Vencidas: ${motoristasVencidos.length}`,
      `• A vencer (próximos 30 dias): ${aVencer.length}`,
      '',
      'Mais críticas:',
      ...motoristasVencidos
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
        exportableRows: motoristasVencidos,
        exportFileName: `cnhs-motoristas-${todayStr}.xlsx`,
        exportSheetName: 'CNHs',
        autoDownload: true,
      }
    }

    return {
      content: resposta,
      exportableRows: motoristasVencidos.length > 0 ? motoristasVencidos : undefined,
      exportFileName: `cnhs-motoristas-${todayStr}.xlsx`,
    }
  }

  // 7. Fiscais
  if (questionNorm.includes('fiscal')) {
    const fiscais = employees.filter((emp) => normalizeText(emp.funcao).includes('fiscal'))
    const fiscaisAtivos = fiscais.filter((emp) => comparable(emp.situacao) === 'ativo')

    if (questionNorm.includes('ativo')) {
      const porGaragem = ['CURSINO', 'SAPOPEMBA', 'ITAQUERA', 'GUAIANASES']
        .map((g) => ({
          garagem: g,
          total: fiscaisAtivos.filter((emp) => emp.filial === g).length,
        }))
        .filter((item) => item.total > 0)

      let resposta = [
        `Existem ${fiscaisAtivos.length} fiscal(is) de Viajem ativo(s) na base.`,
        ...(porGaragem.length
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
        }
      }

      return {
        content: resposta,
        exportableRows: fiscaisAtivos.length > 0 ? fiscaisAtivos : undefined,
        exportFileName: `fiscais-ativos-${todayStr}.xlsx`,
      }
    }

    return {
      content: `A base possui ${fiscais.length} fiscal(is) de Viajem, dos quais ${fiscaisAtivos.length} ativo(s) e ${fiscais.length - fiscaisAtivos.length} em outra situação.`,
      exportableRows: wantsExport && fiscais.length > 0 ? fiscais : undefined,
      exportFileName: `fiscais-${todayStr}.xlsx`,
      autoDownload: wantsExport && fiscais.length > 0,
    }
  }

  // 8. Filial/garagem isolada
  if (filial) {
    const naGaragem = employees.filter((emp) => emp.filial === filial)
    const ativosGaragem = naGaragem.filter((emp) => comparable(emp.situacao) === 'ativo').length
    const afastadosGaragem = naGaragem.filter(
      (emp) => comparable(emp.situacao) === 'afastado',
    ).length

    let resposta = [
      `Há ${naGaragem.length} colaborador(es) na garagem ${filial}:`,
      `• Ativos: ${ativosGaragem}`,
      `• Afastados: ${afastadosGaragem}`,
      `• Desligados/outros: ${naGaragem.length - ativosGaragem - afastadosGaragem}`,
    ].join('\n')

    if (wantsExport && naGaragem.length > 0) {
      resposta += `\n\nArquivo .xlsx com os colaboradores da garagem ${filial} gerado para download.`
      return {
        content: resposta,
        exportableRows: naGaragem,
        exportFileName: `garagem-${filial.toLowerCase()}-${todayStr}.xlsx`,
        exportSheetName: filial,
        autoDownload: true,
      }
    }

    return {
      content: resposta,
      exportableRows: naGaragem.length > 0 ? naGaragem : undefined,
      exportFileName: `garagem-${filial.toLowerCase()}-${todayStr}.xlsx`,
    }
  }

  // 9. Outras empresas
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

  // 10. Garagens em geral
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

  // 11. Motoristas em geral
  if (questionNorm.includes('motorista')) {
    const motoristas = employees.filter((emp) => normalizeText(emp.funcao).includes('motorista'))
    const motoristasVencidos = motoristas.filter((emp) => isCnhVencidaLib(emp, now))
    return {
      content: [
        `A base possui ${motoristas.length} motorista(s), dos quais ${motoristasVencidos.length} com a CNH vencida.`,
        '',
        'Por garagem:',
        ...['CURSINO', 'SAPOPEMBA', 'ITAQUERA', 'GUAIANASES'].map((g) => {
          const total = motoristas.filter((emp) => emp.filial === g).length
          return `• ${g}: ${total}`
        }),
      ].join('\n'),
      exportableRows: wantsExport ? motoristas : undefined,
      exportFileName: `motoristas-${todayStr}.xlsx`,
      autoDownload: wantsExport && motoristas.length > 0,
    }
  }

  // 12. Ativos em geral
  if (questionNorm.includes('ativo')) {
    const ativos = employees.filter((emp) => comparable(emp.situacao) === 'ativo')
    return {
      content: [
        `A base possui ${ativos.length} colaborador(es) ativo(s) no total.`,
        '',
        'Por garagem:',
        ...['CURSINO', 'SAPOPEMBA', 'ITAQUERA', 'GUAIANASES'].map((g) => {
          const total = ativos.filter((emp) => emp.filial === g).length
          return `• ${g}: ${total}`
        }),
      ].join('\n'),
      exportableRows: wantsExport ? ativos : undefined,
      exportFileName: `ativos-${todayStr}.xlsx`,
      autoDownload: wantsExport && ativos.length > 0,
    }
  }

  // 13. Pergunta genérica por exportação / planilha
  if (wantsExport) {
    return {
      content: `Gerei uma planilha com todos os ${employees.length} colaboradores da base de dados. O download foi iniciado automaticamente.`,
      exportableRows: employees,
      exportFileName: defaultExportName,
      exportSheetName: 'Colaboradores',
      autoDownload: true,
    }
  }

  // 14. Contagem total
  if (
    questionNorm.includes('colaborador') ||
    questionNorm.includes('quantos') ||
    questionNorm.includes('total')
  ) {
    const ativos = employees.filter((emp) => comparable(emp.situacao) === 'ativo').length
    const afastados = employees.filter((emp) => comparable(emp.situacao) === 'afastado').length
    const desligados = employees.filter((emp) => comparable(emp.situacao) === 'desligado').length
    return {
      content: [
        `A base de colaboradores possui ${employees.length} registro(s):`,
        `• Ativos: ${ativos}`,
        `• Afastados: ${afastados}`,
        `• Desligados: ${desligados}`,
      ].join('\n'),
    }
  }

  return {
    content:
      'Posso ajudar com consultas detalhadas da base:\n' +
      '• Datas: "Quais funcionários terão a CNH vencida no mês 09/2026?", "CNHs vencendo até 12/2026"\n' +
      '• Funcionário específico: "CNH do José Carlos", "Dados da chapa 003054"\n' +
      '• Combinações: "Motoristas da Cursino com CNH vencida em 09/2026", "Afastados da Sapopemba"\n' +
      '• Exportação: adicione "gere uma planilha" ou "exporte para excel" a qualquer consulta.',
  }
}
