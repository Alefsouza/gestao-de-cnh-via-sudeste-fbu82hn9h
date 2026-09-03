import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Database, Loader2, MessageCircleQuestion, Send, Sparkles } from 'lucide-react'

import { useRealtime } from '@/hooks/use-realtime'
import { daysUntil, formatDate } from '@/lib/format'
import { listAllEmployees } from '@/services/employees'
import type { Employee } from '@/lib/types'
import { comparable, normalizeEmployees } from '@/lib/normalize'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const MAIN_COMPANY = 'Via Sudeste Transportes'

const BOAS_VINDAS =
  'Olá. Já analisei a matriz. Posso consultar ativos, afastados, outras empresas, filiais, garagens, fiscais e CNHs vencidas de motoristas.'

const SUGESTOES = [
  'Quantos afastados estão em outra empresa?',
  'Quantos motoristas estão com a CNH vencida?',
  'Quantos fiscais estão ativos?',
  'Quantos colaboradores há no Cursino?',
]

/** Garagens/filiais disponíveis na base (CURSINO e SAPOPEMBA são as originais). */
const GARAGENS = ['CURSINO', 'SAPOPEMBA', 'ITAQUERA', 'GUAIANASES'] as const

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** CNH vencida: pela situação registrada ou pela data (quando a situação vier vazia). */
function isCnhVencida(employee: Employee): boolean {
  const situacao = employee.situacao_cnh as string
  if (situacao === 'Vencida' || situacao === 'Vencida CNH') return true
  if (situacao === 'Válida' || situacao === 'A vencer' || situacao === 'Sem CNH') return false
  const days = daysUntil(employee.validade_cnh)
  return days !== null && days < 0
}

