import type { Employee } from '@/lib/types'

/**
 * Normalização centralizada dos registros carregados da base:
 * - remove espaços das pontas de todos os campos de texto;
 * - canonicaliza a função (MOTORISTA → Motorista, FISCAL DE VIAJEM/VIAGEM →
 *   Fiscal de Viajem, COBRADOR → Cobrador), para que as contagens da tela
 *   comparem sempre com os valores canônicos, sem depender de caixa.
 *
 * Aplicada UMA VEZ, ao carregar os registros — nenhum outro ponto do app
 * precisa repetir essa lógica.
 */

/** Capitalização canônica das funções usadas nos cards e filtros. */
const FUNCOES_CANONICAS: Record<string, string> = {
  motorista: 'Motorista',
  fiscal: 'Fiscal de Viajem',
  'fiscal de viajem': 'Fiscal de Viajem',
  'fiscal de viagem': 'Fiscal de Viajem',
  cobrador: 'Cobrador',
  'auxiliar administrativo': 'Auxiliar Administrativo',
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Chave de comparação: sem acentos, minúscula, espaços colapsados. */
function key(value: string): string {
  return stripAccents(value).toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Função canônica: aceita qualquer caixa/variação e devolve o valor fixo. */
export function normalizeFuncao(value?: string | null): string {
  const raw = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!raw) return ''
  return FUNCOES_CANONICAS[key(raw)] ?? raw
}

/** Situação canônica (Ativo/Afastado/Desligado), sem depender de caixa. */
export function normalizeSituacao(value?: string | null): string {
  const raw = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!raw) return ''
  const k = key(raw)
  if (k.startsWith('deslig')) return 'Desligado'
  if (
    k.startsWith('afast') ||
    k.startsWith('licen') ||
    k.startsWith('feria') ||
    k.startsWith('suspend')
  ) {
    return 'Afastado'
  }
  if (k.startsWith('ativ')) return 'Ativo'
  return raw
}

/** Texto comparável: sem acentos, minúscula, trim. */
export function comparable(value?: string | null): string {
  return key(String(value ?? ''))
}

/** Parse tolerante de data (dd/MM/yyyy ou ISO). Devolve '' quando inválida. */
export function parseFlexibleDate(value?: string | null): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (br) {
    return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')} 12:00:00.000Z`
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().replace('T', ' ')
}

/**
 * Normaliza a lista de colaboradores carregada da base, uma única vez.
 * Campos de data passam pelo parse tolerante; situação e função ficam canônicas.
 */
export function normalizeEmployees(employees: Employee[]): Employee[] {
  return employees.map((employee) => ({
    ...employee,
    chapa: (employee.chapa ?? '').trim(),
    name: (employee.name ?? '').trim(),
    company: (employee.company ?? '').trim(),
    filial: ((employee.filial ?? '') as Employee['filial']).trim() as Employee['filial'],
    funcao: normalizeFuncao(employee.funcao),
    situacao: normalizeSituacao(employee.situacao) as Employee['situacao'],
    cnh_numero: (employee.cnh_numero ?? '').trim(),
    cnh_categoria: (employee.cnh_categoria ?? '').trim(),
    validade_cnh: parseFlexibleDate(employee.validade_cnh),
    situacao_cnh: (
      (employee.situacao_cnh ?? '') as Employee['situacao_cnh']
    ).trim() as Employee['situacao_cnh'],
    motivo_afastamento: (employee.motivo_afastamento ?? '').trim(),
    inicio_afastamento: parseFlexibleDate(employee.inicio_afastamento),
    previsao_retorno: parseFlexibleDate(employee.previsao_retorno),
    documento_fiscal: (employee.documento_fiscal ?? '').trim(),
    validade_documento_fiscal: parseFlexibleDate(employee.validade_documento_fiscal),
    registro: (employee.registro ?? '').trim(),
    cpf: (employee.cpf ?? '').trim(),
  }))
}

/**
 * A CNH está vencida? Compara o status/situação sem depender de caixa
 * ("Vencida", "VENCIDA", "vencida", "Vencida CNH") e, quando o status indica
 * vencimento, também considera a data de validade já passada.
 */
export function isCnhVencida(employee: Employee, now = new Date()): boolean {
  const status = comparable(employee.situacao_cnh)
  if (status === 'vencida' || status === 'vencida cnh') return true
  if (status === 'sem cnh') return false
  const validade = parseFlexibleDate(employee.validade_cnh)
  if (!validade) return false
  // Situação não diz nada sobre vencimento: decide pela data de validade.
  const somenteData = validade.slice(0, 10)
  return Date.parse(`${somenteData}T23:59:59.999Z`) < now.getTime()
}
