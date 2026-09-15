import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileDown,
  FilePlus2,
  FileText,
  FileX2,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  TriangleAlert,
  ArrowRightLeft,
  UserCheck,
  UserMinus,
} from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'

import NovaMovimentacaoModal from '@/components/NovaMovimentacaoModal'
import VisualizarCartasModal from '@/components/VisualizarCartasModal'
import CartaProcessoModal, { type CartaColaboradorInfo } from '@/components/CartaProcessoModal'
import { ProcessoDetalhesTimelineModal } from '@/components/ProcessoDetalhesTimelineModal'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useRealtime } from '@/hooks/use-realtime'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { formatDate } from '@/lib/format'
import { listEmployees, findEmployeeByMatriculaOrChapa } from '@/services/employees'
import { listCartas, type CartaRecord } from '@/services/cartas'
import {
  listProcessosCadastrais,
  createProcessoCadastral,
  updateProcessoCadastral,
  updateProcessoSituacao,
  deleteProcessoCadastral,
} from '@/services/processosCadastrais'
import { createTimelineItem } from '@/services/processoTimeline'
import { createMovement } from '@/services/movements'
import type {
  AlertaTrafego,
  Employee,
  MovementType,
  ProcessoCategoria,
  ProcessoSituacao,
  UserRole,
} from '@/lib/types'
import { cn } from '@/lib/utils'

// Categorias ativas para novos processos, formulários e cards de filtro
const CATEGORIAS = [
  'Inclusão',
  'PRAT',
  'Retorno do Afastamento',
  'Mudança de Função',
  'Exclusão',
  'Atualização',
] as const
type Categoria = (typeof CATEGORIAS)[number]

// Tipos de carta usados no sistema para opções do filtro
const TIPOS_CARTA_FILTRO = [
  'Inclusão',
  'PRAT',
  'Retorno do Afastamento',
  'Mudança de Função',
  'Exclusão',
  'Atualização',
] as const

const CARD_STYLES: Record<
  Categoria,
  { icon: typeof Plus; ring: string; bg: string; text: string }
> = {
  Inclusão: {
    icon: Plus,
    ring: 'border-emerald-200',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
  },
  PRAT: {
    icon: Plus,
    ring: 'border-teal-200',
    bg: 'bg-teal-50',
    text: 'text-teal-700',
  },
  'Retorno do Afastamento': {
    icon: UserCheck,
    ring: 'border-indigo-200',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
  },
  'Mudança de Função': {
    icon: RefreshCcw,
    ring: 'border-amber-200',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
  },
  Exclusão: { icon: FileX2, ring: 'border-rose-200', bg: 'bg-rose-50', text: 'text-rose-700' },
  Atualização: { icon: RefreshCcw, ring: 'border-sky-200', bg: 'bg-sky-50', text: 'text-sky-700' },
}

const PROCESSO_BADGE_STYLES: Record<Categoria, string> = {
  Inclusão: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PRAT: 'bg-teal-50 text-teal-700 border-teal-200',
  'Retorno do Afastamento': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Mudança de Função': 'bg-amber-50 text-amber-700 border-amber-200',
  Exclusão: 'bg-rose-50 text-rose-700 border-rose-200',
  Atualização: 'bg-sky-50 text-sky-700 border-sky-200',
}

const ETAPAS = [
  'Análise',
  'Aprovação',
  'Concluído',
  'Documentos solicitados',
  'Aguardando documentos',
] as const
type Etapa = (typeof ETAPAS)[number]

const SITUACOES_VALIDAS = [
  'Pendente',
  'Bloqueado',
  'Regular',
  'Foto Bloqueada',
  'Impossibilitado de Trabalhar',
] as const
type Situacao = (typeof SITUACOES_VALIDAS)[number]

const SITUACAO_STYLES: Record<Situacao, string> = {
  Pendente: 'bg-orange-100 text-orange-700 border-orange-200',
  Bloqueado: 'bg-red-100 text-red-700 border-red-200',
  Regular: 'bg-green-100 text-green-700 border-green-200',
  'Foto Bloqueada': 'bg-rose-100 text-rose-800 border-rose-300 font-semibold',
  'Impossibilitado de Trabalhar': 'bg-amber-100 text-amber-900 border-amber-300 font-semibold',
}

interface ProcessoCadastral {
  id: string
  matricula: string
  colaborador: string
  funcao: string
  processo: ProcessoCategoria
  etapa: Etapa
  prazo: string
  situacao: Situacao
  garagem: 'CURSINO' | 'SAPOPEMBA' | string
  alerta_trafego?: AlertaTrafego | string
  observacoes?: string
  funcao_antiga?: string
  funcao_atual?: string
  data_troca_funcao?: string
  data_desligamento?: string
  motivo_desligamento?: string
  data_afastamento?: string
  data_retorno_afastamento?: string
  dias_afastado?: number
  motivo_afastamento?: string
}

const ALERTA_TRAFEGO_LABELS: Record<string, string> = {
  bloquear_foto: 'Bloquear foto',
  impossibilitado_trabalhar: 'Impossibilitado de Trabalhar',
}

const ETAPA_INICIAL: Etapa = 'Documentos solicitados'

