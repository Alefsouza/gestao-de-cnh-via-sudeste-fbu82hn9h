import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  History,
  Info,
  Loader2,
  Mail,
  PlusCircle,
  ShieldAlert,
  Truck,
  User,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/format'
import {
  TIMELINE_DOCUMENTOS_OBRIGATORIOS,
  TIMELINE_ETAPAS_ORDEM,
  type ProcessoCadastralRecord,
  type ProcessoSituacao,
  type ProcessoTimelineRecord,
  type UserRole,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { createTimelineItem, listTimelineByProcesso } from '@/services/processoTimeline'

interface ProcessoDetalhesTimelineModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  processo: ProcessoCadastralRecord | null
  onProcessoUpdated?: (updated: ProcessoCadastralRecord) => void
  onUpdateSituacaoTrafego?: (
    id: string,
    situacao: ProcessoSituacao,
    observacoes?: string,
  ) => Promise<void>
}

export function ProcessoDetalhesTimelineModal({
  open,
  onOpenChange,
  processo,
  onProcessoUpdated,
  onUpdateSituacaoTrafego,
}: ProcessoDetalhesTimelineModalProps) {
  const { user } = useAuth()

  // Perfil do usuário atual
  const rawRole = ((user?.role as string) || 'Admin').trim()
  const roleLower = rawRole.toLowerCase()
  const isTrafego = roleLower === 'tráfego' || roleLower === 'trafego'
  const isRH = roleLower === 'rh'
  const isAdmin = !isTrafego && !isRH // Admin é o padrão quando não for Tráfego nem RH

  const currentRole: UserRole = isTrafego ? 'Tráfego' : isRH ? 'RH' : 'Admin'
  const currentUserName =
    user?.name ||
    user?.email ||
    (isTrafego ? 'Operador Tráfego' : isRH ? 'Analista RH' : 'Administrador')

  // Timeline list state
  const [timeline, setTimeline] = useState<ProcessoTimelineRecord[]>([])
  const [loadingTimeline, setLoadingTimeline] = useState(false)

  // Form state para registrar nova etapa/ação
  const [etapaSelecionada, setEtapaSelecionada] = useState<string>('')
  const [observacoes, setObservacoes] = useState('')
  const [motivo, setMotivo] = useState('')
  const [documentosRecebidos, setDocumentosRecebidos] = useState<string[]>([])
  const [documentosAdicionadosNestaEntrega, setDocumentosAdicionadosNestaEntrega] = useState<
    string[]
  >([])
  const [submitting, setSubmitting] = useState(false)

  // Carregar timeline ao abrir o modal
  useEffect(() => {
    if (!open || !processo) {
      setTimeline([])
      setEtapaSelecionada('')
      setObservacoes('')
      setMotivo('')
      setDocumentosRecebidos([])
      setDocumentosAdicionadosNestaEntrega([])
      return
    }

    let active = true
    setLoadingTimeline(true)

    listTimelineByProcesso(processo.id)
      .then((records) => {
        if (!active) return
        // Ordena com segurança para que eventos mais recentes apareçam abaixo ou acima:
        // A timeline é exibida do mais antigo no topo ao mais novo embaixo,
        // ou quando ambos forem criados juntos, "Carta criada" fica após "Processo criado" (mais recente).
        const sorted = [...records].sort((a, b) => {
          const tA = new Date(a.data_hora || a.created || 0).getTime()
          const tB = new Date(b.data_hora || b.created || 0).getTime()
          if (tA !== tB) return tA - tB
          // Desempate: Processo criado vem antes de Carta criada
          if (a.etapa === 'Processo criado' && b.etapa === 'Carta criada') return -1
          if (a.etapa === 'Carta criada' && b.etapa === 'Processo criado') return 1
          return (a.created || '').localeCompare(b.created || '')
        })
        setTimeline(sorted)
      })
      .catch((err) => {
        console.error('Erro ao carregar timeline:', err)
        toast.error('Não foi possível carregar a linha do tempo deste processo.')
      })
      .finally(() => {
        if (active) setLoadingTimeline(false)
      })

    return () => {
      active = false
    }
  }, [open, processo])

  // Lista de ações permitidas de acordo com o perfil
  // Tráfego: valida SOMENTE processos do tipo "Atualização"
  // - "Operador notificado"
  // - "Foto Bloqueada" (bloqueio)
  // - "Impossibilitado de trabalhar" (com motivo obrigatório)
  // RH:
  // - "Comparecimento ao RH"
  // - "Entrega dos documentos" (com checklist)
  // - "Conferência"
  // - "Envio para a SPTrans"
  // - "Pendências"
  // - "Conclusão"
  // Admin: ações de RH + ações de Tráfego (somente quando tipo for "Atualização") + "Tráfego informado" (somente Atualização)
  const isProcessoAtualizacao = processo?.processo === 'Atualização'
  const acoesDisponiveis = [
    ...(isAdmin && isProcessoAtualizacao
      ? [{ value: 'Tráfego informado', label: 'Tráfego informado', perfil: 'Admin' }]
      : []),
    ...((isTrafego && isProcessoAtualizacao) || (isAdmin && isProcessoAtualizacao)
      ? [
          { value: 'Operador notificado', label: 'Operador notificado', perfil: 'Tráfego' },
          {
            value: 'Foto Bloqueada',
            label: 'Registrar Bloqueio (Foto Bloqueada)',
            perfil: 'Tráfego',
          },
          {
            value: 'Impossibilitado de trabalhar',
            label: 'Impossibilitado de trabalhar',
            perfil: 'Tráfego',
          },
        ]
      : []),
    ...(isRH || isAdmin
      ? [
          { value: 'Comparecimento ao RH', label: 'Comparecimento ao RH', perfil: 'RH' },
          {
            value: 'Entrega dos documentos',
            label: 'Entrega dos documentos (Checklist)',
            perfil: 'RH',
          },
          { value: 'Conferência', label: 'Conferência de documentos', perfil: 'RH' },
          { value: 'Envio para a SPTrans', label: 'Envio para a SPTrans', perfil: 'RH' },
          { value: 'Pendências', label: 'Registrar Pendências', perfil: 'RH' },
          { value: 'Conclusão', label: 'Conclusão do processo', perfil: 'RH' },
        ]
      : []),
  ]

  // Documentos previamente recebidos em registros anteriores da timeline
  // Mapeia para cada documento as informações de quando e por quem foi recebido pela primeira vez
  const documentosJaRecebidosInfo = useMemo(() => {
    const mapa = new Map<
      string,
      {
        data_hora: string
        responsavel_nome: string
        responsavel_perfil?: string
      }
    >()

    // Itera os registros em ordem cronológica (created / data_hora)
    for (const item of timeline) {
      if (
        item.etapa === 'Entrega dos documentos' &&
        Array.isArray(item.documentos_recebidos) &&
        item.documentos_recebidos.length > 0
      ) {
        for (const doc of item.documentos_recebidos) {
          if (!mapa.has(doc)) {
            mapa.set(doc, {
              data_hora: item.data_hora || item.created || '',
              responsavel_nome: item.responsavel_nome || 'RH',
              responsavel_perfil: item.responsavel_perfil,
            })
          }
        }
      }
    }
    return mapa
  }, [timeline])

  // Lista dos documentos já recebidos anteriormente
  const listaDocsJaRecebidos = useMemo(() => {
    return Array.from(documentosJaRecebidosInfo.keys())
  }, [documentosJaRecebidosInfo])

  // Documentos que ainda estão pendentes de entrega
  const docsAindaPendentes = useMemo(() => {
    return TIMELINE_DOCUMENTOS_OBRIGATORIOS.filter((doc) => !documentosJaRecebidosInfo.has(doc))
  }, [documentosJaRecebidosInfo])

  // Inicializa o checklist cumulativo ao selecionar "Entrega dos documentos"
  useEffect(() => {
    if (etapaSelecionada === 'Entrega dos documentos') {
      // Documentos recebidos acumulados = já recebidos antes + os marcados nesta nova entrega
      setDocumentosRecebidos([...listaDocsJaRecebidos, ...documentosAdicionadosNestaEntrega])
    }
  }, [etapaSelecionada, listaDocsJaRecebidos, documentosAdicionadosNestaEntrega])

  if (!processo) return null

  const handleToggleDocumento = (doc: string) => {
    // Se o documento já foi recebido em registro anterior, ele é mantido como recebido
    if (documentosJaRecebidosInfo.has(doc)) {
      return
    }

    setDocumentosAdicionadosNestaEntrega((prev) =>
      prev.includes(doc) ? prev.filter((d) => d !== doc) : [...prev, doc],
    )
  }

  const handleMarcarTodosPendentes = () => {
    if (documentosAdicionadosNestaEntrega.length === docsAindaPendentes.length) {
      // Se todos os pendentes estavam marcados, desmarca todos os pendentes desta entrega
      setDocumentosAdicionadosNestaEntrega([])
    } else {
      // Marca todos os documentos pendentes
      setDocumentosAdicionadosNestaEntrega([...docsAindaPendentes])
    }
  }

  const handleRegistrarEtapa = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!etapaSelecionada) {
      toast.error('Selecione uma etapa para registrar.')
      return
    }

    if (isTrafego && processo.processo !== 'Atualização') {
      toast.error('O perfil Tráfego valida exclusivamente processos do tipo "Atualização".')
      return
    }

    const acoesExclusivasTrafego = [
      'Tráfego informado',
      'Operador notificado',
      'Foto Bloqueada',
      'Impossibilitado de trabalhar',
    ]
    if (processo.processo !== 'Atualização' && acoesExclusivasTrafego.includes(etapaSelecionada)) {
      toast.error('Ações de validação do Tráfego só se aplicam a processos do tipo "Atualização".')
      return
    }

    // Validação de motivo obrigatório para "Impossibilitado de trabalhar"
    if (etapaSelecionada === 'Impossibilitado de trabalhar' && !motivo.trim()) {
      toast.error('O motivo é obrigatório para a situação "Impossibilitado de trabalhar".')
      return
    }

    setSubmitting(true)

    try {
      let docsRecebidos: string[] = []
      let docsPendentes: string[] = []
      let statusDocs = ''

      if (etapaSelecionada === 'Entrega dos documentos') {
        docsRecebidos = documentosRecebidos
        docsPendentes = TIMELINE_DOCUMENTOS_OBRIGATORIOS.filter(
          (doc) => !documentosRecebidos.includes(doc),
        )
        statusDocs = docsPendentes.length > 0 ? 'Documentação incompleta' : 'Documentação completa'
      }

      // 1. Cria o registro append-only na linha do tempo
      const novoItem = await createTimelineItem({
        processo: processo.id,
        etapa: etapaSelecionada,
        responsavel_nome: currentUserName,
        responsavel_perfil: currentRole,
        observacoes: observacoes.trim(),
        motivo: motivo.trim(),
        documentos_recebidos: docsRecebidos,
        documentos_pendentes: docsPendentes,
        status_documentacao: statusDocs,
      })

      // Atualiza a lista da linha do tempo na tela imediatamente
      setTimeline((prev) => [...prev, novoItem])

      // 2. Se a ação refletir na situação do processo (ex: Bloqueio Foto Bloqueada ou Impossibilitado de trabalhar)
      if (
        (etapaSelecionada === 'Foto Bloqueada' ||
          etapaSelecionada === 'Impossibilitado de trabalhar') &&
        onUpdateSituacaoTrafego
      ) {
        const novaSit: ProcessoSituacao =
          etapaSelecionada === 'Foto Bloqueada' ? 'Foto Bloqueada' : 'Impossibilitado de Trabalhar'
        const obsParaProcesso = observacoes.trim() || motivo.trim() || undefined
        await onUpdateSituacaoTrafego(processo.id, novaSit, obsParaProcesso)
        if (onProcessoUpdated) {
          onProcessoUpdated({
            ...processo,
            situacao: novaSit,
            ...(obsParaProcesso !== undefined ? { observacoes: obsParaProcesso } : {}),
          })
        }
      }

      toast.success(`Etapa "${etapaSelecionada}" registrada com sucesso!`)

      // Limpa os campos do formulário
      setEtapaSelecionada('')
      setObservacoes('')
      setMotivo('')
      setDocumentosRecebidos([])
      setDocumentosAdicionadosNestaEntrega([])
    } catch (err) {
      console.error('Erro ao salvar etapa na timeline:', err)
      toast.error('Erro ao registrar etapa na linha do tempo. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  // Formata data e horário do registro da timeline
  const formatDateTimeDisplay = (isoString?: string) => {
    if (!isoString) return { data: '—', hora: '—' }
    try {
      const d = new Date(isoString)
      const dataStr = d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
      const horaStr = d.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
      return { data: dataStr, hora: horaStr }
    } catch (_) {
      return { data: isoString, hora: '' }
    }
  }

  const getEtapaBadgeStyle = (etapa: string) => {
    switch (etapa) {
      case 'Processo criado':
        return 'bg-slate-50 text-slate-800 border-slate-200'
      case 'Carta criada':
        return 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-200'
      case 'Tráfego informado':
        return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'Operador notificado':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200'
      case 'Comparecimento ao RH':
        return 'bg-purple-50 text-purple-700 border-purple-200'
      case 'Entrega dos documentos':
        return 'bg-amber-50 text-amber-700 border-amber-200'
      case 'Conferência':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200'
      case 'Envio para a SPTrans':
        return 'bg-teal-50 text-teal-700 border-teal-200'
      case 'Conclusão':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'Foto Bloqueada':
        return 'bg-rose-50 text-rose-700 border-rose-200'
      case 'Impossibilitado de trabalhar':
        return 'bg-orange-50 text-orange-700 border-orange-200'
      case 'Pendências':
        return 'bg-yellow-50 text-yellow-800 border-yellow-200'
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200'
    }
  }

  const getPerfilBadge = (perfil?: string) => {
    if (perfil === 'Tráfego') {
      return (
        <Badge
          variant="outline"
          className="border-amber-300 bg-amber-50 text-[10px] text-amber-800"
        >
          Tráfego
        </Badge>
      )
    }
    if (perfil === 'RH') {
      return (
        <Badge
          variant="outline"
          className="border-purple-300 bg-purple-50 text-[10px] text-purple-800"
        >
          RH
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="border-blue-300 bg-blue-50 text-[10px] text-blue-800">
        Admin
      </Badge>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="border-b pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                <FileText className="h-5 w-5 text-primary" />
                Detalhes da Solicitação / Processo
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                Colaborador <strong className="text-foreground">{processo.colaborador}</strong> ·
                Registro <strong className="text-foreground">{processo.matricula}</strong>
              </DialogDescription>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Você está como:</span>
              {getPerfilBadge(currentRole)}
            </div>
          </div>
        </DialogHeader>

        {/* Layout lado a lado em desktop (Painel de detalhes à esquerda, Timeline à direita) */}
        <div className="grid grid-cols-1 gap-6 pt-2 lg:grid-cols-12">
          {/* LADO ESQUERDO: Informações do Processo + Registro de Nova Etapa (5 cols) */}
          <div className="space-y-5 lg:col-span-5">
            {/* Card com os dados do processo */}
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Info className="h-4 w-4 text-primary" />
                Dados Cadastrais
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between border-b pb-1.5">
                  <span className="text-muted-foreground">Colaborador:</span>
                  <span className="font-semibold text-foreground text-right">
                    {processo.colaborador}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-1.5">
                  <span className="text-muted-foreground">Registro / Chapa:</span>
                  <span className="font-mono font-medium text-foreground">
                    {processo.matricula}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-1.5">
                  <span className="text-muted-foreground">Função:</span>
                  <span className="font-medium text-foreground">{processo.funcao || '—'}</span>
                </div>
                <div className="flex justify-between border-b pb-1.5">
                  <span className="text-muted-foreground">Garagem:</span>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.2 text-[11px] font-semibold',
                      processo.garagem === 'SAPOPEMBA'
                        ? 'border border-sky-200 bg-sky-50 text-sky-700'
                        : 'border border-emerald-200 bg-emerald-50 text-emerald-700',
                    )}
                  >
                    {processo.garagem || 'CURSINO'}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-1.5">
                  <span className="text-muted-foreground">Tipo de Movimentação:</span>
                  <span className="font-semibold text-primary">{processo.processo}</span>
                </div>
                <div className="flex justify-between border-b pb-1.5">
                  <span className="text-muted-foreground">Etapa do Processo:</span>
                  <span className="font-medium text-foreground">{processo.etapa || '—'}</span>
                </div>
                <div className="flex justify-between border-b pb-1.5">
                  <span className="text-muted-foreground">Prazo:</span>
                  <span className="font-medium text-foreground">{formatDate(processo.prazo)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Situação Atual:</span>
                  <span className="rounded-full border bg-muted/60 px-2.5 py-0.5 text-[11px] font-semibold text-foreground">
                    {processo.situacao}
                  </span>
                </div>
              </div>
            </div>

            {/* Formulário: Registrar nova etapa / ação na timeline */}
            <div className="rounded-xl border bg-muted/20 p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
                  <PlusCircle className="h-4 w-4 text-emerald-600" />
                  Registrar Andamento
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  Perfil: <strong>{currentRole}</strong>
                </span>
              </div>

              <form onSubmit={handleRegistrarEtapa} className="space-y-3.5">
                {/* Seleção de Etapa / Ação disponível para o perfil */}
                <div className="space-y-1.5">
                  <Label htmlFor="timeline-etapa" className="text-xs font-semibold">
                    Etapa / Ação a Registrar
                  </Label>
                  <Select
                    value={etapaSelecionada}
                    onValueChange={(val) => {
                      setEtapaSelecionada(val)
                      if (val !== 'Impossibilitado de trabalhar') setMotivo('')
                    }}
                  >
                    <SelectTrigger id="timeline-etapa" className="h-9 text-xs">
                      <SelectValue placeholder="Selecione a ação realizada…" />
                    </SelectTrigger>
                    <SelectContent>
                      {acoesDisponiveis.map((acao) => (
                        <SelectItem key={acao.value} value={acao.value} className="text-xs">
                          {acao.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Motivo OBRIGATÓRIO para 'Impossibilitado de trabalhar' */}
                {etapaSelecionada === 'Impossibilitado de trabalhar' && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 space-y-1.5">
                    <Label
                      htmlFor="timeline-motivo"
                      className="flex items-center gap-1 text-xs font-bold text-amber-900"
                    >
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                      Motivo do impedimento (Obrigatório) *
                    </Label>
                    <Input
                      id="timeline-motivo"
                      placeholder="Descreva o motivo (ex: CNH suspensa, laudo médico pendente, etc.)"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      className="h-8 bg-white text-xs border-amber-300"
                      required
                    />
                  </div>
                )}

                {/* Checklist de Entrega de Documentos (RH / Admin) */}
                {etapaSelecionada === 'Entrega dos documentos' && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2.5">
                    <div className="flex items-center justify-between border-b pb-1.5">
                      <Label className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                        <FileCheck2 className="h-3.5 w-3.5 text-primary" />
                        Checklist de Documentos ({documentosRecebidos.length}/
                        {TIMELINE_DOCUMENTOS_OBRIGATORIOS.length})
                      </Label>
                      {docsAindaPendentes.length > 0 && (
                        <button
                          type="button"
                          onClick={handleMarcarTodosPendentes}
                          className="text-[11px] font-medium text-primary hover:underline"
                        >
                          {documentosAdicionadosNestaEntrega.length === docsAindaPendentes.length
                            ? 'Desmarcar novos'
                            : 'Marcar pendentes'}
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {listaDocsJaRecebidos.length > 0
                        ? `${listaDocsJaRecebidos.length} documento(s) já recebido(s) anteriormente. Marque abaixo somente os novos documentos entregues hoje:`
                        : 'Selecione os documentos entregues pelo colaborador nesta etapa. Documentos desmarcados serão marcados como pendentes.'}
                    </p>

                    <div className="space-y-2 pt-0.5">
                      {TIMELINE_DOCUMENTOS_OBRIGATORIOS.map((doc) => {
                        const jaRecebido = documentosJaRecebidosInfo.get(doc)
                        const marcadoNestaEntrega = documentosAdicionadosNestaEntrega.includes(doc)
                        const isChecked = Boolean(jaRecebido) || marcadoNestaEntrega

                        let dataHoraFormatada = ''
                        if (jaRecebido?.data_hora) {
                          try {
                            const d = new Date(jaRecebido.data_hora)
                            dataHoraFormatada = d.toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                            })
                          } catch (_) {
                            dataHoraFormatada = ''
                          }
                        }

                        return (
                          <div
                            key={doc}
                            className={cn(
                              'flex flex-col gap-1 rounded-md p-2 border transition-colors',
                              jaRecebido
                                ? 'bg-emerald-50/70 border-emerald-200'
                                : marcadoNestaEntrega
                                  ? 'bg-blue-50/70 border-blue-200'
                                  : 'bg-white border-border',
                            )}
                          >
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id={`doc-${doc}`}
                                checked={isChecked}
                                disabled={Boolean(jaRecebido)}
                                onCheckedChange={() => handleToggleDocumento(doc)}
                              />
                              <label
                                htmlFor={`doc-${doc}`}
                                className={cn(
                                  'text-xs font-medium flex-1 select-none',
                                  jaRecebido
                                    ? 'text-emerald-950 cursor-default'
                                    : 'text-foreground cursor-pointer',
                                )}
                              >
                                {doc}
                              </label>

                              {jaRecebido ? (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-100/90 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                  Já recebido
                                </span>
                              ) : marcadoNestaEntrega ? (
                                <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                                  <CheckCircle2 className="h-3 w-3 text-blue-600" />
                                  Entregue agora
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-100/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                  <AlertCircle className="h-3 w-3 text-amber-600" />
                                  Pendente
                                </span>
                              )}
                            </div>

                            {/* Detalhe do recebimento anterior (data + responsável) */}
                            {jaRecebido && (
                              <div className="pl-6 text-[10px] text-emerald-700 flex items-center gap-1">
                                <span>
                                  Recebido{dataHoraFormatada ? ` em ${dataHoraFormatada}` : ''} —{' '}
                                  <strong className="font-medium text-emerald-900">
                                    {jaRecebido.responsavel_nome}
                                  </strong>
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Alerta de Documentação Incompleta caso falte algum */}
                    {documentosRecebidos.length < TIMELINE_DOCUMENTOS_OBRIGATORIOS.length ? (
                      <div className="flex items-start gap-1.5 rounded-md bg-amber-100/70 p-2 text-[11px] text-amber-900">
                        <AlertCircle className="h-4 w-4 text-amber-600 flex-none mt-0.5" />
                        <div>
                          <strong>Documentação incompleta:</strong>{' '}
                          {TIMELINE_DOCUMENTOS_OBRIGATORIOS.filter(
                            (d) => !documentosRecebidos.includes(d),
                          ).join(', ')}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-md bg-emerald-100/70 p-2 text-[11px] text-emerald-900 font-medium">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-none" />
                        <span>Todos os 5 documentos obrigatórios foram recebidos!</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Campo livre de Observações (visível para RH e Tráfego) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="timeline-obs" className="text-xs font-semibold">
                      Observações
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      Visível para RH e Tráfego
                    </span>
                  </div>
                  <Textarea
                    id="timeline-obs"
                    placeholder="Anote o que aconteceu, motivo de parada, pendências a resolver ou detalhes do andamento…"
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    rows={2}
                    className="text-xs bg-white resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={submitting || !etapaSelecionada}
                  className="w-full h-9 text-xs font-semibold gap-1.5"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Registrando…
                    </>
                  ) : (
                    <>
                      <PlusCircle className="h-3.5 w-3.5" />
                      Registrar etapa na linha do tempo
                    </>
                  )}
                </Button>
              </form>
            </div>
          </div>

          {/* LADO DIREITO: LINHA DO TEMPO (HISTÓRICO APPEND-ONLY) (7 cols) */}
          <div className="lg:col-span-7">
            <div className="flex h-full flex-col rounded-xl border bg-card p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">Linha do Tempo de Andamento</h3>
                </div>
                <span className="text-xs text-muted-foreground">
                  {timeline.length} registro(s) no histórico
                </span>
              </div>

              {/* Lista da Timeline */}
              <div className="flex-1 overflow-y-auto pr-1">
                {loadingTimeline ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    Carregando histórico da linha do tempo…
                  </div>
                ) : timeline.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                    <History className="h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-xs font-semibold text-foreground">
                      Nenhum andamento registrado ainda
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground max-w-sm">
                      Utilize o formulário ao lado para registrar o primeiro evento deste processo
                      (ex: Tráfego informado, Notificação do operador ou comparecimento).
                    </p>
                  </div>
                ) : (
                  <div className="relative border-l-2 border-primary/30 pl-4 ml-3 space-y-6">
                    {timeline.map((item, index) => {
                      const { data, hora } = formatDateTimeDisplay(item.data_hora || item.created)
                      const isCompleteDocs = item.status_documentacao === 'Documentação completa'
                      const isIncompleteDocs =
                        item.status_documentacao === 'Documentação incompleta'

                      return (
                        <div key={item.id || index} className="relative group">
                          {/* Marcador na linha */}
                          <div
                            className={cn(
                              'absolute -left-[23px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white transition-all',
                              item.etapa === 'Carta criada'
                                ? 'bg-emerald-600 ring-2 ring-emerald-300'
                                : item.etapa === 'Conclusão'
                                  ? 'bg-emerald-600 ring-2 ring-emerald-200'
                                  : item.etapa === 'Foto Bloqueada' ||
                                      item.etapa === 'Impossibilitado de trabalhar'
                                    ? 'bg-rose-600 ring-2 ring-rose-200'
                                    : 'bg-primary ring-2 ring-primary/20',
                            )}
                          >
                            <div className="h-1.5 w-1.5 rounded-full bg-white" />
                          </div>

                          {/* Card do evento */}
                          <div className="rounded-lg border bg-white p-3 shadow-xs hover:shadow-sm transition-shadow space-y-2">
                            {/* Cabeçalho do item: Etapa, Perfil, Data/Hora */}
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold',
                                    getEtapaBadgeStyle(item.etapa),
                                  )}
                                >
                                  {item.etapa === 'Carta criada' && (
                                    <Mail className="h-3.5 w-3.5 text-emerald-700 flex-none" />
                                  )}
                                  {item.etapa}
                                </span>
                                {getPerfilBadge(item.responsavel_perfil)}
                              </div>

                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="inline-flex items-center gap-1 font-medium">
                                  <Calendar className="h-3 w-3" />
                                  {data}
                                </span>
                                {hora && (
                                  <span className="inline-flex items-center gap-1 font-mono">
                                    <Clock className="h-3 w-3" />
                                    {hora}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Responsável que registrou */}
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <User className="h-3 w-3 text-muted-foreground/80" />
                              <span>Registrado por:</span>
                              <strong className="text-foreground font-medium">
                                {item.responsavel_nome}
                              </strong>
                            </div>

                            {/* Motivo (quando houver, ex: Impossibilitado de trabalhar) */}
                            {item.motivo && (
                              <div className="rounded-md border border-amber-200 bg-amber-50/80 p-2 text-xs">
                                <p className="font-bold text-amber-900 flex items-center gap-1">
                                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                                  Motivo informado:
                                </p>
                                <p className="mt-0.5 text-amber-800">{item.motivo}</p>
                              </div>
                            )}

                            {/* Checklist de Documentos (se for etapa de entrega OU carta criada) */}
                            {(item.etapa === 'Entrega dos documentos' ||
                              item.etapa === 'Carta criada') && (
                              <div className="rounded-md border bg-muted/30 p-2.5 text-xs space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-foreground flex items-center gap-1">
                                    <FileCheck2 className="h-3.5 w-3.5 text-primary" />
                                    {item.etapa === 'Carta criada'
                                      ? 'Documentos Anexados à Carta:'
                                      : 'Status da Documentação:'}
                                  </span>
                                  {item.etapa === 'Carta criada' ? (
                                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 text-[10px]">
                                      Todos os 5 anexos incluídos
                                    </Badge>
                                  ) : (
                                    <>
                                      {isCompleteDocs && (
                                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 text-[10px]">
                                          Documentação completa
                                        </Badge>
                                      )}
                                      {isIncompleteDocs && (
                                        <Badge variant="destructive" className="text-[10px]">
                                          Documentação incompleta
                                        </Badge>
                                      )}
                                    </>
                                  )}
                                </div>

                                {/* Lista de recebidos / anexados */}
                                {item.documentos_recebidos &&
                                  item.documentos_recebidos.length > 0 && (
                                    <div className="space-y-1">
                                      <span className="text-[11px] font-semibold text-emerald-800">
                                        {item.etapa === 'Carta criada'
                                          ? `Anexos conferidos (${item.documentos_recebidos.length}):`
                                          : `Documentos recebidos (${item.documentos_recebidos.length}):`}
                                      </span>
                                      <div className="flex flex-wrap gap-1">
                                        {item.documentos_recebidos.map((doc) => (
                                          <span
                                            key={doc}
                                            className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200"
                                          >
                                            <CheckCircle2 className="h-2.5 w-2.5" />
                                            {doc}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                {/* Lista de pendentes */}
                                {item.documentos_pendentes &&
                                  item.documentos_pendentes.length > 0 && (
                                    <div className="space-y-1 pt-1 border-t border-border/50">
                                      <span className="text-[11px] font-semibold text-amber-800">
                                        Documentos pendentes ({item.documentos_pendentes.length}):
                                      </span>
                                      <div className="flex flex-wrap gap-1">
                                        {item.documentos_pendentes.map((doc) => (
                                          <span
                                            key={doc}
                                            className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200"
                                          >
                                            <AlertCircle className="h-2.5 w-2.5" />
                                            {doc}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                              </div>
                            )}

                            {/* Observações registradas */}
                            {item.observacoes && (
                              <div className="rounded-md bg-muted/40 p-2 text-xs">
                                <span className="font-semibold text-muted-foreground block text-[10px] uppercase tracking-wide">
                                  Observação:
                                </span>
                                <p className="mt-0.5 text-foreground whitespace-pre-wrap">
                                  {item.observacoes}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
