import { describe, it, expect } from 'vitest'
import {
  processAssistantQuery,
  extractFuncoesList,
  matchesFuncoes,
  extractCnhPresenceFilter,
  isFutureVencimentoQuery,
  ConversationHistoryMessage,
} from './assistantEngine'
import { Employee } from './types'

// Mock de colaboradores representativos para os testes cobrindo fiscais, situações de CNH e datas
function createEmployee(data: Partial<Employee> & { id: string; name: string }): Employee {
  return {
    id: data.id,
    name: data.name,
    chapa: data.chapa ?? '',
    registro: data.registro ?? '',
    funcao: data.funcao ?? '',
    filial: data.filial ?? 'CURSINO',
    situacao: data.situacao ?? 'Ativo',
    company: data.company ?? 'Via Sudeste Transportes',
    motivo_afastamento: data.motivo_afastamento ?? null,
    inicio_afastamento: data.inicio_afastamento ?? null,
    previsao_retorno: data.previsao_retorno ?? null,
    cnh_numero: data.cnh_numero ?? '',
    cnh_categoria: data.cnh_categoria ?? '',
    validade_cnh: data.validade_cnh ?? null,
    situacao_cnh: data.situacao_cnh ?? 'Válida',
    documento_fiscal: null,
    validade_documento_fiscal: null,
    created: '2025-01-01',
    updated: '2025-01-01',
  }
}

const mockEmployees: Employee[] = [
  // Fiscais com CNH
  createEmployee({
    id: '1',
    name: 'SILVIO CESAR DE SOUZA',
    chapa: '003054',
    registro: '003054',
    funcao: 'Fiscal de Viajem',
    filial: 'CURSINO',
    situacao: 'Ativo',
    cnh_numero: '12345678901',
    cnh_categoria: 'AB',
    validade_cnh: '2024-05-10', // Vencida no momento (em relação a 2025)
    situacao_cnh: 'Vencida',
  }),
  createEmployee({
    id: '2',
    name: 'JOSE ROBERTO DA COSTA',
    chapa: '004123',
    registro: '004123',
    funcao: 'Fiscal I',
    filial: 'CURSINO',
    situacao: 'Ativo',
    cnh_numero: '23456789012',
    cnh_categoria: 'B',
    validade_cnh: '2026-11-20', // Futura
    situacao_cnh: 'A vencer',
  }),
  createEmployee({
    id: '3',
    name: 'CARLOS ALBERTO PEREIRA',
    chapa: '005555',
    registro: '005555',
    funcao: 'Fiscal II',
    filial: 'CURSINO',
    situacao: 'Ativo',
    cnh_numero: '34567890123',
    cnh_categoria: 'D',
    validade_cnh: '2027-03-15', // Futura
    situacao_cnh: 'A vencer',
  }),
  createEmployee({
    id: '4',
    name: 'MARCOS ANTONIO SILVA',
    chapa: '006789',
    registro: '006789',
    funcao: 'Fiscal III',
    filial: 'CURSINO',
    situacao: 'Ativo',
    cnh_numero: '45678901234',
    cnh_categoria: 'AD',
    validade_cnh: '2025-01-15', // Vencida em relação a 2025-06
    situacao_cnh: 'Vencida',
  }),
  createEmployee({
    id: '5',
    name: 'PAULO HENRIQUE SOUZA',
    chapa: '007890',
    registro: '007890',
    funcao: 'Aux. De Fiscal',
    filial: 'CURSINO',
    situacao: 'Ativo',
    cnh_numero: '56789012345',
    cnh_categoria: 'B',
    validade_cnh: '2026-09-15', // Vence exatamente em 09/2026
    situacao_cnh: 'A vencer',
  }),
  // Fiscais SEM CNH
  createEmployee({
    id: '6',
    name: 'ANA PAULA FERREIRA',
    chapa: '008901',
    registro: '008901',
    funcao: 'Fiscal I',
    filial: 'CURSINO',
    situacao: 'Ativo',
    cnh_numero: '',
    cnh_categoria: '',
    validade_cnh: null,
    situacao_cnh: 'Sem CNH',
  }),
  createEmployee({
    id: '7',
    name: 'JULIANA SANTOS',
    chapa: '009012',
    registro: '009012',
    funcao: 'Aux. De Fiscal',
    filial: 'CURSINO',
    situacao: 'Ativo',
    cnh_numero: '',
    cnh_categoria: '',
    validade_cnh: null,
    situacao_cnh: 'Sem CNH',
  }),
  // Motorista
  createEmployee({
    id: '8',
    name: 'JOAO MOTORISTA',
    chapa: '010111',
    registro: '010111',
    funcao: 'Motorista',
    filial: 'CURSINO',
    situacao: 'Ativo',
    cnh_numero: '99999999999',
    cnh_categoria: 'D',
    validade_cnh: '2026-09-22',
    situacao_cnh: 'A vencer',
  }),
]