export default function ProcessosCadastrais() {
  const { user } = useAuth()
  const userRole = ((user?.role as string) || 'Admin').toLowerCase()
  const isTrafego = userRole === 'tráfego' || userRole === 'trafego'
  const isRH = userRole === 'rh'
  const currentRole: UserRole = isTrafego ? 'Tráfego' : isRH ? 'RH' : 'Admin'
  const currentUserName =
    user?.name ||
    user?.email ||
    (isTrafego ? 'Operador Tráfego' : isRH ? 'Analista RH' : 'Administrador')

  // Garagem do usuário (para Tráfego: 'CURSINO' ou 'SAPOPEMBA')
  const userGaragem = (user?.garagem as string) || (isTrafego ? 'CURSINO' : 'Todas')

  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [cartasModalOpen, setCartasModalOpen] = useState(false)
  // Estado para o modal de Carta do Processo pós-registro ou reabertura
  const [cartaProcessoModalOpen, setCartaProcessoModalOpen] = useState(false)
  const [cartaProcessoColaboradores, setCartaProcessoColaboradores] = useState<
    CartaColaboradorInfo[]
  >([])
  const [cartaProcessoTipo, setCartaProcessoTipo] = useState<string>('')
  const [cartaProcessoNumeroInicial, setCartaProcessoNumeroInicial] = useState<string>('')
  const [cartaProcessoIsEdit, setCartaProcessoIsEdit] = useState<boolean>(false)

  const [editingProcesso, setEditingProcesso] = useState<ProcessoCadastral | null>(null)
  const [deletingProcesso, setDeletingProcesso] = useState<ProcessoCadastral | null>(null)
  const [processoAlterarSituacao, setProcessoAlterarSituacao] = useState<ProcessoCadastral | null>(
    null,
  )
  const [selectedProcessoDetalhes, setSelectedProcessoDetalhes] =
    useState<ProcessoCadastral | null>(null)
  const [novaSituacaoTrafego, setNovaSituacaoTrafego] = useState<ProcessoSituacao>('Foto Bloqueada')
  const [observacaoSituacaoTrafego, setObservacaoSituacaoTrafego] = useState('')
  const [salvandoSituacaoTrafego, setSalvandoSituacaoTrafego] = useState(false)
  const [processos, setProcessos] = useState<ProcessoCadastral[]>([])
  const [selectedCategoria, setSelectedCategoria] = useState<Categoria | null>(null)
  const [viewRegulares, setViewRegulares] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEtapa, setSelectedEtapa] = useState<string>('todas')
  const [selectedGaragem, setSelectedGaragem] = useState<string>('todas')
  const [selectedTipoCarta, setSelectedTipoCarta] = useState<string>('todos')
  const [cartas, setCartas] = useState<CartaRecord[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [employees, setEmployees] = useState<Employee[]>([])

  // Monta o filtro PocketBase garantindo regras no backend:
  // 1. Tráfego: valida SOMENTE processos do tipo "Atualização", vê apenas sua garagem e nunca vê "Regular"
  // 2. Admin/RH:
  //    - Se viewRegulares === true: somente situacao = "Regular"
  //    - Se viewRegulares === false (padrão): situacao != "Regular"
  const backendFilter = useMemo(() => {
    const parts: string[] = []

    if (isTrafego) {
      const g = userGaragem.toUpperCase()
      parts.push(`processo = "Atualização"`)
      parts.push(`garagem = "${g}"`)
      parts.push(`situacao != "Regular"`)
    } else {
      if (viewRegulares) {
        parts.push(`situacao = "Regular"`)
      } else {
        parts.push(`situacao != "Regular"`)
      }
    }

    return parts.join(' && ')
  }, [isTrafego, userGaragem, viewRegulares])

  const carregarProcessos = useCallback(async () => {
    try {
      const records = await listProcessosCadastrais({
        filter: backendFilter,
        sort: '-created',
      })
      // Garante deduplicação por id ao mapear os registros do banco
      const seenIds = new Set<string>()
      const list: ProcessoCadastral[] = []
      for (const r of records) {
        if (!r.id || seenIds.has(r.id)) continue
        seenIds.add(r.id)
        list.push({
          id: r.id,
          matricula: r.matricula,
          colaborador: r.colaborador,
          funcao: r.funcao,
          processo: r.processo,
          etapa: r.etapa,
          prazo: r.prazo,
          situacao: r.situacao,
          garagem: r.garagem || 'CURSINO',
          alerta_trafego: r.alerta_trafego || '',
          observacoes: r.observacoes || '',
          funcao_antiga: r.funcao_antiga || '',
          funcao_atual: r.funcao_atual || '',
          data_troca_funcao: r.data_troca_funcao || '',
          data_desligamento: r.data_desligamento || '',
          motivo_desligamento: r.motivo_desligamento || '',
          data_afastamento: r.data_afastamento || '',
          data_retorno_afastamento: r.data_retorno_afastamento || '',
          dias_afastado: r.dias_afastado,
          motivo_afastamento: r.motivo_afastamento || '',
        })
      }
      setProcessos(list)
    } catch (err) {
      console.error('Erro ao carregar processos:', err)
      setProcessos([])
    } finally {
      setLoading(false)
    }
  }, [backendFilter])

  useEffect(() => {
    void carregarProcessos()
  }, [carregarProcessos])

  useRealtime('processos_cadastrais', () => {
    void carregarProcessos()
  })

  // Carrega cartas para mapeamento de tipos de carta e filtro de processos
  const carregarCartas = useCallback(async () => {
    try {
      const records = await listCartas()
      setCartas(records)
    } catch (err) {
      console.warn('Erro ao carregar cartas para filtros:', err)
      setCartas([])
    }
  }, [])

  useEffect(() => {
    void carregarCartas()
  }, [carregarCartas])

  useRealtime('cartas', () => {
    void carregarCartas()
  })

  // Base de colaboradores do banco para o autocomplete do formulário
  // Carrega apenas Ativos e Afastados (exclui os ~18k registros inteiros, mantendo apenas o escopo regular)
  useEffect(() => {
    let cancelled = false
    listEmployees({
      situacao: undefined,
      excludeDesligados: true,
      perPage: 200,
    })
      .then((res) => {
        if (!cancelled) setEmployees(res.items)
      })
      .catch(() => {
        // silencioso
      })
    return () => {
      cancelled = true
    }
  }, [])

  useRealtime('movements', () => {
    // mantém a base sincronizada caso outra tela crie movimentações
    listEmployees({
      situacao: undefined,
      excludeDesligados: true,
      perPage: 200,
    })
      .then((res) => setEmployees(res.items))
      .catch(() => {
        // silencioso
      })
  })

  // Processos visíveis para o usuário:
  // Salvaguarda: deduplica sempre por id para garantir que um processo nunca apareça repetido em tela
  // Se for perfil Tráfego:
  // 1. Somente processos do tipo "Atualização"
  // 2. Filtrar exclusivamente pela garagem do usuário (CURSINO ou SAPOPEMBA).
  // 3. Processos com situação "Regular" NÃO devem aparecer (nem na listagem, nem nos cards, nem no Excel).
  // Admin e RH:
  // Se viewRegulares === true: somente "Regular"
  // Se viewRegulares === false (listagem principal): NÃO contém "Regular"
  const visibleProcessos = useMemo(() => {
    // Deduplica lista base por id antes de aplicar os filtros de visualização
    const seenIds = new Set<string>()
    const uniqueProcessos: ProcessoCadastral[] = []
    for (const p of processos) {
      if (p.id && !seenIds.has(p.id)) {
        seenIds.add(p.id)
        uniqueProcessos.push(p)
      }
    }

    if (isTrafego) {
      const userGaragemUpper = userGaragem.toUpperCase()
      return uniqueProcessos.filter((p) => {
        const isAtualizacao = p.processo === 'Atualização'
        const g = (p.garagem || '').toUpperCase()
        const isSameGaragem = g === userGaragemUpper
        const isNotRegular = p.situacao !== 'Regular'
        return isAtualizacao && isSameGaragem && isNotRegular
      })
    }
    // Admin / RH:
    if (viewRegulares) {
      return uniqueProcessos.filter((p) => p.situacao === 'Regular')
    }
    return uniqueProcessos.filter((p) => p.situacao !== 'Regular')
  }, [processos, isTrafego, userGaragem, viewRegulares])

  // Mapa normalizado de cartas para vincular ao processo por matrícula e/ou colaborador
  // Uma carta é vinculada ao processo se a matrícula bate (com e sem padding de zeros) ou se o nome normalizado coincide
  const cartasMap = useMemo(() => {
    const byMat = new Map<string, CartaRecord[]>()
    const byName = new Map<string, CartaRecord[]>()

    for (const c of cartas) {
      const mat = (c.matricula || '').trim()
      if (mat) {
        const matKey = mat.toLowerCase()
        const unpadded = mat.replace(/^0+/, '').toLowerCase()
        if (!byMat.has(matKey)) byMat.set(matKey, [])
        byMat.get(matKey)!.push(c)
        if (unpadded && unpadded !== matKey) {
          if (!byMat.has(unpadded)) byMat.set(unpadded, [])
          byMat.get(unpadded)!.push(c)
        }
      }

      const nome = (c.colaborador || '').trim().toLowerCase()
      if (nome) {
        if (!byName.has(nome)) byName.set(nome, [])
        byName.get(nome)!.push(c)
      }
    }

    return { byMat, byName }
  }, [cartas])

  // Função auxiliar que verifica se um processo tem carta vinculada do tipo informado (ou de qualquer tipo)
  const getCartasDoProcesso = useCallback(
    (processo: ProcessoCadastral): CartaRecord[] => {
      const mat = (processo.matricula || '').trim().toLowerCase()
      const unpadded = mat.replace(/^0+/, '')
      const colab = (processo.colaborador || '').trim().toLowerCase()

      const seen = new Set<string>()
      const result: CartaRecord[] = []

      const addList = (list?: CartaRecord[]) => {
        if (!list) return
        for (const item of list) {
          if (!seen.has(item.id)) {
            seen.add(item.id)
            result.push(item)
          }
        }
      }

      if (mat) addList(cartasMap.byMat.get(mat))
      if (unpadded && unpadded !== mat) addList(cartasMap.byMat.get(unpadded))
      if (colab) addList(cartasMap.byName.get(colab))

      return result
    },
    [cartasMap],
  )

  // Lista dinâmica de tipos de carta disponíveis para o filtro:
  // Combina a lista padrão solicitada com quaisquer tipos adicionais encontrados nas cartas cadastradas
  const tiposCartaDisponiveis = useMemo(() => {
    const set = new Set<string>(TIPOS_CARTA_FILTRO)
    cartas.forEach((c) => {
      const t = (c.tipo_carta || '').trim()
      if (t) set.add(t)
    })
    return Array.from(set)
  }, [cartas])

  // Helper de comparação flexível de tipo de carta (insensível a maiúsculas/minúsculas e acentos)
  const matchesTipoCarta = useCallback(
    (processo: ProcessoCadastral, tipoFiltro: string): boolean => {
      if (tipoFiltro === 'todos') return true
      const cartasProc = getCartasDoProcesso(processo)
      if (cartasProc.length === 0) return false

      const normFiltro = tipoFiltro
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()

      return cartasProc.some((c) => {
        const normCarta = (c.tipo_carta || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim()
        return normCarta === normFiltro
      })
    },
    [getCartasDoProcesso],
  )

  const resumo = useMemo(() => {
    const counts = Object.fromEntries(CATEGORIAS.map((categoria) => [categoria, 0])) as Record<
      Categoria,
      number
    >
    visibleProcessos.forEach((processo) => {
      // Quando o filtro de tipo de carta está ativo, os cards de resumo refletem os processos filtrados
      if (selectedTipoCarta !== 'todos' && !matchesTipoCarta(processo, selectedTipoCarta)) {
        return
      }
      if (processo.processo in counts) counts[processo.processo] += 1
    })
    return counts
  }, [visibleProcessos, selectedTipoCarta, matchesTipoCarta])

  const toSafeIsoString = (val?: string | null): string => {
    if (!val || typeof val !== 'string') return ''
    const trimmed = val.trim()
    if (!trimmed) return ''
    const date = trimmed.includes('T') ? new Date(trimmed) : new Date(`${trimmed}T12:00:00Z`)
    if (Number.isNaN(date.getTime())) return ''
    return date.toISOString()
  }

  const handleCreate = useCallback(
    async (
      data:
        | {
            processo: Categoria
            matricula: string
            nome: string
            funcao: string
            etapa: Etapa
            prazo: string
            situacao: Situacao
            garagem?: string
            alerta_trafego?: AlertaTrafego | string
            employeeId?: string
            funcao_antiga?: string
            funcao_atual?: string
            data_troca_funcao?: string
            data_desligamento?: string
            motivo_desligamento?: string
            data_afastamento?: string
            data_retorno_afastamento?: string
            dias_afastado?: number
            motivo_afastamento?: string
          }
        | Array<{
            processo: Categoria
            matricula: string
            nome: string
            funcao: string
            etapa: Etapa
            prazo: string
            situacao: Situacao
            garagem?: string
            alerta_trafego?: AlertaTrafego | string
            employeeId?: string
            funcao_antiga?: string
            funcao_atual?: string
            data_troca_funcao?: string
            data_desligamento?: string
            motivo_desligamento?: string
            data_afastamento?: string
            data_retorno_afastamento?: string
            dias_afastado?: number
            motivo_afastamento?: string
          }>,
    ) => {
      const itemsToCreate = Array.isArray(data) ? data : [data]
      if (itemsToCreate.length === 0) return

      try {
        const novosCriados: ProcessoCadastral[] = []

        for (const item of itemsToCreate) {
          const matTrim = (item.matricula || '').trim()
          // Evita gravar processo idêntico (mesma matrícula + mesmo tipo) caso já exista em aberto/recente
          // Verifica no estado local processos
          const jaExisteIdenticoLocal = processos.some(
            (p) =>
              (p.matricula || '').trim() === matTrim &&
              p.processo === item.processo &&
              p.situacao !== 'Regular',
          )
          if (jaExisteIdenticoLocal) {
            toast.warning(
              `Já existe um processo em aberto de ${item.processo} para a matrícula ${matTrim}. Registro ignorado para evitar duplicidade.`,
            )
            continue
          }

          const isoPrazo = toSafeIsoString(item.prazo)
          const isoDataTroca = toSafeIsoString(item.data_troca_funcao)
          const isoDataDesligamento = toSafeIsoString(item.data_desligamento)
          const isoDataAfastamento = toSafeIsoString(item.data_afastamento)
          const isoDataRetornoAfastamento = toSafeIsoString(item.data_retorno_afastamento)
          const isSemEtapa =
            item.processo === 'Inclusão' ||
            item.processo === 'PRAT' ||
            item.processo === 'Retorno do Afastamento' ||
            item.processo === 'Mudança de Função' ||
            item.processo === 'Exclusão'
          const safeEtapa = isSemEtapa ? ETAPA_INICIAL : item.etapa || ETAPA_INICIAL

          const created = await createProcessoCadastral({
            matricula: item.matricula,
            colaborador: item.nome,
            funcao: item.funcao,
            processo: item.processo,
            etapa: safeEtapa,
            prazo: isoPrazo,
            situacao: item.situacao,
            garagem: item.garagem || 'CURSINO',
            alerta_trafego: item.alerta_trafego || '',
            funcao_antiga: item.funcao_antiga || '',
            funcao_atual: item.funcao_atual || '',
            data_troca_funcao: isoDataTroca || '',
            data_desligamento: isoDataDesligamento || '',
            motivo_desligamento: item.motivo_desligamento || '',
            data_afastamento: isoDataAfastamento || '',
            data_retorno_afastamento: isoDataRetornoAfastamento || '',
            dias_afastado: item.dias_afastado,
            motivo_afastamento: item.motivo_afastamento || '',
          })

          novosCriados.push({
            id: created.id,
            matricula: created.matricula,
            colaborador: created.colaborador,
            funcao: created.funcao,
            processo: created.processo,
            etapa: created.etapa,
            prazo: created.prazo,
            situacao: created.situacao,
            garagem: created.garagem || item.garagem || 'CURSINO',
            alerta_trafego: created.alerta_trafego || item.alerta_trafego || '',
            observacoes: '',
            funcao_antiga: created.funcao_antiga || item.funcao_antiga || '',
            funcao_atual: created.funcao_atual || item.funcao_atual || '',
            data_troca_funcao: created.data_troca_funcao || isoDataTroca || '',
            data_desligamento: created.data_desligamento || isoDataDesligamento || '',
            motivo_desligamento: created.motivo_desligamento || item.motivo_desligamento || '',
            data_afastamento: created.data_afastamento || isoDataAfastamento || '',
            data_retorno_afastamento:
              created.data_retorno_afastamento || isoDataRetornoAfastamento || '',
            dias_afastado: created.dias_afastado ?? item.dias_afastado,
            motivo_afastamento: created.motivo_afastamento || item.motivo_afastamento || '',
          })
          // Cria automaticamente o PRIMEIRO item na linha do tempo (timeline)
          // Requisito: Etapa "Processo criado", responsável logado, sem quebrar se falhar (best-effort)
          try {
            await createTimelineItem({
              processo: created.id,
              etapa: 'Processo criado',
              responsavel_nome: currentUserName,
              responsavel_perfil: currentRole,
              observacoes: '',
              motivo: '',
              data_hora: new Date().toISOString(),
            })
          } catch (timelineErr) {
            console.warn('Erro ao registrar primeiro item na linha do tempo:', timelineErr)
          }

          // Persiste também como movimentação no banco se houver colaborador vinculado
          // O schema da coleção 'movements' aceita apenas:
          // 'Admissão' | 'Afastamento' | 'Retorno' | 'Desligamento' | 'Atualização fiscal'
          if (item.employeeId) {
            try {
              const movementDate = isoPrazo || new Date().toISOString()
              const mapCategoriaToMovementType = (cat: ProcessoCategoria): MovementType | null => {
                switch (cat) {
                  case 'Inclusão':
                  case 'PRAT':
                    return 'Admissão'
                  case 'Exclusão':
                    return 'Desligamento'
                  case 'Retorno do Afastamento':
                    return 'Retorno'
                  case 'Atualização':
                  case 'Atualização Fiscal':
                    return 'Atualização fiscal'
                  case 'Mudança de Função':
                    return 'Atualização fiscal'
                  default:
                    return null
                }
              }

              const validMovementType = mapCategoriaToMovementType(item.processo)
              if (validMovementType) {
                await createMovement({
                  employee: item.employeeId,
                  type: validMovementType,
                  date: movementDate,
                  notes: `Processo cadastral ${item.processo} — matrícula ${item.matricula}`,
                })
              }
            } catch (movementErr) {
              // Tolerante: erro na movimentação não bloqueia o registro do processo
              console.warn('Não foi possível gravar movimentação associada:', movementErr)
            }
          }
        }

        // Recarrega do banco para obter os dados normalizados atualizados,
        // ou funde eliminando duplicatas por ID para evitar duplicidade visual
        try {
          await carregarProcessos()
        } catch {
          setProcessos((prev) => {
            const map = new Map<string, ProcessoCadastral>()
            for (const item of novosCriados) {
              map.set(item.id, item)
            }
            for (const item of prev) {
              if (!map.has(item.id)) {
                map.set(item.id, item)
              }
            }
            return Array.from(map.values())
          })
        }

        const cat = itemsToCreate[0]?.processo || 'Processos'
        if (novosCriados.length > 1) {
          toast.success(`${novosCriados.length} processos de ${cat} cadastrados com sucesso`)
        } else {
          toast.success('Processo cadastrado com sucesso')
        }

        // Fluxo solicitado: Para tipos DIFERENTES de Atualização (Inclusão, PRAT, Mudança de Função, Exclusão, Retorno do Afastamento),
        // abre AUTOMATICAMENTE o pop-up de CRIAÇÃO DA CARTA com a lista minimizada dos colaboradores recém-incluídos.
        // O tipo "Atualização" permanece exatamente do jeito que está, sem abrir a carta automaticamente.
        if (cat !== 'Atualização' && novosCriados.length > 0 && !isTrafego) {
          const listaColabsCarta: CartaColaboradorInfo[] = novosCriados.map((nc) => ({
            processoId: nc.id,
            matricula: nc.matricula,
            nome: nc.colaborador,
            funcao: nc.funcao,
            garagem: nc.garagem,
            processoTipo: nc.processo,
          }))

          setCartaProcessoColaboradores(listaColabsCarta)
          setCartaProcessoTipo(cat)
          setCartaProcessoNumeroInicial('')
          setCartaProcessoIsEdit(false)
          // Abre o pop-up da carta imediatamente
          setCartaProcessoModalOpen(true)
        }
      } catch (err) {
        console.error(err)
        toast.error('Erro ao salvar processo no backend')
      }
    },
    [currentUserName, currentRole, isTrafego, processos, carregarProcessos],
  )

  const handleUpdate = useCallback(
    async (data: {
      id: string
      processo: ProcessoCategoria
      matricula: string
      nome: string
      funcao: string
      etapa: Etapa
      prazo: string
      situacao: Situacao
      garagem?: string
      alerta_trafego?: AlertaTrafego | string
      employeeId?: string
      funcao_antiga?: string
      funcao_atual?: string
      data_troca_funcao?: string
      data_desligamento?: string
      motivo_desligamento?: string
      data_afastamento?: string
      data_retorno_afastamento?: string
      dias_afastado?: number
      motivo_afastamento?: string
    }) => {
      try {
        const isoPrazo = toSafeIsoString(data.prazo)
        const isoDataTroca = toSafeIsoString(data.data_troca_funcao)
        const isoDataDesligamento = toSafeIsoString(data.data_desligamento)
        const isoDataAfastamento = toSafeIsoString(data.data_afastamento)
        const isoDataRetornoAfastamento = toSafeIsoString(data.data_retorno_afastamento)
        const isSemEtapa =
          data.processo === 'Inclusão' ||
          data.processo === 'PRAT' ||
          data.processo === 'Retorno do Afastamento' ||
          data.processo === 'Mudança de Função' ||
          data.processo === 'Exclusão'
        const safeEtapa = isSemEtapa ? ETAPA_INICIAL : data.etapa || ETAPA_INICIAL

        await updateProcessoCadastral(data.id, {
          matricula: data.matricula,
          colaborador: data.nome,
          funcao: data.funcao,
          processo: data.processo,
          etapa: safeEtapa,
          prazo: isoPrazo,
          situacao: data.situacao,
          garagem: data.garagem,
          alerta_trafego: data.alerta_trafego ?? '',
          funcao_antiga: data.funcao_antiga ?? '',
          funcao_atual: data.funcao_atual ?? '',
          data_troca_funcao: isoDataTroca || '',
          data_desligamento: isoDataDesligamento || '',
          motivo_desligamento: data.motivo_desligamento ?? '',
          data_afastamento: isoDataAfastamento || '',
          data_retorno_afastamento: isoDataRetornoAfastamento || '',
          dias_afastado: data.dias_afastado,
          motivo_afastamento: data.motivo_afastamento ?? '',
        })

        setProcessos((prev) =>
          prev.map((item) => {
            if (item.id === data.id) {
              const updatedItem: ProcessoCadastral = {
                ...item,
                matricula: data.matricula,
                colaborador: data.nome,
                funcao: data.funcao,
                processo: data.processo,
                etapa: safeEtapa,
                prazo: isoPrazo || data.prazo,
                situacao: data.situacao,
                garagem: data.garagem || item.garagem,
                alerta_trafego: data.alerta_trafego ?? item.alerta_trafego,
                funcao_antiga: data.funcao_antiga ?? item.funcao_antiga,
                funcao_atual: data.funcao_atual ?? item.funcao_atual,
                data_troca_funcao: isoDataTroca || data.data_troca_funcao || item.data_troca_funcao,
                data_desligamento:
                  isoDataDesligamento || data.data_desligamento || item.data_desligamento,
                motivo_desligamento: data.motivo_desligamento ?? item.motivo_desligamento,
                data_afastamento:
                  isoDataAfastamento || data.data_afastamento || item.data_afastamento,
                data_retorno_afastamento:
                  isoDataRetornoAfastamento ||
                  data.data_retorno_afastamento ||
                  item.data_retorno_afastamento,
                dias_afastado: data.dias_afastado ?? item.dias_afastado,
                motivo_afastamento: data.motivo_afastamento ?? item.motivo_afastamento,
              }
              return updatedItem
            }
            return item
          }),
        )

        toast.success('Processo atualizado com sucesso')
      } catch (err) {
        console.error(err)
        toast.error('Erro ao atualizar processo no servidor')
      }
    },
    [],
  )

  const handleUpdateSituacaoTrafego = useCallback(async () => {
    if (!processoAlterarSituacao) return

    // Validação de perfil Tráfego: só pode alterar quando a situação atual for "Pendente", "Foto Bloqueada" ou "Impossibilitado de Trabalhar"
    const situacoesEditaveisTrafego: Situacao[] = [
      'Pendente',
      'Foto Bloqueada',
      'Impossibilitado de Trabalhar',
    ]
    if (isTrafego && !situacoesEditaveisTrafego.includes(processoAlterarSituacao.situacao)) {
      toast.error(
        'O perfil Tráfego só pode alterar a situação de processos com situação Pendente, Foto Bloqueada ou Impossibilitado de Trabalhar.',
      )
      setProcessoAlterarSituacao(null)
      return
    }

    // Validação extra: o usuário do Tráfego só valida processos do tipo "Atualização" da sua própria garagem
    if (isTrafego && processoAlterarSituacao.processo !== 'Atualização') {
      toast.error('O perfil Tráfego valida exclusivamente processos do tipo "Atualização".')
      setProcessoAlterarSituacao(null)
      return
    }

    if (
      isTrafego &&
      processoAlterarSituacao.garagem &&
      processoAlterarSituacao.garagem.toUpperCase() !== userGaragem.toUpperCase()
    ) {
      toast.error('Permissão negada: você só pode alterar processos da sua própria garagem.')
      setProcessoAlterarSituacao(null)
      return
    }

    setSalvandoSituacaoTrafego(true)
    try {
      const obsValue = observacaoSituacaoTrafego.trim()
      // 1. Atualiza a situação e a observação no processo
      await updateProcessoSituacao(processoAlterarSituacao.id, novaSituacaoTrafego, obsValue)

      // 2. Se houver OBS preenchida, grava o item na Linha do Tempo (processo_timeline)
      // vinculada à ação do Tráfego com a etapa correspondente
      if (obsValue) {
        try {
          const etapaTimeline =
            novaSituacaoTrafego === 'Foto Bloqueada'
              ? 'Foto Bloqueada'
              : 'Impossibilitado de trabalhar'
          await createTimelineItem({
            processo: processoAlterarSituacao.id,
            etapa: etapaTimeline,
            responsavel_nome: currentUserName,
            responsavel_perfil: 'Tráfego',
            observacoes: obsValue,
            motivo: novaSituacaoTrafego === 'Impossibilitado de Trabalhar' ? obsValue : '',
            data_hora: new Date().toISOString(),
          })
        } catch (timelineErr) {
          console.warn('Erro ao registrar ação do Tráfego na linha do tempo:', timelineErr)
        }
      }

      setProcessos((prev) =>
        prev.map((item) =>
          item.id === processoAlterarSituacao.id
            ? { ...item, situacao: novaSituacaoTrafego, observacoes: obsValue }
            : item,
        ),
      )
      toast.success(`Situação alterada para "${novaSituacaoTrafego}" com sucesso!`)
      setProcessoAlterarSituacao(null)
      setObservacaoSituacaoTrafego('')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao atualizar a situação do processo no servidor.')
    } finally {
      setSalvandoSituacaoTrafego(false)
    }
  }, [
    processoAlterarSituacao,
    novaSituacaoTrafego,
    observacaoSituacaoTrafego,
    isTrafego,
    userGaragem,
    currentUserName,
  ])

  const handleDelete = useCallback(async (processo: ProcessoCadastral) => {
    // Remove imediatamente da listagem local (optimistic update)
    setProcessos((prev) => prev.filter((p) => p.id !== processo.id))
    setDeletingProcesso(null)

    try {
      await deleteProcessoCadastral(processo.id)
      toast.success('Processo excluído com sucesso')
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status ?? err?.statusCode
      const message = err?.message || ''
      const isNotFound = status === 404 || message.includes("The requested resource wasn't found")

      if (isNotFound) {
        // Já não existe no servidor, considera sucesso silencioso
        toast.success('Processo excluído com sucesso')
      } else {
        console.error('Erro ao excluir processo no servidor:', err)
        toast.error('Erro ao excluir processo no servidor')
        // Restaura na lista caso tenha ocorrido outro erro não-404
        setProcessos((prev) => {
          if (prev.some((p) => p.id === processo.id)) return prev
          return [processo, ...prev]
        })
      }
    }
  }, [])

  const handleCategoryClick = (categoria: Categoria) => {
    if (selectedCategoria === categoria) {
      setSelectedCategoria(null)
    } else {
      setSelectedCategoria(categoria)
    }
  }

  const filteredProcessos = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return visibleProcessos.filter((p) => {
      // Filtro por Categoria (clique nos cards)
      if (selectedCategoria && p.processo !== selectedCategoria) {
        return false
      }

      // Filtro de Busca (por matrícula/registro ou nome do colaborador)
      if (term) {
        const mat = (p.matricula || '').toLowerCase()
        const colab = (p.colaborador || '').toLowerCase()
        const unpadded = mat.replace(/^0+/, '')
        const termUnpadded = term.replace(/^0+/, '')
        const matchesMat = mat.includes(term) || (termUnpadded && unpadded.includes(termUnpadded))
        const matchesColab = colab.includes(term)
        if (!matchesMat && !matchesColab) {
          return false
        }
      }

      // Filtro de Etapa
      if (selectedEtapa !== 'todas' && p.etapa !== selectedEtapa) {
        return false
      }

      // Filtro de Garagem (apenas para Admin/RH - perfil Tráfego já tem a garagem filtrada em visibleProcessos)
      if (!isTrafego && selectedGaragem !== 'todas') {
        const pGaragem = (p.garagem || '').toUpperCase()
        if (pGaragem !== selectedGaragem.toUpperCase()) {
          return false
        }
      }

      // Filtro de Tipo de Carta: somente processos que têm carta daquele tipo vinculada
      if (selectedTipoCarta !== 'todos') {
        if (!matchesTipoCarta(p, selectedTipoCarta)) {
          return false
        }
      }

      return true
    })
  }, [
    visibleProcessos,
    selectedCategoria,
    searchTerm,
    selectedEtapa,
    selectedGaragem,
    selectedTipoCarta,
    matchesTipoCarta,
    isTrafego,
  ])

  const hasActiveFilters = Boolean(
    searchTerm.trim() ||
    selectedEtapa !== 'todas' ||
    (!isTrafego && selectedGaragem !== 'todas') ||
    selectedTipoCarta !== 'todos' ||
    selectedCategoria,
  )

  const handleClearFilters = useCallback(() => {
    setSearchTerm('')
    setSelectedEtapa('todas')
    setSelectedGaragem('todas')
    setSelectedTipoCarta('todos')
    setSelectedCategoria(null)
  }, [])

  // Resetar página atual quando filtros mudarem
  useEffect(() => {
    setCurrentPage(1)
  }, [
    selectedCategoria,
    viewRegulares,
    searchTerm,
    selectedEtapa,
    selectedGaragem,
    selectedTipoCarta,
  ])

  // Paginação da listagem
  const totalPages = Math.max(1, Math.ceil(filteredProcessos.length / pageSize))
  const paginatedProcessos = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredProcessos.slice(start, start + pageSize)
  }, [filteredProcessos, currentPage, pageSize])

  const handleExportXlsx = useCallback(() => {
    if (filteredProcessos.length === 0) {
      toast.error('Nenhum processo disponível para exportação.')
      return
    }

    try {
      // Mapeamento exato das colunas atuais da tabela com coluna informativa extra
      const rows = filteredProcessos.map((item) => ({
        Matrícula: item.matricula,
        Colaborador: item.colaborador,
        Garagem: item.garagem,
        Função: item.funcao,
        Processo: item.processo,
        'Função Antiga': item.funcao_antiga || '',
        'Função Atual': item.funcao_atual || '',
        'Data Troca Função': formatDate(item.data_troca_funcao),
        'Data Desligamento': formatDate(item.data_desligamento),
        'Motivo Desligamento': item.motivo_desligamento || '',
        'Data do Afastamento': formatDate(item.data_afastamento),
        'Retorno do Afastamento': formatDate(item.data_retorno_afastamento),
        'Dias Afastado':
          item.dias_afastado !== undefined && item.dias_afastado !== null
            ? String(item.dias_afastado)
            : '',
        'Motivo do Afastamento': item.motivo_afastamento || '',
        Etapa: item.etapa,
        Prazo: formatDate(item.prazo),
        Situação: item.situacao,
        'Alerta Tráfego': item.alerta_trafego
          ? ALERTA_TRAFEGO_LABELS[item.alerta_trafego] || item.alerta_trafego
          : '',
      }))

      const worksheet = XLSX.utils.json_to_sheet(rows)

      // Ajuste de largura das colunas para visualização adequada no Excel
      const columnWidths = [
        { wch: 14 }, // Matrícula
        { wch: 32 }, // Colaborador
        { wch: 16 }, // Garagem
        { wch: 26 }, // Função
        { wch: 22 }, // Processo
        { wch: 24 }, // Função Antiga
        { wch: 24 }, // Função Atual
        { wch: 18 }, // Data Troca Função
        { wch: 18 }, // Data Desligamento
        { wch: 28 }, // Motivo Desligamento
        { wch: 20 }, // Data do Afastamento
        { wch: 22 }, // Retorno do Afastamento
        { wch: 14 }, // Dias Afastado
        { wch: 30 }, // Motivo do Afastamento
        { wch: 26 }, // Etapa
        { wch: 14 }, // Prazo
        { wch: 14 }, // Situação
        { wch: 28 }, // Alerta Tráfego
      ]
      worksheet['!cols'] = columnWidths

      const workbook = XLSX.utils.book_new()
      const sheetName = viewRegulares ? 'Processos Regulares' : 'Processos Cadastrais'
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

      const fileName = viewRegulares ? 'processos-regulares.xlsx' : 'processos-cadastrais.xlsx'
      XLSX.writeFile(workbook, fileName)
      toast.success(`Exportação concluída (${filteredProcessos.length} registro(s))`)
    } catch (error) {
      console.error('Erro ao exportar processos para XLSX:', error)
      toast.error('Ocorreu um erro ao gerar o arquivo Excel.')
    }
  }, [filteredProcessos, viewRegulares])

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Processos Cadastrais</h1>
            <p className="text-xs text-muted-foreground">
              {isTrafego ? (
                <>
                  Garagem <strong>{userGaragem}</strong> · {visibleProcessos.length} processo(s)
                </>
              ) : viewRegulares ? (
                <>{visibleProcessos.length} processo(s) regular(es)</>
              ) : (
                <>{visibleProcessos.length} processo(s) cadastrado(s)</>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Botão Cartas: visível para Admin e RH (não exibido para Tráfego) */}
          {!isTrafego && (
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={() => setCartasModalOpen(true)}
              className="inline-flex h-10 items-center gap-2 border-primary/30 text-primary hover:bg-primary/10"
              title="Consultar cartas emitidas e documentos anexos"
            >
              <Mail className="h-4 w-4" />
              Cartas
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="default"
            onClick={handleExportXlsx}
            disabled={filteredProcessos.length === 0}
            className="inline-flex h-10 items-center gap-2"
          >
            <FileDown className="h-4 w-4" />
            Exportar .xlsx
          </Button>
          {!isTrafego && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Novo processo
            </button>
          )}
        </div>
      </div>

      {/* Cards de resumo clicáveis (ocultos quando o perfil for Tráfego) */}
      {!isTrafego && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {CATEGORIAS.map((categoria) => {
            const style = CARD_STYLES[categoria]
            const Icon = style.icon
            const isSelected = selectedCategoria === categoria
            return (
              <button
                key={categoria}
                type="button"
                onClick={() => handleCategoryClick(categoria)}
                className={cn(
                  'group flex flex-col rounded-xl border bg-white p-4 text-left shadow-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:shadow-md cursor-pointer',
                  style.ring,
                  isSelected && 'ring-2 ring-primary border-primary bg-primary/[0.03]',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{categoria}</span>
                  <span
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg transition-transform group-hover:scale-105',
                      style.bg,
                    )}
                  >
                    <Icon className={cn('h-4 w-4', style.text)} />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold text-foreground">{resumo[categoria]}</p>
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">processos</p>
                  {isSelected && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] font-semibold text-primary">
                      Filtrando
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Tabela de processos */}
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        {/* Barra superior de ações e filtros */}
        <div className="flex flex-col gap-3 border-b p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-sm font-semibold text-foreground">
                {viewRegulares ? 'Processos cadastrados (Regulares)' : 'Processos cadastrados'}
              </h2>

              {/* Botão Regular: posicionado ao lado do título Processos cadastrados */}
              {!isTrafego && (
                <Button
                  type="button"
                  size="sm"
                  variant={viewRegulares ? 'default' : 'outline'}
                  onClick={() => setViewRegulares((prev) => !prev)}
                  className={cn(
                    'h-7 px-2.5 text-xs font-medium transition-all gap-1.5',
                    viewRegulares
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm border-emerald-600'
                      : 'border-emerald-300 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900',
                  )}
                  aria-pressed={viewRegulares}
                  title={
                    viewRegulares
                      ? 'Voltar para a listagem principal de processos (sem Regulares)'
                      : 'Filtrar somente processos com situação Regular'
                  }
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Regular
                  {viewRegulares && (
                    <span className="ml-0.5 rounded-full bg-white/25 px-1.5 py-0.2 text-[10px] font-bold">
                      Ativo
                    </span>
                  )}
                </Button>
              )}

              {selectedCategoria && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  Filtro: {selectedCategoria}
                  <button
                    type="button"
                    onClick={() => setSelectedCategoria(null)}
                    className="hover:text-primary/70 font-bold ml-0.5"
                    title="Limpar filtro de categoria"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>

            {/* Controles de busca e filtros */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {/* Campo de pesquisa: busca por registro (matrícula) ou nome do colaborador */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar por matrícula ou nome…"
                  aria-label="Buscar processos por matrícula ou nome"
                  className="h-10 w-full min-w-[220px] rounded-md border border-input bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-64"
                />
              </div>

              {/* Filtro de Etapa */}
              <select
                value={selectedEtapa}
                onChange={(event) => setSelectedEtapa(event.target.value)}
                className="h-10 rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Filtro de Etapa"
              >
                <option value="todas">Todas as etapas</option>
                {ETAPAS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              {/* Filtro de Garagem (oculto para o perfil Tráfego) */}
              {!isTrafego && (
                <select
                  value={selectedGaragem}
                  onChange={(event) => setSelectedGaragem(event.target.value)}
                  className="h-10 rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Filtro de Garagem"
                >
                  <option value="todas">Todas as garagens</option>
                  <option value="CURSINO">CURSINO</option>
                  <option value="SAPOPEMBA">SAPOPEMBA</option>
                  <option value="GUAIANASES">GUAIANASES</option>
                </select>
              )}

              {/* Filtro de Tipo de Carta */}
              {!isTrafego && (
                <select
                  value={selectedTipoCarta}
                  onChange={(event) => setSelectedTipoCarta(event.target.value)}
                  className="h-10 rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Filtro de Tipo de carta"
                >
                  <option value="todos">Todos os tipos de carta</option>
                  {tiposCartaDisponiveis.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Barra de resumo de registros e botão Limpar Filtros */}
        <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
          <span>
            Total de <strong className="text-foreground">{filteredProcessos.length}</strong>{' '}
            processo(s) encontrado(s)
            {isTrafego && ` (Garagem ${userGaragem})`}
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">REGISTRO</th>
                  <th className="px-4 py-3 font-semibold">Colaborador</th>
                  <th className="px-4 py-3 font-semibold">Garagem</th>
                  <th className="px-4 py-3 font-semibold">Função</th>
                  <th className="px-4 py-3 font-semibold">Processo</th>
                  <th className="px-4 py-3 font-semibold">Etapa</th>
                  <th className="px-4 py-3 font-semibold">Prazo</th>
                  <th className="px-4 py-3 font-semibold">Situação</th>
                  <th className="px-4 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProcessos.map((processo, index) => (
                  <tr
                    key={processo.id || `processo-${index}`}
                    onClick={() => setSelectedProcessoDetalhes(processo)}
                    className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    title="Clique para ver os detalhes e a linha do tempo do processo"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      <span className="font-mono text-primary font-semibold hover:underline">
                        {processo.matricula}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground font-medium">
                      {processo.colaborador}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                          processo.garagem === 'CURSINO'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-sky-50 text-sky-700 border border-sky-200',
                        )}
                      >
                        {processo.garagem || 'CURSINO'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{processo.funcao}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                          PROCESSO_BADGE_STYLES[processo.processo as Categoria] ||
                            'bg-muted text-muted-foreground border-transparent',
                        )}
                      >
                        {processo.processo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {processo.processo === 'Atualização' ? (
                        <span className="inline-flex items-center gap-1.5">
                          <FilePlus2 className="h-3.5 w-3.5 text-muted-foreground/70" />
                          {processo.etapa}
                        </span>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {processo.processo === 'Atualização' ? (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/70" />
                          <span>{formatDate(processo.prazo)}</span>
                          {processo.alerta_trafego && (
                            <span
                              className="inline-flex items-center justify-center text-amber-600 hover:text-amber-700 cursor-help"
                              title={
                                ALERTA_TRAFEGO_LABELS[processo.alerta_trafego] ||
                                processo.alerta_trafego
                              }
                              aria-label={
                                ALERTA_TRAFEGO_LABELS[processo.alerta_trafego] || 'Alerta Tráfego'
                              }
                            >
                              <TriangleAlert className="h-4 w-4" />
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                          SITUACAO_STYLES[processo.situacao],
                        )}
                      >
                        {processo.situacao}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {isTrafego ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedProcessoDetalhes(processo)}
                            className="h-8 gap-1 text-xs"
                            title="Ver linha do tempo e detalhes"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Detalhes
                          </Button>
                          {processo.situacao === 'Pendente' ||
                          processo.situacao === 'Foto Bloqueada' ||
                          processo.situacao === 'Impossibilitado de Trabalhar' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setProcessoAlterarSituacao(processo)
                                setNovaSituacaoTrafego(
                                  processo.situacao === 'Impossibilitado de Trabalhar'
                                    ? 'Impossibilitado de Trabalhar'
                                    : 'Foto Bloqueada',
                                )
                                setObservacaoSituacaoTrafego(processo.observacoes || '')
                              }}
                              className="h-8 gap-1.5 border-emerald-600/40 text-xs font-medium text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900"
                            >
                              <RefreshCcw className="h-3.5 w-3.5" />
                              Alterar situação
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Botão Carta / Anexos para processos não-Atualização */}
                          {processo.processo !== 'Atualização' && (
                            <button
                              type="button"
                              onClick={async () => {
                                const singleColab: CartaColaboradorInfo = {
                                  processoId: processo.id,
                                  matricula: processo.matricula,
                                  nome: processo.colaborador,
                                  funcao: processo.funcao,
                                  garagem: processo.garagem,
                                  processoTipo: processo.processo,
                                }
                                setCartaProcessoColaboradores([singleColab])
                                setCartaProcessoTipo(processo.processo)
                                setCartaProcessoIsEdit(true)

                                // Busca carta já existente no backend para pré-preencher o número
                                let numExistente = ''
                                try {
                                  const mat = (processo.matricula || '').trim()
                                  const colab = (processo.colaborador || '').trim()
                                  if (mat) {
                                    const safeMat = mat.replace(/"/g, '\\"')
                                    const res = await pb.collection('cartas').getList(1, 1, {
                                      filter: `matricula = "${safeMat}"`,
                                      sort: '-created',
                                    })
                                    if (res.items.length > 0 && res.items[0].numero_carta) {
                                      numExistente = res.items[0].numero_carta
                                    }
                                  }
                                  if (!numExistente && colab) {
                                    const safeColab = colab.replace(/"/g, '\\"')
                                    const res = await pb.collection('cartas').getList(1, 1, {
                                      filter: `colaborador ~ "${safeColab}"`,
                                      sort: '-created',
                                    })
                                    if (res.items.length > 0 && res.items[0].numero_carta) {
                                      numExistente = res.items[0].numero_carta
                                    }
                                  }
                                } catch (errBuscaCarta) {
                                  console.warn(
                                    'Erro ao buscar carta existente do processo:',
                                    errBuscaCarta,
                                  )
                                }

                                setCartaProcessoNumeroInicial(numExistente)
                                setCartaProcessoModalOpen(true)
                              }}
                              className="inline-flex h-8 px-2.5 items-center justify-center rounded-md border border-emerald-600/30 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors gap-1"
                              title={`Abrir carta e gerenciar anexos de ${processo.colaborador}`}
                              aria-label={`Abrir carta e anexos de ${processo.colaborador}`}
                            >
                              <Mail className="h-3.5 w-3.5" />
                              <span>Carta</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedProcessoDetalhes(processo)}
                            className="inline-flex h-8 px-2.5 items-center justify-center rounded-md border text-xs font-medium text-primary hover:bg-primary/10 transition-colors gap-1"
                            title="Ver detalhes e linha do tempo"
                            aria-label={`Ver linha do tempo de ${processo.colaborador}`}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span>Detalhes</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingProcesso(processo)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            title="Editar processo"
                            aria-label={`Editar processo de ${processo.colaborador}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingProcesso(processo)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                            title="Excluir processo"
                            aria-label={`Excluir processo de ${processo.colaborador}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filteredProcessos.length === 0 && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {viewRegulares
              ? hasActiveFilters
                ? 'Nenhum processo regular encontrado com os filtros selecionados.'
                : 'Nenhum processo com situação "Regular" encontrado.'
              : hasActiveFilters
                ? 'Nenhum processo cadastral encontrado com os filtros selecionados.'
                : 'Nenhum processo cadastral encontrado.'}
            {hasActiveFilters ? (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="text-xs font-medium text-primary underline"
                >
                  Limpar filtros
                </button>
              </div>
            ) : viewRegulares ? (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setViewRegulares(false)}
                  className="text-xs font-medium text-primary underline"
                >
                  Voltar para processos cadastrados
                </button>
              </div>
            ) : (
              selectedCategoria && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCategoria(null)}
                    className="text-xs font-medium text-primary underline"
                  >
                    Ver todos os processos
                  </button>
                </div>
              )
            )}
          </div>
        )}

        {/* Paginação */}
        {!loading && filteredProcessos.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 bg-muted/10 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Linhas por página:</span>
              <Select
                value={String(pageSize)}
                onValueChange={(val) => {
                  setPageSize(Number(val))
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="h-8 w-16">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span>
                Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  title="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  title="Próxima página"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Modal Novo processo */}
      <ProcessoCadastralFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        employees={employees}
        onSubmit={async (data) => {
          await handleCreate(data)
        }}
      />

      {/* Modal Editar processo */}
      <ProcessoCadastralFormModal
        open={editingProcesso !== null && !isTrafego}
        onOpenChange={(open) => {
          if (!open) {
            // Pequeno delay para garantir que a animação de saída do Radix Dialog seja concluída
            // antes de desmontar os nós de conteúdo, prevenindo NotFoundError em removeChild
            setTimeout(() => setEditingProcesso(null), 150)
          }
        }}
        initialData={editingProcesso}
        employees={employees}
        onSubmit={async (data) => {
          if (editingProcesso && !Array.isArray(data)) {
            await handleUpdate({
              id: editingProcesso.id,
              ...data,
            })
          }
        }}
      />

      {/* Modal Visualizar Cartas (Admin e RH) */}
      <VisualizarCartasModal open={cartasModalOpen} onOpenChange={setCartasModalOpen} />

      {/* Modal de Criação / Edição de Carta com lista de colaboradores minimizada e anexos expansíveis */}
      <CartaProcessoModal
        open={cartaProcessoModalOpen}
        onOpenChange={setCartaProcessoModalOpen}
        colaboradores={cartaProcessoColaboradores}
        tipoProcesso={cartaProcessoTipo}
        initialNumeroCarta={cartaProcessoNumeroInicial}
        isEditMode={cartaProcessoIsEdit}
        onSuccess={() => {
          void carregarProcessos()
          void carregarCartas()
        }}
      />

      {/* Modal Detalhes com Linha do Tempo (Timeline) */}
      <ProcessoDetalhesTimelineModal
        open={selectedProcessoDetalhes !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedProcessoDetalhes(null)
        }}
        processo={selectedProcessoDetalhes}
        onProcessoUpdated={(updated) => {
          setProcessos((prev) =>
            prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
          )
          setSelectedProcessoDetalhes((prev) =>
            prev && prev.id === updated.id ? { ...prev, ...updated } : prev,
          )
        }}
        onUpdateSituacaoTrafego={async (id, situacao, observacoes) => {
          await updateProcessoSituacao(id, situacao, observacoes)
          setProcessos((prev) =>
            prev.map((item) =>
              item.id === id
                ? {
                    ...item,
                    situacao,
                    ...(observacoes !== undefined ? { observacoes } : {}),
                  }
                : item,
            ),
          )
        }}
      />

      {/* Modal Restrito do perfil Tráfego: Apenas Alterar Situação */}
      <Dialog
        open={processoAlterarSituacao !== null}
        onOpenChange={(open) => {
          if (!open) setProcessoAlterarSituacao(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCcw className="h-5 w-5 text-primary" />
              Alterar Situação do Processo
            </DialogTitle>
            <DialogDescription>
              Perfil Tráfego: selecione a nova situação para o colaborador{' '}
              <strong className="text-foreground">{processoAlterarSituacao?.colaborador}</strong>{' '}
              (Registro {processoAlterarSituacao?.matricula}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
              <p>
                <span className="font-semibold text-foreground">Processo:</span>{' '}
                {processoAlterarSituacao?.processo}
              </p>
              <p>
                <span className="font-semibold text-foreground">Garagem:</span>{' '}
                <span className="font-semibold text-emerald-800">
                  {processoAlterarSituacao?.garagem || 'CURSINO'}
                </span>
              </p>
              <p>
                <span className="font-semibold text-foreground">Situação atual:</span>{' '}
                <span
                  className={cn(
                    'inline-flex rounded-full border px-2 py-0.2 text-[11px]',
                    processoAlterarSituacao?.situacao
                      ? SITUACAO_STYLES[processoAlterarSituacao.situacao]
                      : '',
                  )}
                >
                  {processoAlterarSituacao?.situacao}
                </span>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="situacao-trafego">Nova Situação</Label>
              <Select
                value={novaSituacaoTrafego}
                onValueChange={(val) => setNovaSituacaoTrafego(val as ProcessoSituacao)}
              >
                <SelectTrigger id="situacao-trafego">
                  <SelectValue placeholder="Selecione a situação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Foto Bloqueada">Foto Bloqueada</SelectItem>
                  <SelectItem value="Impossibilitado de Trabalhar">
                    Impossibilitado de Trabalhar
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Permissão exclusiva: Foto Bloqueada ou Impossibilitado de Trabalhar.
              </p>
            </div>

            {(novaSituacaoTrafego === 'Foto Bloqueada' ||
              novaSituacaoTrafego === 'Impossibilitado de Trabalhar') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="obs-situacao-trafego">Observação (OBS)</Label>
                  <span className="text-[11px] text-muted-foreground">Opcional</span>
                </div>
                <Textarea
                  id="obs-situacao-trafego"
                  placeholder="Digite observações sobre a alteração (opcional)…"
                  value={observacaoSituacaoTrafego}
                  onChange={(e) => setObservacaoSituacaoTrafego(e.target.value)}
                  rows={3}
                  className="resize-none text-xs"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setProcessoAlterarSituacao(null)}
              disabled={salvandoSituacaoTrafego}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleUpdateSituacaoTrafego()}
              disabled={salvandoSituacaoTrafego}
            >
              {salvandoSituacaoTrafego ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                'Salvar Situação'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog
        open={deletingProcesso !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingProcesso(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir processo cadastral?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o processo{' '}
              <strong className="text-foreground">{deletingProcesso?.processo}</strong> do
              colaborador{' '}
              <strong className="text-foreground">{deletingProcesso?.colaborador}</strong> (Registro{' '}
              {deletingProcesso?.matricula})? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingProcesso) {
                  handleDelete(deletingProcesso)
                }
              }}
            >
              Excluir processo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------- Modal "Formulário de processo" (Criar / Editar) ----------

interface ProcessoCadastralFormData {
  processo: Categoria
  matricula: string
  nome: string
  funcao: string
  etapa: Etapa
  prazo: string
  situacao: Situacao
  garagem?: string
  alerta_trafego?: AlertaTrafego | string
  employeeId?: string
  funcao_antiga?: string
  funcao_atual?: string
  data_troca_funcao?: string
  data_desligamento?: string
  motivo_desligamento?: string
  data_afastamento?: string
  data_retorno_afastamento?: string
  dias_afastado?: number
  motivo_afastamento?: string
}

interface ProcessoCadastralFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: ProcessoCadastral | null
  employees: Employee[]
  onSubmit: (data: ProcessoCadastralFormData | ProcessoCadastralFormData[]) => Promise<void> | void
}

interface ColaboradorItem {
  id: string
  matricula: string
  nome: string
  funcao: string
  garagem: 'CURSINO' | 'SAPOPEMBA'
  employeeId?: string
  searching?: boolean
  // Campos específicos de Mudança de Função
  funcao_antiga?: string
  funcao_atual?: string
  data_troca_funcao?: string
  // Campos específicos de Exclusão (Desligamento)
  data_desligamento?: string
  motivo_desligamento?: string
  // Campos específicos de Retorno do Afastamento
  data_afastamento?: string
  data_retorno_afastamento?: string
  dias_afastado?: number
  motivo_afastamento?: string
}

function calculateDiasAfastado(inicio?: string, fim?: string): number | undefined {
  if (!inicio || !fim) return undefined
  const dInicio = new Date(inicio.includes('T') ? inicio : `${inicio}T12:00:00Z`)
  const dFim = new Date(fim.includes('T') ? fim : `${fim}T12:00:00Z`)
  if (Number.isNaN(dInicio.getTime()) || Number.isNaN(dFim.getTime())) return undefined
  const diffTime = dFim.getTime() - dInicio.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
  return diffDays >= 0 ? diffDays : undefined
}

function createEmptyColaborador(garagem: 'CURSINO' | 'SAPOPEMBA' = 'CURSINO'): ColaboradorItem {
  return {
    id: String(Date.now() + Math.random()),
    matricula: '',
    nome: '',
    funcao: '',
    garagem,
    funcao_antiga: '',
    funcao_atual: '',
    data_troca_funcao: '',
    data_desligamento: '',
    motivo_desligamento: '',
    data_afastamento: '',
    data_retorno_afastamento: '',
    dias_afastado: undefined,
    motivo_afastamento: '',
  }
}

function ProcessoCadastralFormModal({
  open,
  onOpenChange,
  initialData,
  employees,
  onSubmit,
}: ProcessoCadastralFormModalProps) {
  const isEditing = Boolean(initialData)
  const [processo, setProcesso] = useState<Categoria>('Inclusão')
  const [etapa, setEtapa] = useState<Etapa>(ETAPA_INICIAL)
  const [prazo, setPrazo] = useState('')
  const [situacao, setSituacao] = useState<Situacao>('Pendente')
  const [alertaTrafego, setAlertaTrafego] = useState<AlertaTrafego>('')
  const [saving, setSaving] = useState(false)

  // Estado para modo edição (processo único já existente)
  const [singleMatricula, setSingleMatricula] = useState('')
  const [singleNome, setSingleNome] = useState('')
  const [singleFuncao, setSingleFuncao] = useState('')
  const [funcaoAntiga, setFuncaoAntiga] = useState('')
  const [funcaoAtual, setFuncaoAtual] = useState('')
  const [dataTrocaFuncao, setDataTrocaFuncao] = useState('')
  const [dataDesligamento, setDataDesligamento] = useState('')
  const [motivoDesligamento, setMotivoDesligamento] = useState('')
  const [dataAfastamento, setDataAfastamento] = useState('')
  const [dataRetornoAfastamento, setDataRetornoAfastamento] = useState('')
  const [diasAfastado, setDiasAfastado] = useState<number | undefined>(undefined)
  const [motivoAfastamento, setMotivoAfastamento] = useState('')
  const [singleGaragem, setSingleGaragem] = useState<'CURSINO' | 'SAPOPEMBA'>('CURSINO')
  const [singleSearching, setSingleSearching] = useState(false)
  const [singleResolvedEmpId, setSingleResolvedEmpId] = useState<string | undefined>(undefined)

  // Estado para criação: múltiplos colaboradores suportados em todos os tipos (Inclusão, Mudança de Função, Exclusão, Atualização)
  const [colaboradores, setColaboradores] = useState<ColaboradorItem[]>([createEmptyColaborador()])
  const [expandedId, setExpandedId] = useState<string>('')

  // Suporte a múltiplos colaboradores ativo na criação para qualquer categoria
  const isMultiMode = !isEditing

  useEffect(() => {
    if (open) {
      if (initialData) {
        setProcesso(
          CATEGORIAS.includes(initialData.processo as Categoria)
            ? (initialData.processo as Categoria)
            : 'Atualização',
        )
        setSingleMatricula(initialData.matricula || '')
        setSingleNome(initialData.colaborador || '')
        setSingleFuncao(initialData.funcao || '')
        setFuncaoAntiga(initialData.funcao_antiga || '')
        setFuncaoAtual(initialData.funcao_atual || '')
        const rawDataTroca = initialData.data_troca_funcao || ''
        setDataTrocaFuncao(rawDataTroca ? rawDataTroca.slice(0, 10) : '')
        const rawDataDesligamento = initialData.data_desligamento || ''
        setDataDesligamento(rawDataDesligamento ? rawDataDesligamento.slice(0, 10) : '')
        setMotivoDesligamento(initialData.motivo_desligamento || '')
        const rawDataAfast = initialData.data_afastamento || ''
        setDataAfastamento(rawDataAfast ? rawDataAfast.slice(0, 10) : '')
        const rawDataRetorno = initialData.data_retorno_afastamento || ''
        setDataRetornoAfastamento(rawDataRetorno ? rawDataRetorno.slice(0, 10) : '')
        setDiasAfastado(
          initialData.dias_afastado ??
            calculateDiasAfastado(
              rawDataAfast ? rawDataAfast.slice(0, 10) : '',
              rawDataRetorno ? rawDataRetorno.slice(0, 10) : '',
            ),
        )
        setMotivoAfastamento(initialData.motivo_afastamento || '')
        setEtapa(initialData.etapa || ETAPA_INICIAL)
        const isSemPrazoAlertaInitial =
          initialData.processo === 'Inclusão' ||
          initialData.processo === 'PRAT' ||
          initialData.processo === 'Retorno do Afastamento' ||
          initialData.processo === 'Mudança de Função' ||
          initialData.processo === 'Exclusão'
        setPrazo(isSemPrazoAlertaInitial ? '' : initialData.prazo || '')
        setSituacao(initialData.situacao || 'Pendente')
        setSingleGaragem(initialData.garagem === 'SAPOPEMBA' ? 'SAPOPEMBA' : 'CURSINO')
        setAlertaTrafego(
          isSemPrazoAlertaInitial ? '' : (initialData.alerta_trafego as AlertaTrafego) || '',
        )
        setSingleResolvedEmpId(undefined)
      } else {
        setProcesso('Inclusão')
        setSingleMatricula('')
        setSingleNome('')
        setSingleFuncao('')
        setFuncaoAntiga('')
        setFuncaoAtual('')
        setDataTrocaFuncao('')
        setDataDesligamento('')
        setMotivoDesligamento('')
        setDataAfastamento('')
        setDataRetornoAfastamento('')
        setDiasAfastado(undefined)
        setMotivoAfastamento('')
        setEtapa(ETAPA_INICIAL)
        setPrazo('')
        setSituacao('Pendente')
        setSingleGaragem('CURSINO')
        setAlertaTrafego('')
        setSingleResolvedEmpId(undefined)

        const initialColab = createEmptyColaborador()
        setColaboradores([initialColab])
        setExpandedId(initialColab.id)
      }
    }
  }, [open, initialData])

  // Helper de busca de colaborador por registro/chapa usando busca indexada pontual
  // Regra crítica: se processo for 'Exclusão', busca MESMO DESLIGADO e traz data_desligamento e motivo_desligamento.
  // Nos demais tipos (Inclusão, Mudança de Função, Atualização), busca SOMENTE Ativos e Afastados.
  const isProcessoExclusao = processo === 'Exclusão'

  const searchEmployeeData = useCallback(
    async (term: string) => {
      const cleanTerm = term.trim()
      if (!cleanTerm) return null

      // Usa a função otimizada com query indexada no PocketBase
      const emp = await findEmployeeByMatriculaOrChapa(cleanTerm, {
        allowDesligados: isProcessoExclusao,
      })

      if (emp) {
        let matchedGaragem: 'CURSINO' | 'SAPOPEMBA' = 'CURSINO'
        if (emp.filial) {
          const f = emp.filial.toUpperCase()
          if (f.includes('SAPOPEMBA')) matchedGaragem = 'SAPOPEMBA'
        }

        // Formata data de desligamento para o input type="date" (YYYY-MM-DD)
        let formattedDataDesligamento = ''
        if (emp.data_desligamento) {
          const raw = String(emp.data_desligamento).trim()
          formattedDataDesligamento = raw.includes('T') ? raw.slice(0, 10) : raw.slice(0, 10)
        }

        // Formata datas de afastamento para o input type="date" (YYYY-MM-DD)
        let formattedDataAfastamento = ''
        if (emp.data_afastamento || emp.inicio_afastamento) {
          const raw = String(emp.data_afastamento || emp.inicio_afastamento).trim()
          formattedDataAfastamento = raw.includes('T') ? raw.slice(0, 10) : raw.slice(0, 10)
        }

        let formattedDataRetornoAfastamento = ''
        if (emp.data_retorno_afastamento || emp.previsao_retorno) {
          const raw = String(emp.data_retorno_afastamento || emp.previsao_retorno).trim()
          formattedDataRetornoAfastamento = raw.includes('T') ? raw.slice(0, 10) : raw.slice(0, 10)
        }

        return {
          id: emp.id,
          nome: emp.name || '',
          funcao: emp.funcao || '',
          funcao_anterior: emp.funcao_anterior || '',
          garagem: matchedGaragem,
          data_desligamento: formattedDataDesligamento,
          motivo_desligamento: emp.motivo_desligamento || '',
          data_afastamento: formattedDataAfastamento,
          data_retorno_afastamento: formattedDataRetornoAfastamento,
          motivo_afastamento: emp.motivo_afastamento || '',
        }
      }

      return null
    },
    [isProcessoExclusao],
  )

  // Auto-busca para formulário simples (apenas no modo de Edição)
  useEffect(() => {
    if (!open || isMultiMode) return
    const term = singleMatricula.trim()
    if (!term) return

    let isMounted = true
    const timer = setTimeout(async () => {
      setSingleSearching(true)
      try {
        const match = await searchEmployeeData(term)
        if (!isMounted || !match) return
        if (match.nome) setSingleNome(match.nome)
        if (match.funcao) {
          setSingleFuncao(match.funcao)
          // Se for Mudança de Função, auto-sugere no campo "Função atual" a função atual do colaborador
          setFuncaoAtual((prev) => (prev.trim() === '' ? match.funcao : prev))
        }
        // Se for Mudança de Função e a Função antiga ainda não foi digitada:
        // sugere a função anterior real (campo funcao_anterior) se preenchida; senão, cai para a função atual
        const suggestedAntiga = (match.funcao_anterior || match.funcao || '').trim()
        if (suggestedAntiga) {
          setFuncaoAntiga((prev) => (prev.trim() === '' ? suggestedAntiga : prev))
        }
        if (processo === 'Exclusão') {
          if (match.data_desligamento) {
            setDataDesligamento((prev) => (prev.trim() === '' ? match.data_desligamento : prev))
          }
          if (match.motivo_desligamento) {
            setMotivoDesligamento((prev) => (prev.trim() === '' ? match.motivo_desligamento : prev))
          }
        }
        if (processo === 'Retorno do Afastamento') {
          const dtAfast = match.data_afastamento || ''
          const dtRet = match.data_retorno_afastamento || ''
          if (dtAfast) {
            setDataAfastamento((prev) => (prev.trim() === '' ? dtAfast : prev))
          }
          if (dtRet) {
            setDataRetornoAfastamento((prev) => (prev.trim() === '' ? dtRet : prev))
          }
          if (dtAfast && dtRet) {
            setDiasAfastado((prev) =>
              prev !== undefined ? prev : calculateDiasAfastado(dtAfast, dtRet),
            )
          }
          if (match.motivo_afastamento) {
            setMotivoAfastamento((prev) => (prev.trim() === '' ? match.motivo_afastamento : prev))
          }
        }
        setSingleGaragem(match.garagem)
        setSingleResolvedEmpId(match.id)
      } finally {
        if (isMounted) setSingleSearching(false)
      }
    }, 300)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [singleMatricula, open, isMultiMode, searchEmployeeData, processo])

  // Atualizador de campo de colaborador para múltiplos
  const updateColaborador = (id: string, updates: Partial<ColaboradorItem>) => {
    setColaboradores((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)))
  }

  // Manipulador de matrícula com auto-busca para colaborador na criação (todos os tipos)
  const handleColaboradorMatriculaChange = (id: string, val: string) => {
    updateColaborador(id, { matricula: val })
    const term = val.trim()
    if (!term) return

    const timer = setTimeout(async () => {
      updateColaborador(id, { searching: true })
      try {
        const match = await searchEmployeeData(term)
        if (match) {
          setColaboradores((prev) =>
            prev.map((c) => {
              if (c.id !== id) return c
              const suggestedAntiga = (match.funcao_anterior || match.funcao || '').trim()
              return {
                ...c,
                nome: match.nome || c.nome,
                funcao: match.funcao || c.funcao,
                garagem: match.garagem || c.garagem,
                employeeId: match.id,
                searching: false,
                // Sugestões para Mudança de Função
                funcao_antiga:
                  c.funcao_antiga && c.funcao_antiga.trim() !== ''
                    ? c.funcao_antiga
                    : suggestedAntiga,
                funcao_atual:
                  c.funcao_atual && c.funcao_atual.trim() !== ''
                    ? c.funcao_atual
                    : match.funcao || '',
                // Sugestões para Exclusão (preenche data_desligamento e motivo_desligamento se existirem no colaborador)
                data_desligamento:
                  match.data_desligamento &&
                  (!c.data_desligamento || c.data_desligamento.trim() === '')
                    ? match.data_desligamento
                    : c.data_desligamento,
                motivo_desligamento:
                  match.motivo_desligamento &&
                  (!c.motivo_desligamento || c.motivo_desligamento.trim() === '')
                    ? match.motivo_desligamento
                    : c.motivo_desligamento,
                // Sugestões para Retorno do Afastamento
                data_afastamento:
                  match.data_afastamento &&
                  (!c.data_afastamento || c.data_afastamento.trim() === '')
                    ? match.data_afastamento
                    : c.data_afastamento,
                data_retorno_afastamento:
                  match.data_retorno_afastamento &&
                  (!c.data_retorno_afastamento || c.data_retorno_afastamento.trim() === '')
                    ? match.data_retorno_afastamento
                    : c.data_retorno_afastamento,
                dias_afastado:
                  c.dias_afastado !== undefined
                    ? c.dias_afastado
                    : calculateDiasAfastado(
                        match.data_afastamento &&
                          (!c.data_afastamento || c.data_afastamento.trim() === '')
                          ? match.data_afastamento
                          : c.data_afastamento,
                        match.data_retorno_afastamento &&
                          (!c.data_retorno_afastamento || c.data_retorno_afastamento.trim() === '')
                          ? match.data_retorno_afastamento
                          : c.data_retorno_afastamento,
                      ),
                motivo_afastamento:
                  match.motivo_afastamento &&
                  (!c.motivo_afastamento || c.motivo_afastamento.trim() === '')
                    ? match.motivo_afastamento
                    : c.motivo_afastamento,
              }
            }),
          )
        } else {
          updateColaborador(id, { searching: false })
        }
      } catch {
        updateColaborador(id, { searching: false })
      }
    }, 300)

    return () => clearTimeout(timer)
  }

  const handleAddColaborador = () => {
    const newColab = createEmptyColaborador('CURSINO')
    setColaboradores((prev) => [...prev, newColab])
    // O novo colaborador fica aberto para edição
    setExpandedId(newColab.id)
  }

  const handleRemoveColaborador = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (colaboradores.length <= 1) return
    setColaboradores((prev) => {
      const next = prev.filter((c) => c.id !== id)
      if (expandedId === id && next.length > 0) {
        setExpandedId(next[next.length - 1].id)
      }
      return next
    })
  }

  // Validação
  const canSubmit = useMemo(() => {
    if (saving) return false
    if (!processo) return false

    if (isMultiMode) {
      if (colaboradores.length === 0) return false

      if (processo === 'Mudança de Função') {
        return colaboradores.every(
          (c) =>
            c.matricula.trim() !== '' &&
            c.nome.trim() !== '' &&
            (c.funcao_antiga || '').trim() !== '' &&
            (c.funcao_atual || '').trim() !== '' &&
            (c.data_troca_funcao || '').trim() !== '',
        )
      }

      if (processo === 'Exclusão') {
        return colaboradores.every(
          (c) =>
            c.matricula.trim() !== '' &&
            c.nome.trim() !== '' &&
            (c.data_desligamento || '').trim() !== '' &&
            (c.motivo_desligamento || '').trim() !== '',
        )
      }

      // Inclusão, PRAT, Retorno do Afastamento e Atualização: exigem registro e nome preenchidos
      return colaboradores.every((c) => c.matricula.trim() !== '' && c.nome.trim() !== '')
    }

    // Modo Edição (processo único)
    if (processo === 'Mudança de Função') {
      return (
        singleMatricula.trim() !== '' &&
        singleNome.trim() !== '' &&
        funcaoAntiga.trim() !== '' &&
        funcaoAtual.trim() !== '' &&
        dataTrocaFuncao.trim() !== ''
      )
    }

    if (processo === 'Exclusão') {
      return (
        singleMatricula.trim() !== '' &&
        singleNome.trim() !== '' &&
        dataDesligamento.trim() !== '' &&
        motivoDesligamento.trim() !== ''
      )
    }

    return singleMatricula.trim() !== '' && singleNome.trim() !== ''
  }, [
    saving,
    processo,
    isMultiMode,
    colaboradores,
    singleMatricula,
    singleNome,
    funcaoAntiga,
    funcaoAtual,
    dataTrocaFuncao,
    dataDesligamento,
    motivoDesligamento,
  ])

  const handleSubmit = async () => {
    if (!canSubmit) return

    // Para Atualização (ou qualquer processo com prazo preenchido): valida data
    if (prazo && prazo.trim() !== '') {
      const trimmedPrazo = prazo.trim()
      const parsedDate = trimmedPrazo.includes('T')
        ? new Date(trimmedPrazo)
        : new Date(`${trimmedPrazo}T12:00:00Z`)
      if (Number.isNaN(parsedDate.getTime())) {
        toast.error('Por favor, informe uma data de prazo válida.')
        return
      }
    }

    // Evita duplicidade de colaboradores no mesmo lote (mesma matrícula)
    if (isMultiMode && colaboradores.length > 1) {
      const matriculasVistas = new Set<string>()
      for (const colab of colaboradores) {
        const mat = colab.matricula.trim()
        if (mat) {
          if (matriculasVistas.has(mat)) {
            toast.error(`A matrícula ${mat} foi adicionada mais de uma vez no formulário.`)
            return
          }
          matriculasVistas.add(mat)
        }
      }
    }

    setSaving(true)
    try {
      if (isMultiMode) {
        const isSemPrazoAlerta =
          processo === 'Inclusão' ||
          processo === 'PRAT' ||
          processo === 'Retorno do Afastamento' ||
          processo === 'Mudança de Função' ||
          processo === 'Exclusão'
        const isMudancaFuncao = processo === 'Mudança de Função'
        const isExclusao = processo === 'Exclusão'
        const isRetornoAfast = processo === 'Retorno do Afastamento'

        // Validação adicional de datas nos blocos múltiplos
        if (isMudancaFuncao) {
          for (let i = 0; i < colaboradores.length; i++) {
            const c = colaboradores[i]
            const dt = (c.data_troca_funcao || '').trim()
            if (!dt) {
              toast.error(
                `Informe a Data de Troca de Função para o colaborador #${i + 1} (${c.nome || c.matricula}).`,
              )
              setSaving(false)
              return
            }
            const parsed = new Date(dt.includes('T') ? dt : `${dt}T12:00:00Z`)
            if (Number.isNaN(parsed.getTime())) {
              toast.error(
                `Data de Troca de Função inválida para o colaborador #${i + 1} (${c.nome || c.matricula}).`,
              )
              setSaving(false)
              return
            }
          }
        }

        if (isExclusao) {
          for (let i = 0; i < colaboradores.length; i++) {
            const c = colaboradores[i]
            const dt = (c.data_desligamento || '').trim()
            if (!dt) {
              toast.error(
                `Informe a Data de Desligamento para o colaborador #${i + 1} (${c.nome || c.matricula}).`,
              )
              setSaving(false)
              return
            }
            const parsed = new Date(dt.includes('T') ? dt : `${dt}T12:00:00Z`)
            if (Number.isNaN(parsed.getTime())) {
              toast.error(
                `Data de Desligamento inválida para o colaborador #${i + 1} (${c.nome || c.matricula}).`,
              )
              setSaving(false)
              return
            }
          }
        }

        // Envia todos os colaboradores cadastrados
        const payloadList: ProcessoCadastralFormData[] = colaboradores.map((c) => {
          const mainFuncao = isMudancaFuncao ? (c.funcao_atual || '').trim() : c.funcao.trim()
          // Tipos sem etapa explícita gravam sempre a etapa padrão "Documentos solicitados"
          const etapaGravar = isSemPrazoAlerta ? ETAPA_INICIAL : etapa

          return {
            processo,
            matricula: c.matricula.trim(),
            nome: c.nome.trim(),
            funcao: mainFuncao,
            etapa: etapaGravar,
            prazo: isSemPrazoAlerta ? '' : prazo,
            situacao: 'Pendente',
            garagem: c.garagem,
            alerta_trafego: isSemPrazoAlerta ? '' : alertaTrafego,
            employeeId: c.employeeId,
            funcao_antiga: isMudancaFuncao ? (c.funcao_antiga || '').trim() : '',
            funcao_atual: isMudancaFuncao ? (c.funcao_atual || '').trim() : '',
            data_troca_funcao: isMudancaFuncao ? c.data_troca_funcao || '' : '',
            data_desligamento: isExclusao ? c.data_desligamento || '' : '',
            motivo_desligamento: isExclusao ? (c.motivo_desligamento || '').trim() : '',
            data_afastamento: isRetornoAfast ? c.data_afastamento || '' : '',
            data_retorno_afastamento: isRetornoAfast ? c.data_retorno_afastamento || '' : '',
            dias_afastado: isRetornoAfast
              ? (c.dias_afastado ??
                calculateDiasAfastado(c.data_afastamento, c.data_retorno_afastamento))
              : undefined,
            motivo_afastamento: isRetornoAfast ? (c.motivo_afastamento || '').trim() : '',
          }
        })

        await onSubmit(payloadList)
      } else {
        const isSemPrazoAlerta =
          processo === 'Inclusão' ||
          processo === 'PRAT' ||
          processo === 'Retorno do Afastamento' ||
          processo === 'Mudança de Função' ||
          processo === 'Exclusão'
        const isMudancaFuncao = processo === 'Mudança de Função'
        const isExclusao = processo === 'Exclusão'
        const isRetornoAfast = processo === 'Retorno do Afastamento'

        // Validação extra amigável de campos para Mudança de Função na edição
        if (isMudancaFuncao) {
          if (!funcaoAntiga.trim() || !funcaoAtual.trim()) {
            toast.error('Informe a Função antiga e a Função atual para a Mudança de Função.')
            return
          }
          if (!dataTrocaFuncao.trim()) {
            toast.error('Informe a Data de Troca de Função.')
            return
          }
          const parsedDataTroca = new Date(
            dataTrocaFuncao.includes('T') ? dataTrocaFuncao : `${dataTrocaFuncao}T12:00:00Z`,
          )
          if (Number.isNaN(parsedDataTroca.getTime())) {
            toast.error('Por favor, informe uma Data de Troca de Função válida.')
            return
          }
        }

        // Validação extra amigável de campos para Exclusão na edição
        if (isExclusao) {
          if (!dataDesligamento.trim()) {
            toast.error('Informe a Data de Desligamento.')
            return
          }
          if (!motivoDesligamento.trim()) {
            toast.error('Informe o Motivo do Desligamento.')
            return
          }
          const parsedDataDesligamento = new Date(
            dataDesligamento.includes('T') ? dataDesligamento : `${dataDesligamento}T12:00:00Z`,
          )
          if (Number.isNaN(parsedDataDesligamento.getTime())) {
            toast.error('Por favor, informe uma Data de Desligamento válida.')
            return
          }
        }

        // Para Mudança de Função, o campo principal de função reflete a nova função
        const mainFuncao = isMudancaFuncao ? funcaoAtual.trim() : singleFuncao.trim()
        // Tipos sem etapa explícita gravam sempre a etapa padrão "Documentos solicitados"
        const etapaGravar = isSemPrazoAlerta ? ETAPA_INICIAL : etapa

        await onSubmit({
          processo,
          matricula: singleMatricula.trim(),
          nome: singleNome.trim(),
          funcao: mainFuncao,
          etapa: etapaGravar,
          prazo: isSemPrazoAlerta ? '' : prazo,
          situacao: isEditing ? situacao : 'Pendente',
          garagem: singleGaragem,
          alerta_trafego: isSemPrazoAlerta ? '' : alertaTrafego,
          employeeId: singleResolvedEmpId,
          funcao_antiga: isMudancaFuncao ? funcaoAntiga.trim() : '',
          funcao_atual: isMudancaFuncao ? funcaoAtual.trim() : '',
          data_troca_funcao: isMudancaFuncao ? dataTrocaFuncao : '',
          data_desligamento: isExclusao ? dataDesligamento : '',
          motivo_desligamento: isExclusao ? motivoDesligamento.trim() : '',
          data_afastamento: isRetornoAfast ? dataAfastamento : '',
          data_retorno_afastamento: isRetornoAfast ? dataRetornoAfastamento : '',
          dias_afastado: isRetornoAfast
            ? (diasAfastado ?? calculateDiasAfastado(dataAfastamento, dataRetornoAfastamento))
            : undefined,
          motivo_afastamento: isRetornoAfast ? motivoAfastamento.trim() : '',
        })
      }
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Pencil className="h-5 w-5 text-primary" />
                Editar processo
              </>
            ) : (
              <>
                <Plus className="h-5 w-5 text-primary" />
                Novo processo de {processo}
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Edite os dados cadastrais do processo selecionado.'
              : `Cadastre colaboradores no processo de ${processo}. Você pode adicionar múltiplos colaboradores usando o botão "+".`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Linha superior: Tipo do processo */}
          <div className="space-y-2">
            <Label htmlFor="modal-processo">Tipo de movimentação</Label>
            <Select
              value={processo}
              onValueChange={(value) => {
                const newProcesso = value as Categoria
                setProcesso(newProcesso)
                // Se mudar para Inclusão, PRAT, Retorno do Afastamento, Mudança de Função ou Exclusão, reseta etapa para a padrão e limpa prazo e marcação de ciência
                if (
                  newProcesso === 'Inclusão' ||
                  newProcesso === 'PRAT' ||
                  newProcesso === 'Retorno do Afastamento' ||
                  newProcesso === 'Mudança de Função' ||
                  newProcesso === 'Exclusão'
                ) {
                  setEtapa(ETAPA_INICIAL)
                  setPrazo('')
                  setAlertaTrafego('')
                }
                // Se mudar para Mudança de Função e a Função antiga estiver vazia, aproveita a função já encontrada
                if (newProcesso === 'Mudança de Função' && !funcaoAntiga && singleFuncao) {
                  setFuncaoAntiga(singleFuncao)
                }
                if (newProcesso === 'Mudança de Função' && !funcaoAtual && singleFuncao) {
                  setFuncaoAtual(singleFuncao)
                }
              }}
              disabled={isEditing}
            >
              <SelectTrigger id="modal-processo">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* CASO 1: Múltiplos Colaboradores (Criação para qualquer tipo de processo) */}
          {isMultiMode ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <Label className="text-sm font-semibold text-foreground">
                    Colaboradores ({colaboradores.length})
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Clique no colaborador para expandir e editar os dados.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddColaborador}
                  className="gap-1.5 h-8 border-primary/40 text-primary hover:bg-primary/10"
                  title="Adicionar outro colaborador ao processo"
                >
                  <Plus className="h-4 w-4" />
                  <span>Adicionar colaborador</span>
                </Button>
              </div>

              {/* Lista de colaboradores em acordeão interativo */}
              <div className="space-y-2.5">
                {colaboradores.map((colab, idx) => {
                  const isExpanded = expandedId === colab.id
                  const isMudanca = processo === 'Mudança de Função'
                  const isExcl = processo === 'Exclusão'
                  const isRetorno = processo === 'Retorno do Afastamento'

                  const isValid = isMudanca
                    ? Boolean(
                        colab.matricula.trim() &&
                        colab.nome.trim() &&
                        (colab.funcao_antiga || '').trim() &&
                        (colab.funcao_atual || '').trim() &&
                        (colab.data_troca_funcao || '').trim(),
                      )
                    : isExcl
                      ? Boolean(
                          colab.matricula.trim() &&
                          colab.nome.trim() &&
                          (colab.data_desligamento || '').trim() &&
                          (colab.motivo_desligamento || '').trim(),
                        )
                      : Boolean(colab.matricula.trim() && colab.nome.trim())

                  // Resumo da linha minimizada por tipo
                  const resumoComplemento =
                    isMudanca && (colab.funcao_antiga || colab.funcao_atual)
                      ? ` • ${colab.funcao_antiga || '—'} → ${colab.funcao_atual || '—'}`
                      : isExcl && colab.data_desligamento
                        ? ` • Desligamento: ${formatDate(colab.data_desligamento)}`
                        : isRetorno && (colab.data_afastamento || colab.data_retorno_afastamento)
                          ? ` • Afast: ${formatDate(colab.data_afastamento)} → Ret: ${formatDate(colab.data_retorno_afastamento)}`
                          : colab.funcao
                            ? ` • ${colab.funcao}`
                            : ''

                  return (
                    <div
                      key={`${colab.id}-${idx}`}
                      className={cn(
                        'rounded-lg border transition-all',
                        isExpanded
                          ? 'border-primary/50 bg-card shadow-sm p-3.5 space-y-3'
                          : 'border-border/70 bg-muted/30 hover:bg-muted/60 p-2.5 cursor-pointer',
                      )}
                      onClick={() => {
                        if (!isExpanded) {
                          setExpandedId(colab.id)
                        }
                      }}
                    >
                      {/* Cabeçalho do Card / Resumo compacto quando minimizado */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                              isExpanded
                                ? 'bg-primary text-primary-foreground'
                                : isValid
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {idx + 1}
                          </span>

                          <div className="min-w-0 truncate">
                            <span className="text-xs font-semibold text-foreground truncate block">
                              {colab.nome.trim() || `Colaborador #${idx + 1}`}
                            </span>
                            <span className="text-[11px] text-muted-foreground block truncate">
                              {colab.matricula.trim()
                                ? `Registro: ${colab.matricula} • Garagem: ${colab.garagem}${resumoComplemento}`
                                : 'Aguardando preenchimento…'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {colab.searching && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary mr-1" />
                          )}

                          {colaboradores.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => handleRemoveColaborador(colab.id, e)}
                              title="Remover este colaborador"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpandedId(isExpanded ? '' : colab.id)
                            }}
                            title={isExpanded ? 'Recolher' : 'Expandir para editar'}
                          >
                            <ChevronDown
                              className={cn(
                                'h-4 w-4 transition-transform duration-200',
                                isExpanded && 'rotate-180',
                              )}
                            />
                          </Button>
                        </div>
                      </div>

                      {/* Campos detalhados visíveis SOMENTE quando expandido */}
                      {isExpanded && (
                        <div
                          className="pt-2 border-t border-border/50 space-y-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Linha 1: Registro/Chapa e Garagem lado a lado */}
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <div className="flex h-4 items-center justify-between">
                                <Label htmlFor={`modal-matricula-${colab.id}`} className="text-xs">
                                  Registro / Chapa *
                                </Label>
                                {colab.searching && (
                                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground leading-none">
                                    <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
                                    Buscando…
                                  </span>
                                )}
                              </div>
                              <Input
                                id={`modal-matricula-${colab.id}`}
                                placeholder="Ex: 000055"
                                value={colab.matricula}
                                onChange={(e) =>
                                  handleColaboradorMatriculaChange(colab.id, e.target.value)
                                }
                                autoComplete="off"
                                className="h-8 text-xs"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <div className="flex h-4 items-center">
                                <Label htmlFor={`modal-garagem-${colab.id}`} className="text-xs">
                                  Garagem
                                </Label>
                              </div>
                              <Select
                                value={colab.garagem}
                                onValueChange={(val) =>
                                  updateColaborador(colab.id, {
                                    garagem: val as 'CURSINO' | 'SAPOPEMBA',
                                  })
                                }
                              >
                                <SelectTrigger
                                  id={`modal-garagem-${colab.id}`}
                                  className="h-8 text-xs"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="CURSINO">CURSINO</SelectItem>
                                  <SelectItem value="SAPOPEMBA">SAPOPEMBA</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Linha 2: Nome Completo (e Função para Inclusão/Atualização/Retorno) */}
                          <div
                            className={cn(
                              'grid grid-cols-1 gap-3',
                              isMudanca || isExcl ? 'sm:grid-cols-1' : 'sm:grid-cols-2',
                            )}
                          >
                            <div className="space-y-1.5">
                              <Label htmlFor={`modal-nome-${colab.id}`} className="text-xs">
                                Nome Completo *
                              </Label>
                              <Input
                                id={`modal-nome-${colab.id}`}
                                placeholder="Nome completo"
                                value={colab.nome}
                                onChange={(e) =>
                                  updateColaborador(colab.id, { nome: e.target.value })
                                }
                                autoComplete="off"
                                className="h-8 text-xs"
                              />
                            </div>

                            {!isMudanca && !isExcl && (
                              <div className="space-y-1.5">
                                <Label htmlFor={`modal-funcao-${colab.id}`} className="text-xs">
                                  Função
                                </Label>
                                <Input
                                  id={`modal-funcao-${colab.id}`}
                                  placeholder="Função"
                                  value={colab.funcao}
                                  onChange={(e) =>
                                    updateColaborador(colab.id, { funcao: e.target.value })
                                  }
                                  autoComplete="off"
                                  className="h-8 text-xs"
                                />
                              </div>
                            )}
                          </div>

                          {/* Bloco exclusivo por colaborador: Mudança de Função */}
                          {isMudanca && (
                            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wide">
                                <ArrowRightLeft className="h-3.5 w-3.5" />
                                <span>Dados da Mudança de Função</span>
                              </div>

                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                  <Label
                                    htmlFor={`modal-funcao-antiga-${colab.id}`}
                                    className="text-xs font-semibold"
                                  >
                                    Função antiga *
                                  </Label>
                                  <Input
                                    id={`modal-funcao-antiga-${colab.id}`}
                                    placeholder="Ex: Motorista"
                                    value={colab.funcao_antiga || ''}
                                    onChange={(e) =>
                                      updateColaborador(colab.id, {
                                        funcao_antiga: e.target.value,
                                      })
                                    }
                                    autoComplete="off"
                                    className="bg-white text-xs h-8"
                                  />
                                  <span className="text-[10px] text-muted-foreground">
                                    Função que exercia antes da troca
                                  </span>
                                </div>

                                <div className="space-y-1.5">
                                  <Label
                                    htmlFor={`modal-funcao-atual-${colab.id}`}
                                    className="text-xs font-semibold"
                                  >
                                    Função atual *
                                  </Label>
                                  <Input
                                    id={`modal-funcao-atual-${colab.id}`}
                                    placeholder="Ex: Fiscal de Linha"
                                    value={colab.funcao_atual || ''}
                                    onChange={(e) =>
                                      updateColaborador(colab.id, {
                                        funcao_atual: e.target.value,
                                      })
                                    }
                                    autoComplete="off"
                                    className="bg-white text-xs h-8"
                                  />
                                  <span className="text-[10px] text-muted-foreground">
                                    Nova função assumida pelo colaborador
                                  </span>
                                </div>
                              </div>

                              <div className="space-y-1.5 pt-1">
                                <Label
                                  htmlFor={`modal-data-troca-${colab.id}`}
                                  className="text-xs font-semibold"
                                >
                                  Data de Troca de Função *
                                </Label>
                                <Input
                                  id={`modal-data-troca-${colab.id}`}
                                  type="date"
                                  value={colab.data_troca_funcao || ''}
                                  onChange={(e) =>
                                    updateColaborador(colab.id, {
                                      data_troca_funcao: e.target.value,
                                    })
                                  }
                                  className="bg-white text-xs h-8"
                                />
                                <span className="text-[10px] text-muted-foreground">
                                  Data em que a troca de função aconteceu
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Bloco exclusivo por colaborador: Exclusão (Desligamento) */}
                          {isExcl && (
                            <>
                              <div className="space-y-1.5">
                                <Label htmlFor={`modal-funcao-${colab.id}`} className="text-xs">
                                  Função
                                </Label>
                                <Input
                                  id={`modal-funcao-${colab.id}`}
                                  placeholder="Função do colaborador"
                                  value={colab.funcao}
                                  onChange={(e) =>
                                    updateColaborador(colab.id, { funcao: e.target.value })
                                  }
                                  autoComplete="off"
                                  className="h-8 text-xs"
                                />
                              </div>

                              <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/50 p-3">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-900 uppercase tracking-wide">
                                  <UserMinus className="h-3.5 w-3.5 text-rose-600" />
                                  <span>Dados do Desligamento</span>
                                </div>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <div className="space-y-1.5">
                                    <Label
                                      htmlFor={`modal-data-desligamento-${colab.id}`}
                                      className="text-xs font-semibold"
                                    >
                                      Data Desligamento *
                                    </Label>
                                    <Input
                                      id={`modal-data-desligamento-${colab.id}`}
                                      type="date"
                                      value={colab.data_desligamento || ''}
                                      onChange={(e) =>
                                        updateColaborador(colab.id, {
                                          data_desligamento: e.target.value,
                                        })
                                      }
                                      className="bg-white text-xs h-8"
                                    />
                                    <span className="text-[10px] text-muted-foreground">
                                      Data efetiva do desligamento
                                    </span>
                                  </div>

                                  <div className="space-y-1.5">
                                    <Label
                                      htmlFor={`modal-motivo-desligamento-${colab.id}`}
                                      className="text-xs font-semibold"
                                    >
                                      Motivo Desligamento *
                                    </Label>
                                    <Input
                                      id={`modal-motivo-desligamento-${colab.id}`}
                                      placeholder="Ex: Pedido de demissão, Sem justa causa..."
                                      value={colab.motivo_desligamento || ''}
                                      onChange={(e) =>
                                        updateColaborador(colab.id, {
                                          motivo_desligamento: e.target.value,
                                        })
                                      }
                                      autoComplete="off"
                                      className="bg-white text-xs h-8"
                                    />
                                    <span className="text-[10px] text-muted-foreground">
                                      Motivo ou justificativa do desligamento
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </>
                          )}

                          {/* Bloco exclusivo por colaborador: Retorno do Afastamento */}
                          {isRetorno && (
                            <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 uppercase tracking-wide">
                                <UserCheck className="h-3.5 w-3.5 text-indigo-600" />
                                <span>Dados do Afastamento</span>
                              </div>

                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                  <Label
                                    htmlFor={`modal-data-afastamento-${colab.id}`}
                                    className="text-xs font-semibold"
                                  >
                                    Data do Afastamento
                                  </Label>
                                  <Input
                                    id={`modal-data-afastamento-${colab.id}`}
                                    type="date"
                                    value={colab.data_afastamento || ''}
                                    onChange={(e) => {
                                      const newAfast = e.target.value
                                      const newDias = calculateDiasAfastado(
                                        newAfast,
                                        colab.data_retorno_afastamento,
                                      )
                                      updateColaborador(colab.id, {
                                        data_afastamento: newAfast,
                                        dias_afastado: newDias,
                                      })
                                    }}
                                    className="bg-white text-xs h-8"
                                  />
                                </div>

                                <div className="space-y-1.5">
                                  <Label
                                    htmlFor={`modal-data-retorno-${colab.id}`}
                                    className="text-xs font-semibold"
                                  >
                                    Retorno do Afastamento
                                  </Label>
                                  <Input
                                    id={`modal-data-retorno-${colab.id}`}
                                    type="date"
                                    value={colab.data_retorno_afastamento || ''}
                                    onChange={(e) => {
                                      const newRetorno = e.target.value
                                      const newDias = calculateDiasAfastado(
                                        colab.data_afastamento,
                                        newRetorno,
                                      )
                                      updateColaborador(colab.id, {
                                        data_retorno_afastamento: newRetorno,
                                        dias_afastado: newDias,
                                      })
                                    }}
                                    className="bg-white text-xs h-8"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div className="space-y-1.5 sm:col-span-1">
                                  <Label
                                    htmlFor={`modal-dias-afastado-${colab.id}`}
                                    className="text-xs font-semibold"
                                  >
                                    Quantos dias ficou afastado
                                  </Label>
                                  <Input
                                    id={`modal-dias-afastado-${colab.id}`}
                                    type="number"
                                    min="0"
                                    placeholder="Ex: 15"
                                    value={
                                      colab.dias_afastado !== undefined ? colab.dias_afastado : ''
                                    }
                                    onChange={(e) =>
                                      updateColaborador(colab.id, {
                                        dias_afastado:
                                          e.target.value === ''
                                            ? undefined
                                            : parseInt(e.target.value, 10),
                                      })
                                    }
                                    className="bg-white text-xs h-8 font-semibold"
                                  />
                                  <span className="text-[10px] text-muted-foreground">
                                    Calculado automaticamente
                                  </span>
                                </div>

                                <div className="space-y-1.5 sm:col-span-2">
                                  <Label
                                    htmlFor={`modal-motivo-afastamento-${colab.id}`}
                                    className="text-xs font-semibold"
                                  >
                                    Motivo do Afastamento
                                  </Label>
                                  <Textarea
                                    id={`modal-motivo-afastamento-${colab.id}`}
                                    rows={2}
                                    placeholder="Ex: Auxílio Doença, Acidente de Trabalho..."
                                    value={colab.motivo_afastamento || ''}
                                    onChange={(e) =>
                                      updateColaborador(colab.id, {
                                        motivo_afastamento: e.target.value,
                                      })
                                    }
                                    autoComplete="off"
                                    className="bg-white text-xs min-h-[60px] resize-y"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Botão de adicionar colaborador no rodapé da lista */}
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 border-dashed border-border hover:border-primary/60 hover:bg-muted/50 text-xs h-9"
                onClick={handleAddColaborador}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar mais um colaborador ({processo})
              </Button>
            </div>
          ) : (
            /* CASO 2: Formulário Simples (apenas no modo de Edição) */
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex h-5 items-center justify-between">
                    <Label htmlFor="modal-matricula">Registro / Chapa</Label>
                    {singleSearching && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground leading-none">
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        Buscando colaborador…
                      </span>
                    )}
                  </div>
                  <Input
                    id="modal-matricula"
                    placeholder="Digite o registro ou chapa (ex: 000055)"
                    value={singleMatricula}
                    onChange={(event) => setSingleMatricula(event.target.value)}
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex h-5 items-center">
                    <Label htmlFor="modal-garagem">Garagem</Label>
                  </div>
                  <Select
                    value={singleGaragem}
                    onValueChange={(val) => setSingleGaragem(val as 'CURSINO' | 'SAPOPEMBA')}
                  >
                    <SelectTrigger id="modal-garagem">
                      <SelectValue placeholder="Selecione a garagem" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CURSINO">CURSINO</SelectItem>
                      <SelectItem value="SAPOPEMBA">SAPOPEMBA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="modal-nome">Nome Completo</Label>
                <Input
                  id="modal-nome"
                  placeholder="Nome completo do colaborador"
                  value={singleNome}
                  onChange={(event) => setSingleNome(event.target.value)}
                  autoComplete="off"
                />
              </div>

              {processo === 'Mudança de Função' ? (
                /* Bloco exclusivo: Mudança de Função */
                <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wide">
                    <ArrowRightLeft className="h-4 w-4" />
                    <span>Dados da Mudança de Função</span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="modal-funcao-antiga" className="text-xs font-semibold">
                        Função antiga *
                      </Label>
                      <Input
                        id="modal-funcao-antiga"
                        placeholder="Ex: Motorista"
                        value={funcaoAntiga}
                        onChange={(event) => setFuncaoAntiga(event.target.value)}
                        autoComplete="off"
                        className="bg-white text-xs"
                      />
                      <span className="text-[10px] text-muted-foreground">
                        Função que exercia antes da troca
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="modal-funcao-atual" className="text-xs font-semibold">
                        Função atual *
                      </Label>
                      <Input
                        id="modal-funcao-atual"
                        placeholder="Ex: Fiscal de Linha"
                        value={funcaoAtual}
                        onChange={(event) => setFuncaoAtual(event.target.value)}
                        autoComplete="off"
                        className="bg-white text-xs"
                      />
                      <span className="text-[10px] text-muted-foreground">
                        Nova função assumida pelo colaborador
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <Label htmlFor="modal-data-troca" className="text-xs font-semibold">
                      Data de Troca de Função *
                    </Label>
                    <Input
                      id="modal-data-troca"
                      type="date"
                      value={dataTrocaFuncao}
                      onChange={(event) => setDataTrocaFuncao(event.target.value)}
                      className="bg-white text-xs"
                    />
                    <span className="text-[10px] text-muted-foreground">
                      Data em que a troca de função aconteceu
                    </span>
                  </div>
                </div>
              ) : processo === 'Exclusão' ? (
                /* Bloco exclusivo: Exclusão (Desligamento) */
                <>
                  <div className="space-y-2">
                    <Label htmlFor="modal-funcao">Função</Label>
                    <Input
                      id="modal-funcao"
                      placeholder="Função do colaborador"
                      value={singleFuncao}
                      onChange={(event) => setSingleFuncao(event.target.value)}
                      autoComplete="off"
                    />
                  </div>

                  <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/50 p-3.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-900 uppercase tracking-wide">
                      <UserMinus className="h-4 w-4 text-rose-600" />
                      <span>Dados do Desligamento</span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="modal-data-desligamento" className="text-xs font-semibold">
                          Data Desligamento *
                        </Label>
                        <Input
                          id="modal-data-desligamento"
                          type="date"
                          value={dataDesligamento}
                          onChange={(event) => setDataDesligamento(event.target.value)}
                          className="bg-white text-xs"
                        />
                        <span className="text-[10px] text-muted-foreground">
                          Data efetiva do desligamento
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="modal-motivo-desligamento"
                          className="text-xs font-semibold"
                        >
                          Motivo Desligamento *
                        </Label>
                        <Input
                          id="modal-motivo-desligamento"
                          placeholder="Ex: Pedido de demissão, Demissão sem justa causa..."
                          value={motivoDesligamento}
                          onChange={(event) => setMotivoDesligamento(event.target.value)}
                          autoComplete="off"
                          className="bg-white text-xs"
                        />
                        <span className="text-[10px] text-muted-foreground">
                          Motivo ou justificativa do desligamento
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              ) : processo === 'Retorno do Afastamento' ? (
                /* Bloco exclusivo: Retorno do Afastamento */
                <>
                  <div className="space-y-2">
                    <Label htmlFor="modal-funcao">Função</Label>
                    <Input
                      id="modal-funcao"
                      placeholder="Função do colaborador"
                      value={singleFuncao}
                      onChange={(event) => setSingleFuncao(event.target.value)}
                      autoComplete="off"
                    />
                  </div>

                  <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 uppercase tracking-wide">
                      <UserCheck className="h-4 w-4 text-indigo-600" />
                      <span>Dados do Afastamento</span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="modal-data-afastamento" className="text-xs font-semibold">
                          Data do Afastamento
                        </Label>
                        <Input
                          id="modal-data-afastamento"
                          type="date"
                          value={dataAfastamento}
                          onChange={(event) => {
                            const newAfast = event.target.value
                            setDataAfastamento(newAfast)
                            const newDias = calculateDiasAfastado(newAfast, dataRetornoAfastamento)
                            if (newDias !== undefined) setDiasAfastado(newDias)
                          }}
                          className="bg-white text-xs"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="modal-data-retorno" className="text-xs font-semibold">
                          Retorno do Afastamento
                        </Label>
                        <Input
                          id="modal-data-retorno"
                          type="date"
                          value={dataRetornoAfastamento}
                          onChange={(event) => {
                            const newRetorno = event.target.value
                            setDataRetornoAfastamento(newRetorno)
                            const newDias = calculateDiasAfastado(dataAfastamento, newRetorno)
                            if (newDias !== undefined) setDiasAfastado(newDias)
                          }}
                          className="bg-white text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5 sm:col-span-1">
                        <Label htmlFor="modal-dias-afastado" className="text-xs font-semibold">
                          Quantos dias ficou afastado
                        </Label>
                        <Input
                          id="modal-dias-afastado"
                          type="number"
                          min="0"
                          placeholder="Ex: 15"
                          value={diasAfastado !== undefined ? diasAfastado : ''}
                          onChange={(event) =>
                            setDiasAfastado(
                              event.target.value === ''
                                ? undefined
                                : parseInt(event.target.value, 10),
                            )
                          }
                          className="bg-white text-xs font-semibold"
                        />
                        <span className="text-[10px] text-muted-foreground">
                          Calculado automaticamente
                        </span>
                      </div>

                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="modal-motivo-afastamento" className="text-xs font-semibold">
                          Motivo do Afastamento
                        </Label>
                        <Textarea
                          id="modal-motivo-afastamento"
                          rows={2}
                          placeholder="Ex: Auxílio Doença, Acidente de Trabalho..."
                          value={motivoAfastamento}
                          onChange={(event) => setMotivoAfastamento(event.target.value)}
                          autoComplete="off"
                          className="bg-white text-xs min-h-[60px] resize-y"
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="modal-funcao">Função</Label>
                  <Input
                    id="modal-funcao"
                    placeholder="Função do colaborador"
                    value={singleFuncao}
                    onChange={(event) => setSingleFuncao(event.target.value)}
                    autoComplete="off"
                  />
                </div>
              )}
            </>
          )}

          {/* Etapa: Oculto quando o processo for "Inclusão", "PRAT", "Retorno do Afastamento", "Mudança de Função" ou "Exclusão"; Visível APENAS para "Atualização" */}
          {processo !== 'Inclusão' &&
            processo !== 'PRAT' &&
            processo !== 'Retorno do Afastamento' &&
            processo !== 'Mudança de Função' &&
            processo !== 'Exclusão' && (
              <div className="space-y-2">
                <Label htmlFor="modal-etapa">Etapa</Label>
                <Select value={etapa} onValueChange={(value) => setEtapa(value as Etapa)}>
                  <SelectTrigger id="modal-etapa">
                    <SelectValue placeholder="Selecione a etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    {ETAPAS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

          {/* Prazo: Oculto quando o processo for "Inclusão", "PRAT", "Retorno do Afastamento", "Mudança de Função" ou "Exclusão"; Mantido para "Atualização" e demais tipos */}
          {processo !== 'Inclusão' &&
            processo !== 'PRAT' &&
            processo !== 'Retorno do Afastamento' &&
            processo !== 'Mudança de Função' &&
            processo !== 'Exclusão' && (
              <div className="space-y-2">
                <Label htmlFor="modal-prazo">Prazo</Label>
                <Input
                  id="modal-prazo"
                  type="date"
                  value={prazo}
                  onChange={(event) => setPrazo(event.target.value)}
                />
              </div>
            )}

          {/* Marcação de ciência para o Tráfego (opcional) - Oculto para Inclusão, PRAT, Retorno do Afastamento, Mudança de Função e Exclusão; mantido para Atualização e outros tipos */}
          {processo !== 'Inclusão' &&
            processo !== 'PRAT' &&
            processo !== 'Retorno do Afastamento' &&
            processo !== 'Mudança de Função' &&
            processo !== 'Exclusão' && (
              <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-foreground">
                    Marcação de ciência (opcional)
                  </Label>
                  {alertaTrafego && (
                    <button
                      type="button"
                      onClick={() => setAlertaTrafego('')}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline"
                    >
                      Limpar marcação
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
                  <label
                    className={cn(
                      'flex items-center gap-2.5 rounded-md border p-2.5 text-xs cursor-pointer transition-colors',
                      alertaTrafego === 'bloquear_foto'
                        ? 'border-amber-500 bg-amber-50/70 text-amber-950 font-medium'
                        : 'border-border/70 hover:bg-muted/40 text-foreground',
                    )}
                  >
                    <input
                      type="radio"
                      name="alerta_trafego"
                      value="bloquear_foto"
                      checked={alertaTrafego === 'bloquear_foto'}
                      onChange={() => setAlertaTrafego('bloquear_foto')}
                      className="h-3.5 w-3.5 text-amber-600 focus:ring-amber-500"
                    />
                    <span>Bloquear foto</span>
                  </label>

                  <label
                    className={cn(
                      'flex items-center gap-2.5 rounded-md border p-2.5 text-xs cursor-pointer transition-colors',
                      alertaTrafego === 'impossibilitado_trabalhar'
                        ? 'border-amber-500 bg-amber-50/70 text-amber-950 font-medium'
                        : 'border-border/70 hover:bg-muted/40 text-foreground',
                    )}
                  >
                    <input
                      type="radio"
                      name="alerta_trafego"
                      value="impossibilitado_trabalhar"
                      checked={alertaTrafego === 'impossibilitado_trabalhar'}
                      onChange={() => setAlertaTrafego('impossibilitado_trabalhar')}
                      className="h-3.5 w-3.5 text-amber-600 focus:ring-amber-500"
                    />
                    <span>Impossibilitar de Trabalhar</span>
                  </label>
                </div>

                {alertaTrafego ? (
                  <p className="text-[11px] text-amber-800 font-medium pt-0.5">
                    Apenas informativo — não altera a Situação do processo.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground pt-0.5">
                    Selecione uma opção caso deseje sinalizar o Tráfego na data do prazo.
                  </p>
                )}
              </div>
            )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit || saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : isEditing ? (
                'Salvar alterações'
              ) : isMultiMode && colaboradores.length > 1 ? (
                `Registrar ${colaboradores.length} processos`
              ) : (
                'Registrar processo'
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
