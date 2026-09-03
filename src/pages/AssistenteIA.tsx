import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Calendar,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Loader2,
  MessageCircleQuestion,
  Send,
  Sparkles,
  User,
} from 'lucide-react'

import { useRealtime } from '@/hooks/use-realtime'
import { listAllEmployees } from '@/services/employees'
import type { Employee } from '@/lib/types'
import { comparable, normalizeEmployees } from '@/lib/normalize'
import {
  exportEmployeesToXlsx,
  processAssistantQuery,
  type AssistantAnswer,
} from '@/lib/assistantEngine'
import { Button } from '@/components/ui/button'
import StatusBadge from '@/components/StatusBadge'
import { formatCnh, formatDate } from '@/lib/format'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  exportableRows?: Employee[]
  exportFileName?: string
  exportSheetName?: string
  matchedEmployee?: Employee
  downloadTriggered?: boolean
}

const BOAS_VINDAS =
  'Olá! Sou o Assistente IA da Via Sudeste. Posso consultar motoristas, fiscais, afastados, garagens, CNHs por data/mês ou colaborador específico, e gerar relatórios em planilha Excel (.xlsx).'

const SUGESTOES = [
  'Quais funcionários terão a CNH vencida no mês 09/2026?',
  'Exportar planilha com as CNHs que vencem em 09/2026',
  'Quantos motoristas estão com a CNH vencida?',
  'Funcionários da Cursino com CNH vencida em 09/2026',
  'Quem é o colaborador da chapa 003054?',
  'Quantos afastados estão em outra empresa?',
]