function isOutraEmpresa(employee: Employee): boolean {
  return Boolean(employee.company) && employee.company !== MAIN_COMPANY
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

function labelFilial(employee: Employee): string {
  return employee.filial || 'Sem filial'
}

/** Gera a resposta do assistente a partir dos dados atuais da base (sem API externa). */
function buildAnswer(rawQuestion: string, employees: Employee[]): string {
  const question = normalize(rawQuestion)

  if (employees.length === 0) {
    return 'A base de colaboradores não possui registros no momento. Assim que houver dados importados, poderei responder suas consultas.'
  }

  const afastados = employees.filter((employee) => comparable(employee.situacao) === 'afastado')
  const afastadosOutra = afastados.filter(isOutraEmpresa)
  const outrasEmpresas = employees.filter(isOutraEmpresa)
  const motoristas = employees.filter((employee) =>
    normalize(employee.funcao).includes('motorista'),
  )
  const motoristasVencidos = motoristas
    .filter(isCnhVencida)
    .sort((a, b) => (a.validade_cnh ?? '').localeCompare(b.validade_cnh ?? ''))
  const fiscais = employees.filter((employee) => normalize(employee.funcao).includes('fiscal'))
  const fiscaisAtivos = fiscais.filter((employee) => comparable(employee.situacao) === 'ativo')
  const ativos = employees.filter((employee) => comparable(employee.situacao) === 'ativo')
  const desligados = employees.filter((employee) => comparable(employee.situacao) === 'desligado')

  // --- Afastados -----------------------------------------------------------
  if (question.includes('afastad')) {
    const perguntaOutra =
      question.includes('outra') || question.includes('outras') || question.includes('outra(s)')

    if (perguntaOutra) {
      const linhas = afastadosOutra.map(
        (employee) =>
          `• ${employee.name} (chapa ${employee.chapa}) — ${employee.company || 'empresa não informada'} · motivo: ${employee.motivo_afastamento || 'não informado'} · retorno previsto para ${formatDate(employee.previsao_retorno)}`,
      )
      return [
        `Existem ${afastadosOutra.length} colaborador(es) afastado(s) em outra empresa:`,
        ...(linhas.length ? linhas : ['• Nenhum colaborador afastado em outra empresa.']),
      ].join('\n')
    }

    const afastadosMatriz = afastados.filter((employee) => !isOutraEmpresa(employee))
    return [
      `Existem ${afastados.length} colaborador(es) afastado(s) no total, sendo ${afastadosMatriz.length} da matriz e ${afastadosOutra.length} em outra empresa.`,
      '',
      'Por empresa:',
      ...groupCount(afastados, (employee) => employee.company || 'Sem empresa').map(
        ([empresa, total]) => `• ${empresa}: ${total}`,
      ),
    ].join('\n')
  }

  // --- CNHs ----------------------------------------------------------------
  if (question.includes('cnh')) {
    if (question.includes('vencid')) {
      const linhas = motoristasVencidos.map(
        (employee) =>
          `• ${employee.name} (chapa ${employee.chapa}) — vencida em ${formatDate(employee.validade_cnh)} (${labelFilial(employee)})`,
      )
      return [
        `Existem ${motoristasVencidos.length} motorista(s) com a CNH vencida:`,
        ...(linhas.length ? linhas : ['• Nenhum motorista com a CNH vencida.']),
        '',
        'Regularize essas CNHs para evitar restrições operacionais.',
      ].join('\n')
    }

    const aVencer = employees.filter((employee) => {
      if (employee.situacao_cnh !== 'A vencer') return false
      const days = daysUntil(employee.validade_cnh)
      return days !== null && days <= 30
    })

    return [
      'Situação atual das CNHs de motoristas:',
      `• Vencidas: ${motoristasVencidos.length}`,
      `• A vencer (30 dias): ${aVencer.length}`,
      '',
      'Mais críticas:',
      ...motoristasVencidos
        .slice(0, 5)
        .map(
          (employee) =>
            `• ${employee.name} (chapa ${employee.chapa}) — vencida em ${formatDate(employee.validade_cnh)}`,
        ),
    ].join('\n')
  }

  // --- Fiscais -------------------------------------------------------------
  if (question.includes('fiscal')) {
    if (question.includes('ativo')) {
      const porGaragem = GARAGENS.map((garagem) => ({
        garagem,
        total: fiscaisAtivos.filter((employee) => employee.filial === garagem).length,
      })).filter((item) => item.total > 0)

      return [
        `Existem ${fiscaisAtivos.length} fiscal(is) de Viajem ativo(s) na base.`,
        ...(porGaragem.length
          ? ['', 'Por garagem:', ...porGaragem.map((item) => `• ${item.garagem}: ${item.total}`)]
          : []),
      ].join('\n')
    }

    return `A base possui ${fiscais.length} fiscal(is) de Viajem, dos quais ${fiscaisAtivos.length} ativo(s) e ${fiscais.length - fiscaisAtivos.length} em outra situação.`
  }

  // --- Filial/garagem específica --------------------------------------------
  const garagemDetectada = GARAGENS.find((garagem) => question.includes(normalize(garagem)))
  if (garagemDetectada) {
    const naGaragem = employees.filter((employee) => employee.filial === garagemDetectada)
    const ativosGaragem = naGaragem.filter(
      (employee) => comparable(employee.situacao) === 'ativo',
    ).length
    const afastadosGaragem = naGaragem.filter(
      (employee) => comparable(employee.situacao) === 'afastado',
    ).length
    return [
      `Há ${naGaragem.length} colaborador(es) na garagem ${garagemDetectada}:`,
      `• Ativos: ${ativosGaragem}`,
      `• Afastados: ${afastadosGaragem}`,
      `• Desligados/sem situação: ${naGaragem.length - ativosGaragem - afastadosGaragem}`,
    ].join('\n')
  }

  // --- Outras empresas -----------------------------------------------------
  if (question.includes('empresa')) {
    return [
      `Existem ${outrasEmpresas.length} registro(s) de outras empresas na base:`,
      ...groupCount(outrasEmpresas, (employee) => employee.company || 'Sem empresa').map(
        ([empresa, total]) => `• ${empresa}: ${total}`,
      ),
    ].join('\n')
  }

  // --- Distribuição por garagem ---------------------------------------------
  if (question.includes('garagem')) {
    return [
      'Distribuição atual por garagem (filial):',
      ...GARAGENS.map((garagem) => {
        const total = employees.filter((employee) => employee.filial === garagem).length
        return `• ${garagem}: ${total} colaborador(es)`
      }),
      '',
      `Total: ${employees.length}`,
    ].join('\n')
  }

  // --- Motoristas ----------------------------------------------------------
  if (question.includes('motorista')) {
    return [
      `A base possui ${motoristas.length} motorista(s), dos quais ${motoristasVencidos.length} com a CNH vencida.`,
      '',
      'Por garagem:',
      ...GARAGENS.map((garagem) => {
        const total = motoristas.filter((employee) => employee.filial === garagem).length
        return `• ${garagem}: ${total}`
      }),
    ].join('\n')
  }

  // --- Ativos --------------------------------------------------------------
  if (question.includes('ativo')) {
    return [
      `A base possui ${ativos.length} colaborador(es) ativo(s) no total.`,
      '',
      'Por garagem:',
      ...GARAGENS.map((garagem) => {
        const total = ativos.filter((employee) => employee.filial === garagem).length
        return `• ${garagem}: ${total}`
      }),
    ].join('\n')
  }

  // --- Total de colaboradores ------------------------------------------------
  if (question.includes('colaborador') || question.includes('quantos')) {
    return [
      `A base de colaboradores possui ${employees.length} registro(s):`,
      `• Ativos: ${ativos.length}`,
      `• Afastados: ${afastados.length}`,
      `• Desligados: ${desligados.length}`,
    ].join('\n')
  }

  return 'Posso ajudar com informações sobre ativos, afastados, outras empresas, filiais, garagens, fiscais e CNHs vencidas de motoristas. Experimente uma das perguntas sugeridas.'
}

export default function AssistenteIA() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: BOAS_VINDAS },
  ])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loaded, setLoaded] = useState(false)
  const location = useLocation()
  const bottomRef = useRef<HTMLDivElement>(null)
  const pendingQuestion = useRef<string | null>(
    (location.state as { question?: string } | null)?.question ?? null,
  )

  const loadEmployees = () => {
    listAllEmployees()
      .then((items) => {
        setEmployees(normalizeEmployees(items))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }

  useEffect(() => {
    loadEmployees()
  }, [])

  useRealtime('employees', loadEmployees)

  const stats = useMemo(
    () => ({
      total: employees.length,
      ativos: employees.filter((employee) => comparable(employee.situacao) === 'ativo').length,
      afastados: employees.filter((employee) => comparable(employee.situacao) === 'afastado')
        .length,
      motoristas: employees.filter((employee) => normalize(employee.funcao).includes('motorista'))
        .length,
      fiscais: employees.filter((employee) => normalize(employee.funcao).includes('fiscal')).length,
    }),
    [employees],
  )

  const sendQuestion = (question: string) => {
    const trimmed = question.trim()
    if (!trimmed || thinking) return
    setInput('')
    setMessages((previous) => [...previous, { role: 'user', content: trimmed }])
    setThinking(true)
    // Pequena pausa para a resposta parecer conversacional.
    setTimeout(() => {
      setMessages((previous) => [
        ...previous,
        { role: 'assistant', content: buildAnswer(trimmed, employees) },
      ])
      setThinking(false)
    }, 450)
  }

  // Envia a pergunta sugerida vinda do dashboard (via navigation state).
  useEffect(() => {
    if (pendingQuestion.current) {
      const question = pendingQuestion.current
      pendingQuestion.current = null
      sendQuestion(question)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  const canSend = useMemo(() => input.trim().length > 0 && !thinking, [input, thinking])

  return (
    <div className="mx-auto flex h-[calc(100vh-140px)] max-w-6xl flex-col">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-[#0C1B14] to-[#14532D]">
          <Sparkles className="h-5 w-5 text-emerald-300" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Assistente IA</h1>
          <p className="text-xs text-muted-foreground">
            Consulte os registros reais da base em linguagem natural.
          </p>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* Bloco informativo lateral */}
        <aside className="flex flex-col gap-4 lg:w-[290px] lg:flex-none">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">Consulte a base sem fórmulas</h2>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              O assistente consulta os registros reais da matriz de colaboradores. Clique em uma
              sugestão para perguntar:
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {SUGESTOES.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={thinking}
                  onClick={() => sendQuestion(suggestion)}
                  className="group flex items-start gap-2 rounded-xl border bg-muted/40 px-3 py-2.5 text-left text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <MessageCircleQuestion className="mt-0.5 h-3.5 w-3.5 flex-none text-primary" />
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Área de chat */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border bg-white p-4 shadow-sm">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-2.5 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#0C1B14] to-[#14532D]">
                    <Sparkles className="h-4 w-4 text-emerald-300" />
                  </span>
                )}
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                    message.role === 'user'
                      ? 'rounded-br-sm bg-primary text-white'
                      : 'rounded-bl-sm bg-muted text-foreground'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {thinking && (
              <div className="flex justify-start gap-2.5">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#0C1B14] to-[#14532D]">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />
                </span>
                <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                  Analisando os registros da base…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Indicador de registros disponíveis */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 font-semibold text-primary">
              <Database className="h-3.5 w-3.5" />
              {loaded
                ? `${stats.total} registros disponíveis na base`
                : 'Carregando registros da base…'}
            </span>
            {loaded && stats.total > 0 && (
              <>
                <span>· {stats.ativos} ativo(s)</span>
                <span>· {stats.afastados} afastado(s)</span>
                <span>· {stats.motoristas} motorista(s)</span>
                <span>· {stats.fiscais} fiscal(is)</span>
              </>
            )}
          </div>

          {/* Barra de entrada */}
          <form
            className="mt-2.5 flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              sendQuestion(input)
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Pergunte algo sobre a base de colaboradores…"
              className="h-11 flex-1 rounded-full border border-input bg-white px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              disabled={!canSend}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary/90 disabled:opacity-40"
              aria-label="Enviar"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
