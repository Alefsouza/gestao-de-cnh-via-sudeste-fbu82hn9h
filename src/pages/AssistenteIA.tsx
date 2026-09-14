import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Calendar,
  Check,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  MessageCircleQuestion,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { useRealtime } from '@/hooks/use-realtime'
import { getCachedEmployees, updateCachedEmployee } from '@/services/employees'
import {
  createConversation,
  createMessage,
  deleteConversation,
  listConversations,
  listMessagesByConversation,
  updateConversationTitle,
  type ConversationRecord,
  type MessageMetadata,
} from '@/services/assistantConversations'
import { useAuth } from '@/contexts/AuthContext'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

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

function formatConversationDate(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

    if (diffDays === 0 && d.getDate() === now.getDate()) {
      return `Hoje às ${timeStr}`
    }
    if (diffDays <= 1) {
      return `Ontem às ${timeStr}`
    }
    return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${timeStr}`
  } catch {
    return ''
  }
}

export default function AssistenteIA() {
  const { user } = useAuth()
  const location = useLocation()

  // Estado das conversas salvas
  const [conversations, setConversations] = useState<ConversationRecord[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [loadingConversations, setLoadingConversations] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)

  // Barra lateral
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Renomeação de conversa
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null)
  const [editTitleInput, setEditTitleInput] = useState('')
  const [isSavingTitle, setIsSavingTitle] = useState(false)

  // Exclusão de conversa com confirmação
  const [conversationToDelete, setConversationToDelete] = useState<ConversationRecord | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Mensagens do chat atual
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', content: BOAS_VINDAS },
  ])
  const messagesRef = useRef<ChatMessage[]>(messages)
  messagesRef.current = messages

  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)

  // Base de colaboradores
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number } | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const pendingQuestion = useRef<string | null>(
    (location.state as { question?: string } | null)?.question ?? null,
  )
  const employeesRef = useRef<Employee[]>([])
  employeesRef.current = employees

  // Promessa ativa de carregamento para que perguntas pendentes possam aguardá-la
  const loadingPromiseRef = useRef<Promise<Employee[]> | null>(null)

  // Carrega base de funcionários com retry automático e atualização de progresso.
  // Com a view agora contendo ~18k registros (incluindo desligados),
  // carregamos preferencialmente os NÃO desligados para análise rápida e leve do assistente.
  const loadEmployees = useCallback((forceReload = false) => {
    setLoadingError(null)
    const promise = getCachedEmployees({
      forceReload,
      filter: "situacao != 'Desligado'",
      onProgress: (loadedCount, totalCount) => {
        setLoadProgress({ loaded: loadedCount, total: totalCount })
      },
    })
      .then((items) => {
        const normalized = normalizeEmployees(items)
        setEmployees(normalized)
        setLoaded(true)
        setLoadingError(null)
        return normalized
      })
      .catch((err) => {
        console.error('Falha ao carregar colaboradores no assistente:', err)
        setLoadingError(
          'Não foi possível carregar a base de colaboradores. Clique para tentar novamente.',
        )
        // Mantém loaded = false se falhou, nunca finge que a base está vazia!
        throw err
      })
      .finally(() => {
        loadingPromiseRef.current = null
      })

    loadingPromiseRef.current = promise
    return promise
  }, [])

  useEffect(() => {
    loadEmployees().catch(() => {})
  }, [loadEmployees])

  // Em vez de recarregar TODOS os ~3.180 colaboradores a cada evento SSE,
  // fazemos atualização incremental pontual (upsert/delete) no estado e cache.
  useRealtime('employees', (event) => {
    if (!event.record) return
    const action = event.action
    const record = event.record as unknown as Employee

    if (action === 'delete' || record.situacao === 'Desligado') {
      updateCachedEmployee('delete', record)
      setEmployees((prev) => prev.filter((e) => e.id !== record.id))
    } else {
      updateCachedEmployee(action as 'create' | 'update', record)
      setEmployees((prev) => {
        const index = prev.findIndex((e) => e.id === record.id)
        if (index >= 0) {
          const updated = [...prev]
          updated[index] = { ...updated[index], ...record }
          return normalizeEmployees(updated)
        }
        return normalizeEmployees([...prev, record])
      })
    }
  })

  // Carrega lista de conversas do usuário logado
  const fetchConversations = useCallback(
    async (selectFirstIfNone = false) => {
      if (!user?.id) return
      setLoadingConversations(true)
      try {
        const list = await listConversations()
        setConversations(list)

        if (selectFirstIfNone && list.length > 0 && !activeConversationId) {
          // Mantém a tela limpa ou seleciona a mais recente se o usuário desejar
        }
      } catch (err) {
        console.error('Erro ao carregar conversas:', err)
      } finally {
        setLoadingConversations(false)
      }
    },
    [user?.id, activeConversationId],
  )

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // Realtime para conversas
  useRealtime('conversations', () => {
    fetchConversations()
  })

  // Foco no input ao editar título
  useEffect(() => {
    if (editingConversationId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingConversationId])

  // Carrega mensagens ao trocar de conversa ativa
  const selectConversation = useCallback(
    async (conversation: ConversationRecord) => {
      if (conversation.id === activeConversationId && !loadingMessages) return
      setActiveConversationId(conversation.id)
      setLoadingMessages(true)
      try {
        const dbMsgs = await listMessagesByConversation(conversation.id)
        if (dbMsgs.length === 0) {
          setMessages([{ id: 'welcome', role: 'assistant', content: BOAS_VINDAS }])
        } else {
          setMessages(
            dbMsgs.map((m) => {
              const meta = m.metadata || {}
              return {
                id: m.id,
                role: m.role as 'user' | 'assistant',
                content: m.content,
                exportableRows: meta.exportableRows,
                exportFileName: meta.exportFileName,
                exportSheetName: meta.exportSheetName,
                matchedEmployee: meta.matchedEmployee,
                downloadTriggered: meta.downloadTriggered,
              }
            }),
          )
        }
      } catch (err) {
        console.error('Erro ao buscar mensagens da conversa:', err)
        toast.error('Não foi possível carregar as mensagens desta conversa.')
      } finally {
        setLoadingMessages(false)
      }
    },
    [activeConversationId, loadingMessages],
  )

  // Iniciar nova conversa
  const handleNewConversation = useCallback(() => {
    setActiveConversationId(null)
    setMessages([{ id: 'welcome', role: 'assistant', content: BOAS_VINDAS }])
    setInput('')
    setEditingConversationId(null)
  }, [])

  // Iniciar edição de título
  const startEditTitle = (conv: ConversationRecord, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingConversationId(conv.id)
    setEditTitleInput(conv.title)
  }

  // Salvar renomeação de título
  const handleSaveTitle = async (convId: string, e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = editTitleInput.trim()
    if (!trimmed) {
      setEditingConversationId(null)
      return
    }

    setIsSavingTitle(true)
    try {
      const updated = await updateConversationTitle(convId, trimmed)
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title: updated.title } : c)),
      )
      setEditingConversationId(null)
      toast.success('Conversa renomeada com sucesso.')
    } catch (err) {
      console.error('Erro ao renomear conversa:', err)
      toast.error('Erro ao renomear conversa.')
    } finally {
      setIsSavingTitle(false)
    }
  }

  // Cancelar edição
  const cancelEditTitle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingConversationId(null)
  }

  // Excluir conversa
  const handleConfirmDelete = async () => {
    if (!conversationToDelete) return
    setIsDeleting(true)
    const targetId = conversationToDelete.id
    try {
      await deleteConversation(targetId)
      setConversations((prev) => prev.filter((c) => c.id !== targetId))

      if (activeConversationId === targetId) {
        handleNewConversation()
      }
      toast.success('Conversa excluída com sucesso.')
      setConversationToDelete(null)
    } catch (err) {
      console.error('Erro ao excluir conversa:', err)
      toast.error('Erro ao excluir conversa.')
    } finally {
      setIsDeleting(false)
    }
  }

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

  // Envio de pergunta com persistência
  const sendQuestion = async (question: string) => {
    const trimmed = question.trim()
    if (!trimmed || thinking) return
    setInput('')

    // 1. Garante que exista uma conversa salva no backend
    let currentConvId = activeConversationId
    const isFirstInThread = !currentConvId

    if (!currentConvId && user?.id) {
      try {
        // Título resumido inicial baseado na primeira pergunta
        const initialTitle = trimmed.length > 38 ? `${trimmed.slice(0, 38).trim()}…` : trimmed
        const newConv = await createConversation(initialTitle, user.id)
        currentConvId = newConv.id
        setActiveConversationId(newConv.id)
        setConversations((prev) => [newConv, ...prev])
      } catch (err) {
        console.error('Erro ao criar conversa no backend:', err)
      }
    }

    const tempUserMsgId = `user-${Date.now()}`
    setMessages((previous) => [...previous, { id: tempUserMsgId, role: 'user', content: trimmed }])
    setThinking(true)

    // Salva mensagem do usuário no backend se tiver conversa criada
    if (currentConvId) {
      createMessage({
        conversationId: currentConvId,
        role: 'user',
        content: trimmed,
      }).catch((err) => console.warn('Erro ao persistir pergunta do usuário:', err))
    }

    // Processa a resposta usando o motor de IA local, garantindo que a base esteja carregada
    setTimeout(async () => {
      let currentEmployees = employeesRef.current

      // Se a base ainda não carregou ou está em andamento, aguarda o carregamento terminar
      if (!loaded || currentEmployees.length === 0) {
        try {
          if (loadingPromiseRef.current) {
            currentEmployees = await loadingPromiseRef.current
          } else {
            currentEmployees = await loadEmployees(true)
          }
        } catch (err) {
          console.error('Erro ao aguardar carregamento dos colaboradores:', err)
          const assistantMsgId = `assistant-${Date.now()}`
          const errorMsg: ChatMessage = {
            id: assistantMsgId,
            role: 'assistant',
            content:
              'Houve uma instabilidade temporária ao consultar a base de colaboradores no servidor. Por favor, tente enviar sua pergunta novamente em instantes.',
          }
          setMessages((previous) => [...previous, errorMsg])
          setThinking(false)
          return
        }
      }

      // Prepara histórico dos turnos anteriores para interpretação contextual
      // messagesRef.current contém as mensagens anteriores + a recém-adicionada do usuário
      const priorHistory = messagesRef.current
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({
          role: m.role,
          content: m.content,
          exportableRows: m.exportableRows,
          matchedEmployee: m.matchedEmployee,
        }))

      const answer: AssistantAnswer = processAssistantQuery(trimmed, currentEmployees, priorHistory)
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

      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: answer.content,
        exportableRows: answer.exportableRows,
        exportFileName: answer.exportFileName,
        exportSheetName: answer.exportSheetName,
        matchedEmployee: answer.matchedEmployee,
        downloadTriggered,
      }

      setMessages((previous) => [...previous, assistantMsg])
      setThinking(false)

      // Persiste resposta do assistente no backend
      if (currentConvId) {
        const metadata: MessageMetadata = {}
        if (answer.exportableRows && answer.exportableRows.length > 0) {
          metadata.exportableRows = answer.exportableRows
          metadata.exportFileName = answer.exportFileName
          metadata.exportSheetName = answer.exportSheetName
        }
        if (answer.matchedEmployee) {
          metadata.matchedEmployee = answer.matchedEmployee
        }
        if (downloadTriggered) {
          metadata.downloadTriggered = true
        }

        try {
          const createdDbMsg = await createMessage({
            conversationId: currentConvId,
            role: 'assistant',
            content: answer.content,
            metadata,
          })
          // Atualiza o ID da mensagem para o id persistido
          setMessages((previous) =>
            previous.map((m) => (m.id === assistantMsgId ? { ...m, id: createdDbMsg.id } : m)),
          )

          // Se for a primeira mensagem, atualiza a data da lista
          setConversations((prev) =>
            prev.map((c) =>
              c.id === currentConvId ? { ...c, updated: new Date().toISOString() } : c,
            ),
          )
        } catch (err) {
          console.warn('Erro ao persistir resposta do assistente:', err)
        }
      }
    }, 380)
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

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId],
  )

  return (
    <div className="mx-auto flex h-[calc(100vh-116px)] max-w-7xl flex-col">
      {/* Cabeçalho da página */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-[#0C1B14] to-[#14532D] shadow-xs">
            <Sparkles className="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-foreground">Assistente IA</h1>
              {activeConversation && (
                <span className="hidden sm:inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 border border-emerald-200">
                  {activeConversation.title}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Consulte CNHs, garagens, afastados e exporte para Excel (.xlsx) com histórico salvo.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão de toggle da barra lateral */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="h-9 gap-1.5 text-xs font-semibold text-foreground border-border hover:bg-muted"
            title={
              sidebarOpen ? 'Ocultar histórico de conversas' : 'Mostrar histórico de conversas'
            }
          >
            {sidebarOpen ? (
              <>
                <PanelLeftClose className="h-4 w-4 text-muted-foreground" />
                <span className="hidden sm:inline">Recolher histórico</span>
              </>
            ) : (
              <>
                <PanelLeftOpen className="h-4 w-4 text-emerald-700" />
                <span>Histórico ({conversations.length})</span>
              </>
            )}
          </Button>

          {/* Botão Nova Conversa */}
          <Button
            type="button"
            size="sm"
            onClick={handleNewConversation}
            className="h-9 gap-1.5 bg-primary font-semibold text-white hover:bg-primary/90 text-xs shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>Nova conversa</span>
          </Button>
        </div>
      </div>

      {/* Conteúdo principal: Barra lateral (estilo ChatGPT) + Chat + Sugestões */}
      <div className="mt-3 flex min-h-0 flex-1 gap-3 overflow-hidden">
        {/* BARRA LATERAL ESTILO CHATGPT */}
        {sidebarOpen && (
          <aside className="flex w-64 md:w-72 flex-none flex-col rounded-2xl border bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <History className="h-3.5 w-3.5 text-primary" />
                <span>Conversas salvas</span>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {conversations.length}
              </span>
            </div>

            {/* Botão rápido para criar nova conversa no topo da sidebar */}
            <button
              type="button"
              onClick={handleNewConversation}
              className="mt-2.5 flex items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 hover:border-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Iniciar nova conversa</span>
            </button>

            {/* Lista com scroll das conversas */}
            <div className="mt-2.5 flex-1 space-y-1 overflow-y-auto pr-1">
              {loadingConversations && conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-xs text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-primary mb-2" />
                  <span>Carregando histórico…</span>
                </div>
              ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-3 text-center">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-xs font-medium text-foreground">Nenhuma conversa salva</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Faça uma pergunta para iniciar e salvar seu primeiro histórico.
                  </p>
                </div>
              ) : (
                conversations.map((conv) => {
                  const isActive = conv.id === activeConversationId
                  const isEditing = conv.id === editingConversationId

                  return (
                    <div
                      key={conv.id}
                      onClick={() => !isEditing && selectConversation(conv)}
                      className={cn(
                        'group relative flex cursor-pointer flex-col rounded-xl px-3 py-2 text-xs transition-all',
                        isActive
                          ? 'bg-primary/10 text-primary border border-primary/30 font-medium shadow-xs'
                          : 'text-foreground hover:bg-muted/70 border border-transparent',
                      )}
                    >
                      {isEditing ? (
                        <form
                          onSubmit={(e) => handleSaveTitle(conv.id, e)}
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editTitleInput}
                            onChange={(e) => setEditTitleInput(e.target.value)}
                            disabled={isSavingTitle}
                            className="h-7 w-full rounded-md border border-primary bg-white px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button
                            type="submit"
                            disabled={isSavingTitle}
                            className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-primary text-white hover:bg-primary/90"
                            title="Salvar"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditTitle}
                            disabled={isSavingTitle}
                            className="flex h-7 w-7 flex-none items-center justify-center rounded-md border bg-white text-muted-foreground hover:bg-muted"
                            title="Cancelar"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <MessageSquare
                              className={cn(
                                'h-3.5 w-3.5 flex-none',
                                isActive ? 'text-primary' : 'text-muted-foreground',
                              )}
                            />
                            <span
                              className="truncate font-semibold leading-snug"
                              title={conv.title}
                            >
                              {conv.title}
                            </span>
                          </div>

                          {/* Ações (Editar e Excluir) */}
                          <div
                            className={cn(
                              'flex items-center gap-0.5',
                              isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={(e) => startEditTitle(conv, e)}
                              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-white hover:text-foreground hover:shadow-xs"
                              title="Renomear conversa"
                              aria-label="Renomear conversa"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setConversationToDelete(conv)
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-destructive hover:shadow-xs"
                              title="Excluir conversa"
                              aria-label="Excluir conversa"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      )}

                      {!isEditing && (
                        <span className="mt-1 block text-[10px] text-muted-foreground/80">
                          {formatConversationDate(conv.updated || conv.created)}
                        </span>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </aside>
        )}

        {/* ÁREA CENTRAL DO CHAT */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border bg-white p-4 shadow-sm">
          {/* Informações da conversa atual e estatísticas */}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">
                {activeConversation ? activeConversation.title : 'Nova conversa'}
              </span>
              {activeConversation && (
                <span className="text-[11px] text-muted-foreground">
                  · Última alteração {formatConversationDate(activeConversation.updated)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {loadingError ? (
                <button
                  type="button"
                  onClick={() => loadEmployees(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2.5 py-0.5 font-semibold text-red-700 hover:bg-red-100 transition-colors"
                  title="Clique para tentar recarregar os dados"
                >
                  <Database className="h-3 w-3 text-red-500" />
                  <span>Erro ao carregar (tentar novamente)</span>
                </button>
              ) : (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 font-semibold text-primary"
                  title="Base operacional ativa do assistente (não desligados)"
                >
                  <Database className="h-3 w-3" />
                  {loaded
                    ? `${stats.total} ativos/afastados`
                    : loadProgress && loadProgress.total > 0
                      ? `Carregando base (${loadProgress.loaded}/${loadProgress.total})…`
                      : 'Carregando base de colaboradores…'}
                </span>
              )}
              {loaded && stats.total > 0 && (
                <span className="hidden md:inline">
                  · {stats.motoristas} motoristas · {stats.fiscais} fiscais
                </span>
              )}
            </div>
          </div>

          {/* Mensagens com scroll */}
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            {loadingMessages ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs font-medium">Carregando histórico de mensagens…</span>
              </div>
            ) : (
              messages.map((message) => {
                const isUser = message.role === 'user'
                const emp = message.matchedEmployee

                return (
                  <div
                    key={message.id}
                    className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#0C1B14] to-[#14532D] shadow-xs">
                        <Sparkles className="h-4 w-4 text-emerald-300" />
                      </span>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        isUser
                          ? 'rounded-br-sm bg-primary text-white shadow-xs'
                          : 'rounded-bl-sm border bg-muted/30 text-foreground'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{message.content}</div>

                      {/* Cartão de funcionário correspondente */}
                      {emp && !isUser && (
                        <div className="mt-3 rounded-xl border bg-white p-3 text-xs shadow-xs text-foreground">
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
                              <span className="text-[11px] text-muted-foreground">
                                Situação CNH:
                              </span>
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
                            className="h-8 gap-1.5 bg-white text-xs font-semibold text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900 border-emerald-300 shadow-xs"
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
              })
            )}

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

          {/* Barra de entrada de texto */}
          <form
            className="mt-3 flex items-center gap-2 border-t pt-3"
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
                className="h-11 w-full rounded-full border border-input bg-muted/20 pl-4 pr-10 text-sm outline-none transition-colors focus:bg-white focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Calendar className="h-4 w-4 opacity-40" />
              </span>
            </div>
            <button
              type="submit"
              disabled={!canSend}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-primary text-white shadow-xs transition-colors hover:bg-primary/90 disabled:opacity-40"
              aria-label="Enviar"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>

        {/* PAINEL LATERAL DIREITO COM EXEMPLOS E AJUDA (ocultável em telas menores) */}
        <aside className="hidden xl:flex w-72 flex-none flex-col gap-3">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Exemplos de perguntas
              </h2>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              O assistente analisa períodos de data, garagens, funções e chapas específicas:
            </p>
            <div className="mt-3 flex flex-col gap-1.5">
              {SUGESTOES.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={thinking}
                  onClick={() => sendQuestion(suggestion)}
                  className="group flex items-start gap-2 rounded-xl border bg-muted/40 p-2.5 text-left text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
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
              <strong>“xlsx”</strong> para baixar os dados imediatamente.
            </p>
          </div>
        </aside>
      </div>

      {/* DIÁLOGO DE CONFIRMAÇÃO PARA EXCLUSÃO DE CONVERSA */}
      <Dialog
        open={Boolean(conversationToDelete)}
        onOpenChange={(open) => !open && setConversationToDelete(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              <span>Excluir conversa</span>
            </DialogTitle>
            <DialogDescription className="pt-2 text-sm">
              Tem certeza de que deseja apagar a conversa{' '}
              <strong className="text-foreground">“{conversationToDelete?.title}”</strong>? Todas as
              mensagens salvas nesta conversa serão removidas permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => setConversationToDelete(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="gap-1.5"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Excluindo…</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  <span>Confirmar exclusão</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