export default function AssistenteIA() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', content: BOAS_VINDAS },
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
      motoristas: employees.filter((employee) =>
        (employee.funcao || '').toLowerCase().includes('motorista'),
      ).length,
      fiscais: employees.filter((employee) =>
        (employee.funcao || '').toLowerCase().includes('fiscal'),
      ).length,
    }),
    [employees],
  )

  const handleDownload = (msg: ChatMessage) => {
    if (!msg.exportableRows || msg.exportableRows.length === 0) return
    const filename = msg.exportFileName || `consulta-${new Date().toISOString().slice(0, 10)}.xlsx`
    const sheet = msg.exportSheetName || 'Consulta'
    exportEmployeesToXlsx(msg.exportableRows, filename, sheet)
  }

  const sendQuestion = (question: string) => {
    const trimmed = question.trim()
    if (!trimmed || thinking) return
    setInput('')
    const userMsgId = `user-${Date.now()}`
    setMessages((previous) => [...previous, { id: userMsgId, role: 'user', content: trimmed }])
    setThinking(true)

    // Simula uma resposta fluida
    setTimeout(() => {
      const answer: AssistantAnswer = processAssistantQuery(trimmed, employees)
      const assistantMsgId = `assistant-${Date.now()}`

      // Dispara download automático caso tenha sido solicitado
      let downloadTriggered = false
      if (answer.autoDownload && answer.exportableRows && answer.exportableRows.length > 0) {
        try {
          const filename =
            answer.exportFileName || `consulta-${new Date().toISOString().slice(0, 10)}.xlsx`
          const sheet = answer.exportSheetName || 'Consulta'
          exportEmployeesToXlsx(answer.exportableRows, filename, sheet)
          downloadTriggered = true
        } catch (err) {
          console.error('Erro ao gerar XLSX automático:', err)
        }
      }

      setMessages((previous) => [
        ...previous,
        {
          id: assistantMsgId,
          role: 'assistant',
          content: answer.content,
          exportableRows: answer.exportableRows,
          exportFileName: answer.exportFileName,
          exportSheetName: answer.exportSheetName,
          matchedEmployee: answer.matchedEmployee,
          downloadTriggered,
        },
      ])
      setThinking(false)
    }, 400)
  }

  // Pergunta inicial vinda do dashboard via state
  useEffect(() => {
    if (pendingQuestion.current && loaded) {
      const question = pendingQuestion.current
      pendingQuestion.current = null
      sendQuestion(question)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

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
            Consulte datas de vencimento de CNH, garagens, afastados e exporte para Excel (.xlsx) em
            linguagem natural.
          </p>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* Bloco informativo lateral */}
        <aside className="flex flex-col gap-4 lg:w-[310px] lg:flex-none">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">Exemplos de perguntas</h2>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              O assistente analisa períodos de data, garagens, funções e chapas específicas:
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
                  <span className="leading-snug">{suggestion}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-emerald-50/50 p-4 text-xs text-emerald-950">
            <div className="flex items-center gap-2 font-semibold text-emerald-800">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span>Geração de planilhas</span>
            </div>
            <p className="mt-1.5 leading-relaxed text-emerald-900/80">
              Adicione palavras como <strong>“exportar”</strong>, <strong>“planilha”</strong> ou{' '}
              <strong>“xlsx”</strong> à sua pergunta para baixar os dados filtrados imediatamente.
            </p>
          </div>
        </aside>

        {/* Área de chat */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border bg-white p-4 shadow-sm">
            {messages.map((message) => {
              const isUser = message.role === 'user'
              const emp = message.matchedEmployee

              return (
                <div
                  key={message.id}
                  className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#0C1B14] to-[#14532D]">
                      <Sparkles className="h-4 w-4 text-emerald-300" />
                    </span>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      isUser
                        ? 'rounded-br-sm bg-primary text-white'
                        : 'rounded-bl-sm border bg-muted/30 text-foreground'
                    }`}
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>

                    {/* Cartão de funcionário correspondente */}
                    {emp && !isUser && (
                      <div className="mt-3 rounded-xl border bg-white p-3 text-xs shadow-xs">
                        <div className="flex items-center justify-between border-b pb-2">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-primary" />
                            <span className="font-semibold text-foreground">{emp.name}</span>
                          </div>
                          <span className="tabular-nums font-mono text-muted-foreground">
                            Chapa {emp.chapa}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-muted-foreground">
                          <div>
                            <span className="block text-[10px] uppercase tracking-wider font-semibold">
                              Função
                            </span>
                            <span className="text-foreground">{emp.funcao || '—'}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] uppercase tracking-wider font-semibold">
                              Garagem
                            </span>
                            <span className="text-foreground">{emp.filial || '—'}</span>
                          </div>
                          <div>
                            <span className="block text-[10px] uppercase tracking-wider font-semibold">
                              CNH
                            </span>
                            <span className="text-foreground">
                              {formatCnh(emp.cnh_categoria, emp.cnh_numero)}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] uppercase tracking-wider font-semibold">
                              Validade
                            </span>
                            <span className="font-medium text-foreground">
                              {formatDate(emp.validade_cnh)}
                            </span>
                          </div>
                        </div>
                        {emp.situacao_cnh && (
                          <div className="mt-2.5 flex items-center justify-between pt-2 border-t">
                            <span className="text-[11px] text-muted-foreground">Situação CNH:</span>
                            <StatusBadge value={emp.situacao_cnh} />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Botão de download ou indicador de arquivo gerado */}
                    {!isUser && message.exportableRows && message.exportableRows.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(message)}
                          className="h-8 gap-1.5 bg-white text-xs font-semibold text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900 border-emerald-300"
                        >
                          <Download className="h-3.5 w-3.5 text-emerald-600" />
                          <span>
                            Baixar planilha (.xlsx) — {message.exportableRows.length} registro(s)
                          </span>
                        </Button>
                        {message.downloadTriggered && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Download iniciado
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {thinking && (
              <div className="flex justify-start gap-2.5">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#0C1B14] to-[#14532D]">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />
                </span>
                <div className="rounded-2xl rounded-bl-sm border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
                  Analisando períodos, chapas e registros da matriz…
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
                ? `${stats.total} registros carregados da base`
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
            <div className="relative flex-1">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ex: Quais CNHs vencem em 09/2026? Ou: Gere uma planilha com os fiscais ativos"
                className="h-11 w-full rounded-full border border-input bg-white pl-4 pr-10 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Calendar className="h-4 w-4 opacity-40" />
              </span>
            </div>
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
