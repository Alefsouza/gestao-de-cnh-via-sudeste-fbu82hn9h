import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Send, Sparkles } from 'lucide-react'

import { useRealtime } from '@/hooks/use-realtime'
import { formatDate } from '@/lib/format'
import { listAllEmployees } from '@/services/employees'
import type { Employee } from '@/lib/types'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const SUGESTOES = [
  'Quais CNHs vencem neste mês?',
  'Quais colaboradores estão afastados hoje?',
  'Como está a distribuição por garagem?',
  'Quantos fiscais temos na base?',
]

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((date.getTime() - startOfToday.getTime()) / 86400000)
}

/** Gera a resposta do assistente a partir dos dados atuais da base. */
function buildAnswer(question: string, employees: Employee[]): string {
  const normalized = question.toLowerCase()
  const now = new Date()

  if (normalized.includes('cnh')) {
    const vencidas = employees
      .filter((employee) => employee.situacao_cnh === 'Vencida')
      .sort((a, b) => (a.validade_cnh ?? '').localeCompare(b.validade_cnh ?? ''))
    const aVencer = employees.filter((employee) => {
      if (employee.situacao_cnh !== 'A vencer') return false
      const days = daysUntil(employee.validade_cnh)
      return days !== null && days <= 30
    })

    if (normalized.includes('vencem') || normalized.includes('mês') || normalized.includes('mes')) {
      const linhas = aVencer.map(
        (employee) =>
          `• ${employee.name} (chapa ${employee.chapa}) — vence em ${formatDate(employee.validade_cnh)} (${employee.filial || '—'})`,
      )
      return [
        `Nos próximos 30 dias, ${aVencer.length} CNH(s) vencem:`,
        ...(linhas.length ? linhas : ['• Nenhuma CNH vence nos próximos 30 dias.']),
        '',
        `Além disso, existem ${vencidas.length} CNH(s) já vencida(s) que precisam de regularização urgente.`,
      ].join('\n')
    }

    return [
      `Situação atual das CNHs de motoristas:`,
      `• Vencidas: ${vencidas.length}`,
      `• A vencer (30 dias): ${aVencer.length}`,
      '',
      'Mais críticas:',
      ...vencidas
        .slice(0, 5)
        .map(
          (employee) =>
            `• ${employee.name} (chapa ${employee.chapa}) — vencida em ${formatDate(employee.validade_cnh)}`,
        ),
    ].join('\n')
  }

  if (normalized.includes('afastad')) {
    const afastados = employees.filter((employee) => employee.situacao === 'Afastado')
    return [
      `Existem ${afastados.length} colaborador(es) afastado(s):`,
      ...afastados.map(
        (employee) =>
          `• ${employee.name} (chapa ${employee.chapa}) — ${employee.motivo_afastamento || 'motivo não informado'}; retorno previsto para ${formatDate(employee.previsao_retorno)}`,
      ),
    ].join('\n')
  }

  if (normalized.includes('garagem') || normalized.includes('distribui')) {
    const cursino = employees.filter((employee) => employee.filial === 'CURSINO').length
    const sapopemba = employees.filter((employee) => employee.filial === 'SAPOPEMBA').length
    return `Distribuição atual na base:\n• CURSINO: ${cursino} colaboradores\n• SAPOPEMBA: ${sapopemba} colaboradores\n• Total: ${cursino + sapopemba}`
  }

  if (normalized.includes('fiscal')) {
    const fiscais = employees.filter((employee) => employee.funcao === 'Fiscal de Viajem')
    const emDia = fiscais.filter((employee) => {
      const days = daysUntil(employee.validade_documento_fiscal)
      return days !== null && days > 30
    }).length
    return `Temos ${fiscais.length} fiscal(is) na base, dos quais ${emDia} com documentação em dia.`
  }

  return 'Posso ajudar com informações sobre CNHs de motoristas, colaboradores afastados, distribuição por garagem e atualização fiscal. Experimente uma das sugestões abaixo.'
}

export default function AssistenteIA() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const location = useLocation()
  const bottomRef = useRef<HTMLDivElement>(null)
  const pendingQuestion = useRef<string | null>(
    (location.state as { question?: string } | null)?.question ?? null,
  )

  useEffect(() => {
    listAllEmployees()
      .then(setEmployees)
      .catch(() => setEmployees([]))
  }, [])

  useRealtime('employees', () => {
    listAllEmployees()
      .then(setEmployees)
      .catch(() => {})
  })

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
    <div className="mx-auto flex h-[calc(100vh-150px)] max-w-4xl flex-col">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#0C1B14] to-[#14532D]">
          <Sparkles className="h-5 w-5 text-emerald-300" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Assistente IA</h1>
          <p className="text-xs text-muted-foreground">
            Tire dúvidas sobre colaboradores, CNHs, afastamentos e processos.
          </p>
        </div>
      </div>

      <div className="mt-4 flex-1 space-y-4 overflow-y-auto rounded-xl border bg-white p-4 shadow-sm">
        {messages.length === 0 && !thinking && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Sparkles className="h-8 w-8 text-primary" />
            <p className="max-w-sm text-sm text-muted-foreground">
              Faça uma pergunta sobre a base de colaboradores da Via Sudeste.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGESTOES.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => sendQuestion(suggestion)}
                  className="rounded-full border bg-muted/40 px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
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
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm text-muted-foreground">
              Analisando os dados…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="mt-4 flex items-center gap-2"
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
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary/90 disabled:opacity-40"
          aria-label="Enviar"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}
