import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  ArrowRightLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  History,
  Info,
  Loader2,
  Mail,
  Pencil,
  PlusCircle,
  ShieldAlert,
  Trash2,
  Truck,
  User,
  UserCheck,
  UserMinus,
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
import { getCamposFixosColaborador } from '@/components/CartaProcessoModal'
import {
  TIMELINE_ETAPAS_ORDEM,
  type ProcessoCadastralRecord,
  type ProcessoSituacao,
  type ProcessoTimelineRecord,
  type UserRole,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  createTimelineItem,
  listTimelineByProcesso,
  updateTimelineItem,
} from '@/services/processoTimeline'
import {
  listAnexosByProcesso,
  getProcessoAnexoFileUrl,
  deleteProcessoAnexo,
  type ProcessoAnexoRecord,
} from '@/services/processoAnexos'

interface ProcessoDetalhesTimelineModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  processo: ProcessoCadastralRecord | null
  onProcessoUpdated?: (updated: ProcessoCadastralRecord) => void
  onEditProcesso?: (processo: ProcessoCadastralRecord) => void
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
  onEditProcesso,
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

  // Anexos vinculados a este colaborador/processo
  const [processoAnexos, setProcessoAnexos] = useState<ProcessoAnexoRecord[]>([])
  const [loadingAnexos, setLoadingAnexos] = useState(false)

  // Estado para Edição de Evento Individual da Timeline
  const [eventoEmEdicao, setEventoEmEdicao] = useState<ProcessoTimelineRecord | null>(null)
  const [editEtapa, setEditEtapa] = useState('')
  const [editDataHora, setEditDataHora] = useState('')
  const [editObservacoes, setEditObservacoes] = useState('')
  const [editMotivo, setEditMotivo] = useState('')
  const [editResponsavelNome, setEditResponsavelNome] = useState('')
  const [editResponsavelPerfil, setEditResponsavelPerfil] = useState<UserRole>('RH')
  const [editDocumentosRecebidos, setEditDocumentosRecebidos] = useState<string[]>([])
  const [savingEdit, setSavingEdit] = useState(false)

  // Carregar timeline e anexos ao abrir o modal
  useEffect(() => {
    if (!open || !processo) {
      setTimeline([])
      setProcessoAnexos([])
      setEtapaSelecionada('')
      setObservacoes('')
      setMotivo('')
      setDocumentosRecebidos([])
      setDocumentosAdicionadosNestaEntrega([])
      setEventoEmEdicao(null)
      return
    }

    let active = true
    setLoadingTimeline(true)
    setLoadingAnexos(true)

    listAnexosByProcesso(processo.id)
      .then((anexos) => {
        if (!active) return
        setProcessoAnexos(anexos)
      })
      .catch((err) => {
        console.warn('Erro ao carregar anexos do processo:', err)
      })
      .finally(() => {
        if (active) setLoadingAnexos(false)
      })

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

  // Lista oficial de campos fixos / documentos obrigatórios para este processo cadastral,
  // obtida estritamente via getCamposFixosColaborador conforme o Tipo de Processo e Função
  const docsObrigatoriosProcesso = useMemo(() => {
    if (!processo) return []
    return getCamposFixosColaborador(
      {
        nome: processo.colaborador,
        matricula: processo.matricula,
        funcao: processo.funcao,
        processoTipo: processo.processo,
      },
      processo.processo,
    )
  }, [processo])

  // Lista dos documentos já recebidos anteriormente
  const listaDocsJaRecebidos = useMemo(() => {
    return Array.from(documentosJaRecebidosInfo.keys())
  }, [documentosJaRecebidosInfo])

  // Documentos que ainda estão pendentes de entrega
  const docsAindaPendentes = useMemo(() => {
    return docsObrigatoriosProcesso.filter((doc) => !documentosJaRecebidosInfo.has(doc))
  }, [docsObrigatoriosProcesso, documentosJaRecebidosInfo])

  // Inicializa o checklist cumulativo ao selecionar "Entrega dos documentos"
  useEffect(() => {
    if (etapaSelecionada === 'Entrega dos documentos') {
      // Documentos recebidos acumulados = já recebidos antes (que pertençam aos docs do processo) + os marcados nesta nova entrega
      const jaRecebidosValidos = listaDocsJaRecebidos.filter((d) =>
        docsObrigatoriosProcesso.includes(d),
      )
      setDocumentosRecebidos([...jaRecebidosValidos, ...documentosAdicionadosNestaEntrega])
    }
  }, [
    etapaSelecionada,
    listaDocsJaRecebidos,
    documentosAdicionadosNestaEntrega,
    docsObrigatoriosProcesso,
  ])

  // Lista de documentos possíveis para o checklist do evento em edição
  // Deve mostrar estritamente as opções do Tipo do Evento/Processo e função do colaborador
  // (a mesma lista de anexos do pop-up da carta via getCamposFixosColaborador), preservando
  // documentos já salvos no evento para retrocompatibilidade
  const docsChecklistEdicao = useMemo(() => {
    if (!eventoEmEdicao || !processo) return []
    // 1. Obtém a lista exata dos campos fixos daquele tipo de processo e função do colaborador
    const camposFixos = docsObrigatoriosProcesso
    // Mantém a ordem original da lista de campos fixos do tipo de processo/função
    const listaResultante: string[] = []
    const setDocs = new Set<string>()

    for (const d of camposFixos) {
      if (d && !setDocs.has(d)) {
        setDocs.add(d)
        listaResultante.push(d)
      }
    }

    // Se o evento já possuía documentos recebidos ou pendentes gravados anteriormente
    // que não estejam na lista oficial do tipo, preserva-os no final para não perder dados legados
    if (Array.isArray(eventoEmEdicao.documentos_recebidos)) {
      for (const d of eventoEmEdicao.documentos_recebidos) {
        if (d && !setDocs.has(d)) {
          setDocs.add(d)
          listaResultante.push(d)
        }
      }
    }
    if (Array.isArray(eventoEmEdicao.documentos_pendentes)) {
      for (const d of eventoEmEdicao.documentos_pendentes) {
        if (d && !setDocs.has(d)) {
          setDocs.add(d)
          listaResultante.push(d)
        }
      }
    }

    return listaResultante
  }, [eventoEmEdicao, processo])

  // Identifica se o evento em edição possui checklist de documentos
  const temChecklistNoEventoEmEdicao = useMemo(() => {
    if (!eventoEmEdicao) return false
    const hasDocsRecebidos =
      Array.isArray(eventoEmEdicao.documentos_recebidos) &&
      eventoEmEdicao.documentos_recebidos.length > 0
    const hasDocsPendentes =
      Array.isArray(eventoEmEdicao.documentos_pendentes) &&
      eventoEmEdicao.documentos_pendentes.length > 0
    const isEtapaChecklist =
      eventoEmEdicao.etapa === 'Entrega dos documentos' ||
      eventoEmEdicao.etapa === 'Carta criada' ||
      eventoEmEdicao.etapa === 'Conferência' ||
      eventoEmEdicao.etapa === 'Pendências'
    return hasDocsRecebidos || hasDocsPendentes || isEtapaChecklist
  }, [eventoEmEdicao])

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
        docsPendentes = docsObrigatoriosProcesso.filter((doc) => !documentosRecebidos.includes(doc))
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

  // Permissão para editar eventos individuais: Admin e RH
  const canEditTimelineEvents = isAdmin || isRH

  // Converte data ISO ou string da timeline para formato datetime-local (YYYY-MM-DDTHH:mm)
  const toInputDateTimeValue = (isoString?: string) => {
    if (!isoString) return ''
    try {
      const d = new Date(isoString)
      if (isNaN(d.getTime())) return ''
      // Formata como YYYY-MM-DDTHH:mm no fuso local
      const pad = (n: number) => String(n).padStart(2, '0')
      const year = d.getFullYear()
      const month = pad(d.getMonth() + 1)
      const day = pad(d.getDate())
      const hours = pad(d.getHours())
      const minutes = pad(d.getMinutes())
      return `${year}-${month}-${day}T${hours}:${minutes}`
    } catch (_) {
      return ''
    }
  }

  const handleOpenEditModal = (item: ProcessoTimelineRecord) => {
    setEventoEmEdicao(item)
    setEditEtapa(item.etapa || '')
    setEditDataHora(toInputDateTimeValue(item.data_hora || item.created))
    setEditObservacoes(item.observacoes || '')
    setEditMotivo(item.motivo || '')
    setEditResponsavelNome(item.responsavel_nome || '')
    setEditResponsavelPerfil(item.responsavel_perfil || 'RH')
    setEditDocumentosRecebidos(
      Array.isArray(item.documentos_recebidos) ? [...item.documentos_recebidos] : [],
    )
  }

  const handleToggleEditDocumento = (doc: string) => {
    setEditDocumentosRecebidos((prev) =>
      prev.includes(doc) ? prev.filter((d) => d !== doc) : [...prev, doc],
    )
  }

  const handleMarcarTodosEditDocs = () => {
    if (editDocumentosRecebidos.length === docsChecklistEdicao.length) {
      setEditDocumentosRecebidos([])
    } else {
      setEditDocumentosRecebidos([...docsChecklistEdicao])
    }
  }

  const handleSaveEventoEdicao = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!eventoEmEdicao) return

    setSavingEdit(true)
    try {
      // Verifica se houve alguma alteração real nos campos editáveis (observações, motivo e checklist)
      const obsOriginal = (eventoEmEdicao.observacoes || '').trim()
      const obsAtual = editObservacoes.trim()
      const motivoOriginal = (eventoEmEdicao.motivo || '').trim()
      const motivoAtual = editMotivo.trim()

      const docsRecebidosOrig = [...(eventoEmEdicao.documentos_recebidos || [])].sort()
      const docsRecebidosNovos = [...editDocumentosRecebidos].sort()
      const checklistMudou =
        temChecklistNoEventoEmEdicao &&
        (docsRecebidosOrig.length !== docsRecebidosNovos.length ||
          docsRecebidosOrig.some((d, idx) => d !== docsRecebidosNovos[idx]))

      const houveMudancaEditavel =
        obsOriginal !== obsAtual || motivoOriginal !== motivoAtual || checklistMudou

      // Se nada editável mudou, apenas fecha o modal sem regravar auditoria desnecessária
      if (!houveMudancaEditavel) {
        toast.info('Nenhuma alteração foi realizada.')
        setEventoEmEdicao(null)
        setSavingEdit(false)
        return
      }

      // Calcula nova lista de pendentes e status se houver checklist
      let docsPendentesNovos: string[] | undefined = undefined
      let novoStatusDocs: string | undefined = undefined

      if (temChecklistNoEventoEmEdicao) {
        docsPendentesNovos = docsChecklistEdicao.filter(
          (doc) => !editDocumentosRecebidos.includes(doc),
        )
        novoStatusDocs =
          docsPendentesNovos.length > 0 ? 'Documentação incompleta' : 'Documentação completa'
      }

      const updatedRecord = await updateTimelineItem(eventoEmEdicao.id, {
        observacoes: obsAtual,
        motivo: motivoAtual,
        ...(temChecklistNoEventoEmEdicao
          ? {
              documentos_recebidos: editDocumentosRecebidos,
              documentos_pendentes: docsPendentesNovos,
              status_documentacao: novoStatusDocs,
            }
          : {}),
        alterado_por: currentUserName,
        alterado_em: new Date().toISOString(),
      })

      // Atualiza a lista da timeline local
      setTimeline((prev) =>
        prev.map((item) => (item.id === updatedRecord.id ? updatedRecord : item)),
      )

      toast.success('Evento da linha do tempo atualizado com sucesso!')
      setEventoEmEdicao(null)
    } catch (err) {
      console.error('Erro ao atualizar evento da timeline:', err)
      toast.error('Erro ao salvar edição do evento. Tente novamente.')
    } finally {
      setSavingEdit(false)
    }
  }

  const getEtapaBadgeStyle = (etapa: string) => {
    switch (etapa) {
      case 'Processo criado':
        return 'bg-slate-50 text-slate-800 border-slate-200'
      case 'Carta criada':
        return 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-200'
      case 'Processo editado':
        return 'bg-rose-50 text-rose-700 border-rose-300 ring-1 ring-rose-200'
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
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Info className="h-4 w-4 text-primary" />
                  Dados Cadastrais
                </h3>
                {!isTrafego && onEditProcesso && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onEditProcesso(processo)}
                    className="h-7 px-2 text-xs font-medium gap-1.5"
                    title="Editar processo cadastral"
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    Editar processo
                  </Button>
                )}
              </div>

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
                {processo.processo !== 'Mudança de Função' && (
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Prazo:</span>
                    <span className="font-medium text-foreground">
                      {formatDate(processo.prazo)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Situação Atual:</span>
                  <span className="rounded-full border bg-muted/60 px-2.5 py-0.5 text-[11px] font-semibold text-foreground">
                    {processo.situacao}
                  </span>
                </div>
              </div>

              {/* Bloco exclusivo para Mudança de Função */}
              {processo.processo === 'Mudança de Função' &&
                (processo.funcao_antiga || processo.funcao_atual || processo.data_troca_funcao) && (
                  <div className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/60 p-3 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 font-bold text-amber-900">
                      <ArrowRightLeft className="h-3.5 w-3.5 text-amber-700" />
                      <span>Dados da Mudança de Função</span>
                    </div>

                    <div className="flex items-center gap-2 rounded bg-white/80 p-2 border border-amber-200">
                      <div className="flex-1">
                        <span className="block text-[10px] text-muted-foreground">
                          Função Antiga
                        </span>
                        <span className="font-semibold text-foreground">
                          {processo.funcao_antiga || '—'}
                        </span>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-amber-600 flex-none" />
                      <div className="flex-1">
                        <span className="block text-[10px] text-muted-foreground">
                          Função Atual
                        </span>
                        <span className="font-semibold text-emerald-700">
                          {processo.funcao_atual || '—'}
                        </span>
                      </div>
                    </div>

                    {processo.data_troca_funcao && (
                      <div className="flex items-center justify-between pt-0.5 text-[11px]">
                        <span className="text-amber-900 font-medium">Data de Troca de Função:</span>
                        <span className="font-semibold text-foreground">
                          {formatDate(processo.data_troca_funcao)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

              {/* Bloco exclusivo para Exclusão (Dados do Desligamento) */}
              {processo.processo === 'Exclusão' &&
                (processo.data_desligamento || processo.motivo_desligamento) && (
                  <div className="mt-3 rounded-lg border border-rose-200/80 bg-rose-50/60 p-3 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 font-bold text-rose-900">
                      <UserMinus className="h-3.5 w-3.5 text-rose-700" />
                      <span>Dados do Desligamento</span>
                    </div>

                    <div className="space-y-2 rounded bg-white/80 p-2.5 border border-rose-200">
                      {processo.data_desligamento && (
                        <div className="flex items-center justify-between text-[11px] border-b pb-1.5 border-rose-100">
                          <span className="text-rose-900 font-medium">Data Desligamento:</span>
                          <span className="font-semibold text-foreground">
                            {formatDate(processo.data_desligamento)}
                          </span>
                        </div>
                      )}

                      {processo.motivo_desligamento && (
                        <div className="text-[11px]">
                          <span className="block text-[10px] text-muted-foreground mb-0.5">
                            Motivo Desligamento:
                          </span>
                          <span className="font-semibold text-rose-950 block leading-snug break-words whitespace-pre-wrap">
                            {processo.motivo_desligamento}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              {/* Bloco exclusivo para Retorno do Afastamento (Dados do Afastamento) */}
              {processo.processo === 'Retorno do Afastamento' &&
                (processo.data_afastamento ||
                  processo.data_retorno_afastamento ||
                  processo.dias_afastado !== undefined ||
                  processo.motivo_afastamento) && (
                  <div className="mt-3 rounded-lg border border-indigo-200/80 bg-indigo-50/60 p-3 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 font-bold text-indigo-900">
                      <UserCheck className="h-3.5 w-3.5 text-indigo-700" />
                      <span>Dados do Afastamento</span>
                    </div>

                    <div className="space-y-2 rounded bg-white/80 p-2.5 border border-indigo-200">
                      {processo.data_afastamento && (
                        <div className="flex items-center justify-between text-[11px] border-b pb-1.5 border-indigo-100">
                          <span className="text-indigo-900 font-medium">Data do Afastamento:</span>
                          <span className="font-semibold text-foreground">
                            {formatDate(processo.data_afastamento)}
                          </span>
                        </div>
                      )}

                      {processo.data_retorno_afastamento && (
                        <div className="flex items-center justify-between text-[11px] border-b pb-1.5 border-indigo-100">
                          <span className="text-indigo-900 font-medium">
                            Retorno do Afastamento:
                          </span>
                          <span className="font-semibold text-foreground">
                            {formatDate(processo.data_retorno_afastamento)}
                          </span>
                        </div>
                      )}

                      {processo.dias_afastado !== undefined && processo.dias_afastado !== null && (
                        <div className="flex items-center justify-between text-[11px] border-b pb-1.5 border-indigo-100">
                          <span className="text-indigo-900 font-medium">Dias Afastado:</span>
                          <span className="font-semibold text-indigo-950">
                            {processo.dias_afastado} dia(s)
                          </span>
                        </div>
                      )}

                      {processo.motivo_afastamento && (
                        <div className="text-[11px]">
                          <span className="block text-[10px] text-muted-foreground mb-0.5">
                            Motivo do Afastamento:
                          </span>
                          <span className="font-semibold text-indigo-950 block leading-snug">
                            {processo.motivo_afastamento}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              {/* Bloco de Anexos do Colaborador (Documentos pessoais, comprovantes da carta) */}
              {(processoAnexos.length > 0 || loadingAnexos) && (
                <div className="mt-3 rounded-lg border border-emerald-200/80 bg-emerald-50/50 p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between font-bold text-emerald-950">
                    <span className="flex items-center gap-1.5">
                      <FileCheck2 className="h-3.5 w-3.5 text-emerald-700" />
                      Documentos Anexados ({processoAnexos.length})
                    </span>
                    {loadingAnexos && (
                      <span className="text-[10px] text-muted-foreground">Carregando…</span>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {processoAnexos.map((anexo, aIdx) => {
                      const urlVis = getProcessoAnexoFileUrl(anexo)
                      const urlDown = getProcessoAnexoFileUrl(anexo, undefined, { download: true })
                      const canDeleteAnexo = isAdmin || isRH || anexo.criado_por === user?.id

                      return (
                        <div
                          key={`${anexo.id}-${aIdx}`}
                          className="flex items-center justify-between gap-2 rounded-md border bg-card p-2 text-xs"
                        >
                          {' '}
                          <div className="flex items-center gap-1.5 min-w-0">
                            <FileText className="h-3.5 w-3.5 flex-none text-emerald-700" />
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">
                                {anexo.titulo || anexo.arquivo}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {anexo.arquivo}
                                {anexo.tamanho ? ` · ${(anexo.tamanho / 1024).toFixed(0)} KB` : ''}
                                {anexo.numero_carta ? ` · Carta ${anexo.numero_carta}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-none">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(urlVis, '_blank', 'noopener,noreferrer')}
                              className="h-6 px-1.5 text-[11px]"
                              title="Visualizar anexo"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const win = window.open(urlDown, '_blank')
                                if (!win) window.location.href = urlDown
                              }}
                              className="h-6 px-1.5 text-[11px]"
                              title="Baixar anexo"
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                            {canDeleteAnexo && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  try {
                                    await deleteProcessoAnexo(anexo.id)
                                    setProcessoAnexos((prev) =>
                                      prev.filter((x) => x.id !== anexo.id),
                                    )
                                    // Registra evento de exclusão na timeline do processo
                                    try {
                                      const novoItem = await createTimelineItem({
                                        processo: processo.id,
                                        etapa: 'Documento removido',
                                        responsavel_nome: currentUserName,
                                        responsavel_perfil: currentRole,
                                        observacoes: `Documento removido: ${anexo.titulo || anexo.arquivo}`,
                                      })
                                      setTimeline((prev) => [...prev, novoItem])
                                    } catch (tlErr) {
                                      console.warn('Erro ao registrar exclusão na timeline:', tlErr)
                                    }
                                    toast.success('Anexo excluído com sucesso.')
                                  } catch (err) {
                                    toast.error('Erro ao excluir anexo.')
                                  }
                                }}
                                className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                                title="Excluir anexo"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
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
                      if (val !== 'Entrega dos documentos') {
                        setDocumentosAdicionadosNestaEntrega([])
                        setDocumentosRecebidos([])
                      }
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
                        {docsObrigatoriosProcesso.length})
                      </Label>
                      {docsAindaPendentes.length > 0 && (
                        <button
                          type="button"
                          onClick={handleMarcarTodosPendentes}
                          className="text-[11px] font-medium text-primary hover:underline"
                        >
                          {documentosAdicionadosNestaEntrega.length === docsAindaPendentes.length
                            ? 'Desmarcar todos'
                            : 'Marcar todos'}
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {listaDocsJaRecebidos.filter((d) => docsObrigatoriosProcesso.includes(d))
                        .length > 0
                        ? `${listaDocsJaRecebidos.filter((d) => docsObrigatoriosProcesso.includes(d)).length} documento(s) já recebido(s) anteriormente. Marque abaixo somente os novos documentos entregues hoje:`
                        : 'Selecione os documentos entregues pelo colaborador nesta etapa. Documentos desmarcados serão marcados como pendentes.'}
                    </p>

                    <div className="space-y-2 pt-0.5">
                      {docsObrigatoriosProcesso.map((doc) => {
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
                    {documentosRecebidos.length < docsObrigatoriosProcesso.length ? (
                      <div className="flex items-start gap-1.5 rounded-md bg-amber-100/70 p-2 text-[11px] text-amber-900">
                        <AlertCircle className="h-4 w-4 text-amber-600 flex-none mt-0.5" />
                        <div>
                          <strong>Documentação incompleta:</strong>{' '}
                          {docsObrigatoriosProcesso
                            .filter((d) => !documentosRecebidos.includes(d))
                            .join(', ')}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-md bg-emerald-100/70 p-2 text-[11px] text-emerald-900 font-medium">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-none" />
                        <span>
                          Todos os {docsObrigatoriosProcesso.length} documentos obrigatórios foram
                          recebidos!
                        </span>
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
                        <div key={`${item.id || 'tl'}-${index}`} className="relative group">
                          {/* Marcador na linha */}
                          <div
                            className={cn(
                              'absolute -left-[23px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white transition-all',
                              item.etapa === 'Processo editado'
                                ? 'bg-rose-600 ring-2 ring-rose-300'
                                : item.etapa === 'Carta criada'
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
                          <div
                            className={cn(
                              'rounded-lg border p-3 shadow-xs hover:shadow-sm transition-shadow space-y-2',
                              item.etapa === 'Processo editado'
                                ? 'border-rose-300 bg-rose-50/70'
                                : 'border-border bg-white',
                            )}
                          >
                            {/* Cabeçalho do item: Etapa, Perfil, Data/Hora e Botão de Editar */}
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
                                  {item.etapa === 'Processo editado' && (
                                    <Pencil className="h-3.5 w-3.5 text-rose-700 flex-none" />
                                  )}
                                  {item.etapa}
                                </span>
                                {getPerfilBadge(item.responsavel_perfil)}
                              </div>

                              <div className="flex items-center gap-2">
                                <div
                                  className={cn(
                                    'flex items-center gap-2 text-[11px]',
                                    item.etapa === 'Processo editado'
                                      ? 'text-rose-700'
                                      : 'text-muted-foreground',
                                  )}
                                >
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

                                {/* Botão de editar evento individual (Admin / RH) */}
                                {canEditTimelineEvents && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenEditModal(item)}
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-primary hover:bg-muted"
                                    title={`Editar evento "${item.etapa}"`}
                                    aria-label={`Editar evento "${item.etapa}"`}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Aviso de Edição do Evento em FONTE VERMELHA permanente para controle do RH */}
                            {item.alterado_por && (
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 border-l-2 border-rose-500 pl-2 py-0.5 bg-rose-50/60 rounded-r">
                                <AlertCircle className="h-3.5 w-3.5 flex-none text-rose-600" />
                                <span>
                                  Alterado por {item.alterado_por}
                                  {item.alterado_em ? (
                                    <>
                                      , em{' '}
                                      {new Date(item.alterado_em).toLocaleDateString('pt-BR', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                      })}{' '}
                                      às{' '}
                                      {new Date(item.alterado_em).toLocaleTimeString('pt-BR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </>
                                  ) : null}
                                </span>
                              </div>
                            )}

                            {/* Destaque em vermelho para "Processo editado" */}
                            {item.etapa === 'Processo editado' && (
                              <div className="text-xs font-semibold text-rose-600">
                                Processo editado por {item.responsavel_nome} em {data} às {hora}
                              </div>
                            )}

                            {/* Responsável que registrou */}
                            <div
                              className={cn(
                                'flex items-center gap-1 text-[11px]',
                                item.etapa === 'Processo editado'
                                  ? 'text-rose-800'
                                  : 'text-muted-foreground',
                              )}
                            >
                              <User
                                className={cn(
                                  'h-3 w-3',
                                  item.etapa === 'Processo editado'
                                    ? 'text-rose-600'
                                    : 'text-muted-foreground/80',
                                )}
                              />
                              <span>Registrado por:</span>
                              <strong
                                className={cn(
                                  'font-medium',
                                  item.etapa === 'Processo editado'
                                    ? 'text-rose-950'
                                    : 'text-foreground',
                                )}
                              >
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
                                      {item.documentos_recebidos &&
                                      item.documentos_recebidos.length > 0
                                        ? `Todos os ${item.documentos_recebidos.length} anexos incluídos`
                                        : 'Todos os anexos incluídos'}
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

      {/* Modal secundário de Edição do Evento Individual da Timeline */}
      <Dialog
        open={Boolean(eventoEmEdicao)}
        onOpenChange={(isOpen) => {
          if (!isOpen && !savingEdit) setEventoEmEdicao(null)
        }}
      >
        <DialogContent className="max-w-lg p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Pencil className="h-4 w-4 text-primary" />
              Editar Evento da Linha do Tempo
            </DialogTitle>
            <DialogDescription className="text-xs">
              Atualize as informações deste evento. Ao salvar, será registrado permanentemente um
              aviso em vermelho informando quem alterou e a data/hora para controle do RH.
            </DialogDescription>
          </DialogHeader>

          {eventoEmEdicao && (
            <form onSubmit={handleSaveEventoEdicao} className="space-y-3.5 pt-2">
              {/* Etapa / Nome do evento (BLOQUEADO / SOMENTE LEITURA) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="edit-evento-etapa"
                    className="text-xs font-semibold text-muted-foreground"
                  >
                    Etapa / Título do Evento
                  </Label>
                  <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.2">
                    Bloqueado para edição
                  </span>
                </div>
                <Input
                  id="edit-evento-etapa"
                  value={editEtapa}
                  readOnly
                  disabled
                  className="h-8 text-xs bg-muted/60 text-muted-foreground cursor-not-allowed select-none font-medium"
                />
              </div>

              {/* Data e Hora do evento (BLOQUEADO / SOMENTE LEITURA) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="edit-evento-datahora"
                    className="text-xs font-semibold text-muted-foreground"
                  >
                    Data e Hora do Evento
                  </Label>
                  <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.2">
                    Bloqueado para edição
                  </span>
                </div>
                <Input
                  id="edit-evento-datahora"
                  type="datetime-local"
                  value={editDataHora}
                  readOnly
                  disabled
                  className="h-8 text-xs bg-muted/60 text-muted-foreground cursor-not-allowed select-none"
                />
              </div>

              {/* Responsável e Perfil (BLOQUEADOS / SOMENTE LEITURA) */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="edit-evento-resp-nome"
                      className="text-xs font-semibold text-muted-foreground truncate"
                    >
                      Nome (Registrado por)
                    </Label>
                  </div>
                  <Input
                    id="edit-evento-resp-nome"
                    value={editResponsavelNome}
                    readOnly
                    disabled
                    placeholder="Nome do responsável"
                    className="h-8 text-xs bg-muted/60 text-muted-foreground cursor-not-allowed select-none font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="edit-evento-resp-perfil"
                      className="text-xs font-semibold text-muted-foreground"
                    >
                      Perfil
                    </Label>
                  </div>
                  <Input
                    id="edit-evento-resp-perfil"
                    value={editResponsavelPerfil}
                    readOnly
                    disabled
                    className="h-8 text-xs bg-muted/60 text-muted-foreground cursor-not-allowed select-none font-medium"
                  />
                </div>
              </div>

              {/* Checklist de Documentos para Edição (se houver documentos associados ao evento) */}
              {temChecklistNoEventoEmEdicao && docsChecklistEdicao.length > 0 && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2.5">
                  <div className="flex items-center justify-between border-b pb-1.5">
                    <Label className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                      <FileCheck2 className="h-3.5 w-3.5 text-primary" />
                      Checklist de Documentos ({editDocumentosRecebidos.length}/
                      {docsChecklistEdicao.length})
                    </Label>
                    <button
                      type="button"
                      onClick={handleMarcarTodosEditDocs}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      {editDocumentosRecebidos.length === docsChecklistEdicao.length
                        ? 'Desmarcar todos'
                        : 'Marcar todos'}
                    </button>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Marque os documentos entregues e desmarque os que estão pendentes:
                  </p>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 pt-0.5">
                    {docsChecklistEdicao.map((doc) => {
                      const isChecked = editDocumentosRecebidos.includes(doc)
                      return (
                        <div
                          key={doc}
                          className={cn(
                            'flex items-center justify-between gap-2 rounded-md p-2 border transition-colors cursor-pointer',
                            isChecked
                              ? 'bg-emerald-50/80 border-emerald-300'
                              : 'bg-white border-border hover:bg-muted/40',
                          )}
                          onClick={() => handleToggleEditDocumento(doc)}
                        >
                          <div className="flex items-center space-x-2 min-w-0">
                            <Checkbox
                              id={`edit-doc-${doc}`}
                              checked={isChecked}
                              onCheckedChange={() => handleToggleEditDocumento(doc)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <label
                              htmlFor={`edit-doc-${doc}`}
                              className={cn(
                                'text-xs font-medium cursor-pointer truncate select-none',
                                isChecked ? 'text-emerald-950 font-semibold' : 'text-foreground',
                              )}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {doc}
                            </label>
                          </div>

                          {isChecked ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 flex-none">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              Entregue
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-100/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 flex-none">
                              <AlertCircle className="h-3 w-3 text-amber-600" />
                              Pendente
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Resumo do checklist */}
                  {editDocumentosRecebidos.length < docsChecklistEdicao.length ? (
                    <div className="flex items-start gap-1.5 rounded-md bg-amber-100/70 p-2 text-[11px] text-amber-900">
                      <AlertCircle className="h-4 w-4 text-amber-600 flex-none mt-0.5" />
                      <div>
                        <strong>Documentação pendente:</strong>{' '}
                        {docsChecklistEdicao
                          .filter((d) => !editDocumentosRecebidos.includes(d))
                          .join(', ')}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 rounded-md bg-emerald-100/70 p-2 text-[11px] text-emerald-900 font-medium">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-none" />
                      <span>Todos os documentos do checklist estão marcados como entregues!</span>
                    </div>
                  )}
                </div>
              )}

              {/* Motivo (se for etapa de bloqueio/impossibilitado) */}
              {(editEtapa === 'Impossibilitado de trabalhar' ||
                editEtapa === 'Foto Bloqueada' ||
                eventoEmEdicao.motivo) && (
                <div className="space-y-1">
                  <Label htmlFor="edit-evento-motivo" className="text-xs font-semibold">
                    Motivo informado
                  </Label>
                  <Input
                    id="edit-evento-motivo"
                    value={editMotivo}
                    onChange={(e) => setEditMotivo(e.target.value)}
                    placeholder="Descreva o motivo..."
                    className="h-8 text-xs bg-white"
                  />
                </div>
              )}

              {/* Observações (EDITÁVEL) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-evento-obs" className="text-xs font-semibold">
                    Observações
                  </Label>
                  <span className="text-[10px] text-muted-foreground">Editável</span>
                </div>
                <Textarea
                  id="edit-evento-obs"
                  value={editObservacoes}
                  onChange={(e) => setEditObservacoes(e.target.value)}
                  placeholder="Observações do evento..."
                  rows={3}
                  className="text-xs bg-white resize-none"
                />
              </div>

              {/* Aviso da auditoria que será gravada */}
              <div className="rounded-md border border-rose-200 bg-rose-50/70 p-2.5 text-[11px] text-rose-800 space-y-1">
                <div className="flex items-center gap-1 font-bold text-rose-900">
                  <AlertCircle className="h-3.5 w-3.5 text-rose-600 flex-none" />
                  <span>Aviso de Auditoria do RH</span>
                </div>
                <p>
                  Ao salvar alterações, este item exibirá em fonte vermelha permanente:{' '}
                  <strong>
                    &quot;Alterado por {currentUserName}, em{' '}
                    {new Date().toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}{' '}
                    às{' '}
                    {new Date().toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    &quot;
                  </strong>
                  .
                </p>
              </div>

              {/* Ações do Modal */}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEventoEmEdicao(null)}
                  disabled={savingEdit}
                  className="h-8 text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingEdit}
                  className="h-8 text-xs font-semibold gap-1.5"
                >
                  {savingEdit ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Salvando…
                    </>
                  ) : (
                    'Salvar Alterações'
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