describe('assistantEngine - Conversa Real e 5 Pontos de Correção', () => {
  const testNow = new Date('2025-06-01T12:00:00Z')

  it('1. Detecção de funções e casamento por família/radical fiscal', () => {
    const list = extractFuncoesList(
      'leve em consideração também os fiscais I, fiscal II, e fiscal III e aux. de fiscal',
    )
    expect(list).toContain('Fiscal I')
    expect(list).toContain('Fiscal II')
    expect(list).toContain('Fiscal III')
    expect(list).toContain('Aux. de Fiscal')

    // Radical fiscal casa com todas as variações
    expect(matchesFuncoes('Fiscal de Viajem', ['Fiscal'])).toBe(true)
    expect(matchesFuncoes('Fiscal I', ['Fiscal'])).toBe(true)
    expect(matchesFuncoes('Fiscal II', ['Fiscal'])).toBe(true)
    expect(matchesFuncoes('Fiscal III', ['Fiscal'])).toBe(true)
    expect(matchesFuncoes('Aux. De Fiscal', ['Fiscal'])).toBe(true)
    expect(matchesFuncoes('Aux. De Fiscal', ['Aux. de Fiscal'])).toBe(true)
    expect(matchesFuncoes('Motorista', ['Fiscal'])).toBe(false)
  })

  it('2. Detecção de filtros de presença de CNH (tem CNH vs não tem CNH)', () => {
    expect(extractCnhPresenceFilter('os que tem CNH')).toBe('com_cnh')
    expect(extractCnhPresenceFilter('me liste somente os que tem CNH')).toBe('com_cnh')
    expect(extractCnhPresenceFilter('esses não tem CNH')).toBe('sem_cnh')
    expect(extractCnhPresenceFilter('quais estão sem cnh')).toBe('sem_cnh')
    expect(extractCnhPresenceFilter('motoristas da cursino')).toBeNull()
  })

  it('3. Detecção de vencimentos futuros', () => {
    expect(isFutureVencimentoQuery('e as datas que vão vencer futuramente')).toBe(true)
    expect(isFutureVencimentoQuery('e nos próximos meses/anos')).toBe(true)
    expect(isFutureVencimentoQuery('cnhs a vencer')).toBe(true)
    expect(isFutureVencimentoQuery('quais estão vencidas')).toBe(false)
  })

  it('4. Simulação sequencial da conversa real completa', () => {
    const history: ConversationHistoryMessage[] = []

    // Turno 1: "Algum fiscal terá sua CNH vencida no mês 09/2026?"
    const q1 = 'Algum fiscal terá sua CNH vencida no mês 09/2026?'
    const a1 = processAssistantQuery(q1, mockEmployees, history, testNow)
    expect(a1.content).toContain('vencimento em 09/2026')
    // Deve encontrar Paulo Henrique Souza (Aux. De Fiscal) com vencimento em 09/2026
    expect(a1.content).toContain('PAULO HENRIQUE SOUZA')
    history.push({ role: 'user', content: q1 })
    history.push({ role: 'assistant', content: a1.content, exportableRows: a1.exportableRows })

    // Turno 2: "leve em consideração também os fiscais I, fiscal II, e fiscal III e aux. de fiscal"
    const q2 = 'leve em consideração também os fiscais I, fiscal II, e fiscal III e aux. de fiscal'
    const a2 = processAssistantQuery(q2, mockEmployees, history, testNow)
    // Não pode ignorar! Deve incluir as variações
    expect(a2.content).toContain('Fiscal I')
    expect(a2.content).toContain('PAULO HENRIQUE SOUZA')
    history.push({ role: 'user', content: q2 })
    history.push({ role: 'assistant', content: a2.content, exportableRows: a2.exportableRows })

    // Turno 3: "quais deles terão sua CNH vencida?"
    // Correção do Ponto 2: pergunta genérica sobre vencidas NÃO deve herdar 09/2026!
    const q3 = 'quais deles terão sua CNH vencida?'
    const a3 = processAssistantQuery(q3, mockEmployees, history, testNow)
    // Não pode dizer "nenhum para 09/2026"! Deve trazer as CNHs vencidas no geral dos fiscais
    expect(a3.content).not.toContain('09/2026')
    expect(a3.content).toContain('com a CNH vencida')
    expect(a3.content).toContain('SILVIO CESAR DE SOUZA') // Validade 2024-05-10
    expect(a3.content).toContain('MARCOS ANTONIO SILVA') // Validade 2025-01-15
    history.push({ role: 'user', content: q3 })
    history.push({ role: 'assistant', content: a3.content, exportableRows: a3.exportableRows })

    // Turno 4: "me mande a data de vencimento de cada um"
    const q4 = 'me mande a data de vencimento de cada um'
    const a4 = processAssistantQuery(q4, mockEmployees, history, testNow)
    expect(a4.content).toContain('Data de vencimento')
    expect(a4.content).toContain('SILVIO CESAR DE SOUZA')
    expect(a4.content).toContain('MARCOS ANTONIO SILVA')
    history.push({ role: 'user', content: q4 })
    history.push({ role: 'assistant', content: a4.content, exportableRows: a4.exportableRows })

    // Turno 5: "e as datas que vão vencer futuramente"
    // Correção do Ponto 3: CNHs a vencer futuramente mantendo os filtros de função (fiscais)
    const q5 = 'e as datas que vão vencer futuramente'
    const a5 = processAssistantQuery(q5, mockEmployees, history, testNow)
    expect(a5.content).toContain('a vencer futuramente')
    // Deve trazer JOSE ROBERTO DA COSTA (2026-11), PAULO HENRIQUE (2026-09), CARLOS ALBERTO (2027-03)
    // NÃO deve trazer o motorista Joao Motorista
    expect(a5.content).toContain('PAULO HENRIQUE SOUZA')
    expect(a5.content).toContain('JOSE ROBERTO DA COSTA')
    expect(a5.content).toContain('CARLOS ALBERTO PEREIRA')
    expect(a5.content).not.toContain('JOAO MOTORISTA')
    history.push({ role: 'user', content: q5 })
    history.push({ role: 'assistant', content: a5.content, exportableRows: a5.exportableRows })

    // Turno 6: "os que tem CNH"
    // Correção do Ponto 4: filtrar somente os que tem CNH cadastrada da listagem anterior
    const q6 = 'os que tem CNH'
    const a6 = processAssistantQuery(q6, mockEmployees, history, testNow)
    expect(a6.content).toContain('com CNH cadastrada')
    expect(a6.content).toContain('PAULO HENRIQUE SOUZA')
    expect(a6.content).not.toContain('ANA PAULA FERREIRA') // Está sem CNH
    history.push({ role: 'user', content: q6 })
    history.push({ role: 'assistant', content: a6.content, exportableRows: a6.exportableRows })

    // Turno 7: "esses não tem CNH"
    // Correção do Ponto 4: aplicar filtro inverso
    const q7 = 'esses não tem CNH'
    const a7 = processAssistantQuery(q7, mockEmployees, history, testNow)
    // Como a lista anterior só tinha CNHs futuras (todas tinham CNH), deve informar que nenhum está sem CNH
    // ou filtrar colaboradores sem CNH corretamente
    expect(a7.content).not.toEqual(a6.content) // Ponto 5: NUNCA repetir resposta idêntica!
    expect(a7.content).toMatch(/sem CNH|nenhum está sem CNH|nenhum possui/i)
  })

  it('5. Ponto 5: Nunca repetir resposta idêntica quando critérios são alterados', () => {
    const history: ConversationHistoryMessage[] = [
      {
        role: 'user',
        content: 'me liste os que tem CNH',
      },
      {
        role: 'assistant',
        content: 'Existem colaboradores com CNH cadastrada...',
      },
    ]

    const ans = processAssistantQuery('esses não tem CNH', mockEmployees, history, testNow)
    expect(ans.content).not.toBe(history[1].content)
  })
})
