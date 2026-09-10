import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileDown,
  FilePlus2,
  FileSearch,
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
} from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'

import NovaMovimentacaoModal from '@/components/NovaMovimentacaoModal'
import VisualizarCartasModal from '@/components/VisualizarCartasModal'
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useRealtime } from '@/hooks/use-realtime'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { formatDate } from '@/lib/format'
import { listAllEmployees } from '@/services/employees'
import {
  listProcessosCadastrais,
  createProcessoCadastral,
  updateProcessoCadastral,
  updateProcessoSituacao,
  deleteProcessoCadastral,
} from '@/services/processosCadastrais'
import { createMovement } from '@/services/movements'
import type { AlertaTrafego, Employee, ProcessoSituacao } from '@/lib/types'
import { cn } from '@/lib/utils'

// Categorias exibidas nos cards de resumo (ordem exata solicitada)
const CATEGORIAS = [
  'Inclusão',
  'Alteração',
  'Exclusão',
  'Atualização',
  'Atualização Fiscal',
] as const
type Categoria = (typeof CATEGORIAS)[number]

const CATEGORIAS_SPTRANS: Record<Categoria, string> = {
  Inclusão: 'Inclusão',
  Alteração: 'Alteração',
  Exclusão: 'Exclusão',
  Atualização: 'Atualização',
  'Atualização Fiscal': 'Atualização Fiscal',
}

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
  Alteração: {
    icon: RefreshCcw,
    ring: 'border-amber-200',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
  },
  Exclusão: { icon: FileX2, ring: 'border-rose-200', bg: 'bg-rose-50', text: 'text-rose-700' },
  Atualização: { icon: RefreshCcw, ring: 'border-sky-200', bg: 'bg-sky-50', text: 'text-sky-700' },
  'Atualização Fiscal': {
    icon: FileSearch,
    ring: 'border-violet-200',
    bg: 'bg-violet-50',
    text: 'text-violet-700',
  },
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
  processo: Categoria
  etapa: Etapa
  prazo: string
  situacao: Situacao
  garagem: 'CURSINO' | 'SAPOPEMBA' | string
  alerta_trafego?: AlertaTrafego | string
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
  // Garagem do usuário (para Tráfego: 'CURSINO' ou 'SAPOPEMBA')
  const userGaragem = (user?.garagem as string) || (isTrafego ? 'CURSINO' : 'Todas')

  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [cartasModalOpen, setCartasModalOpen] = useState(false)
  const [editingProcesso, setEditingProcesso] = useState<ProcessoCadastral | null>(null)
  const [deletingProcesso, setDeletingProcesso] = useState<ProcessoCadastral | null>(null)
  const [processoAlterarSituacao, setProcessoAlterarSituacao] = useState<ProcessoCadastral | null>(
    null,
  )
  const [selectedProcessoDetalhes, setSelectedProcessoDetalhes] =
    useState<ProcessoCadastral | null>(null)
  const [novaSituacaoTrafego, setNovaSituacaoTrafego] = useState<ProcessoSituacao>('Foto Bloqueada')
  const [salvandoSituacaoTrafego, setSalvandoSituacaoTrafego] = useState(false)
  const [processos, setProcessos] = useState<ProcessoCadastral[]>([])
  const [selectedCategoria, setSelectedCategoria] = useState<Categoria | null>(null)
  const [viewRegulares, setViewRegulares] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEtapa, setSelectedEtapa] = useState<string>('todas')
  const [selectedGaragem, setSelectedGaragem] = useState<string>('todas')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [employees, setEmployees] = useState<Employee[]>([])

  // Monta o filtro PocketBase garantindo regras no backend:
  // 1. Tráfego: vê apenas sua garagem e nunca vê "Regular"
  // 2. Admin/RH:
  //    - Se viewRegulares === true: somente situacao = "Regular"
  //    - Se viewRegulares === false (padrão): situacao != "Regular"
  const backendFilter = useMemo(() => {
    const parts: string[] = []

    if (isTrafego) {
      const g = userGaragem.toUpperCase()
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
      setProcessos(
        records.map((r) => ({
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
        })),
      )
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

  // Base de colaboradores do banco para o autocomplete do formulário
  useEffect(() => {
    let cancelled = false
    listAllEmployees()
      .then((items) => {
        if (!cancelled) setEmployees(items)
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
    listAllEmployees()
      .then((items) => setEmployees(items))
      .catch(() => {
        // silencioso
      })
  })

  // Processos visíveis para o usuário:
  // Se for perfil Tráfego:
  // 1. Filtrar exclusivamente pela garagem do usuário (CURSINO ou SAPOPEMBA).
  // 2. Processos com situação "Regular" NÃO devem aparecer (nem na listagem, nem nos cards, nem no Excel).
  // Admin e RH:
  // Se viewRegulares === true: somente "Regular"
  // Se viewRegulares === false (listagem principal): NÃO contém "Regular"
  const visibleProcessos = useMemo(() => {
    if (isTrafego) {
      const userGaragemUpper = userGaragem.toUpperCase()
      return processos.filter((p) => {
        const g = (p.garagem || '').toUpperCase()
        const isSameGaragem = g === userGaragemUpper
        const isNotRegular = p.situacao !== 'Regular'
        return isSameGaragem && isNotRegular
      })
    }
    // Admin / RH:
    if (viewRegulares) {
      return processos.filter((p) => p.situacao === 'Regular')
    }
    return processos.filter((p) => p.situacao !== 'Regular')
  }, [processos, isTrafego, userGaragem, viewRegulares])

  const resumo = useMemo(() => {
    const counts = Object.fromEntries(CATEGORIAS.map((categoria) => [categoria, 0])) as Record<
      Categoria,
      number
    >
    visibleProcessos.forEach((processo) => {
      if (processo.processo in counts) counts[processo.processo] += 1
    })
    return counts
  }, [visibleProcessos])

  const toSafeIsoString = (val?: string | null): string => {
    if (!val || typeof val !== 'string') return ''
    const trimmed = val.trim()
    if (!trimmed) return ''
    const date = trimmed.includes('T') ? new Date(trimmed) : new Date(`${trimmed}T12:00:00Z`)
    if (Number.isNaN(date.getTime())) return ''
    return date.toISOString()
  }

  const handleCreate = useCallback(
    async (data: {
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
    }) => {
      try {
        const isoPrazo = toSafeIsoString(data.prazo)
        const created = await createProcessoCadastral({
          matricula: data.matricula,
          colaborador: data.nome,
          funcao: data.funcao,
          processo: data.processo,
          etapa: data.etapa,
          prazo: isoPrazo,
          situacao: data.situacao,
          garagem: data.garagem || 'CURSINO',
          alerta_trafego: data.alerta_trafego || '',
        })

        setProcessos((prev) => [
          {
            id: created.id,
            matricula: created.matricula,
            colaborador: created.colaborador,
            funcao: created.funcao,
            processo: created.processo,
            etapa: created.etapa,
            prazo: created.prazo,
            situacao: created.situacao,
            garagem: created.garagem || data.garagem || 'CURSINO',
            alerta_trafego: created.alerta_trafego || data.alerta_trafego || '',
          },
          ...prev,
        ])

        // Persiste também como movimentação no banco se houver colaborador vinculado
        if (data.employeeId) {
          try {
            const movementDate = isoPrazo || new Date().toISOString()
            await createMovement({
              employee: data.employeeId,
              type: data.processo as never,
              date: movementDate,
              notes: `Processo cadastral ${data.processo} — matrícula ${data.matricula}`,
            })
          } catch {
            // silencioso
          }
        }

        toast.success('Processo cadastrado com sucesso')
      } catch (err) {
        console.error(err)
        toast.error('Erro ao salvar processo no backend')
      }
    },
    [],
  )

  const handleUpdate = useCallback(
    async (data: {
      id: string
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
    }) => {
      try {
        const isoPrazo = toSafeIsoString(data.prazo)
        await updateProcessoCadastral(data.id, {
          matricula: data.matricula,
          colaborador: data.nome,
          funcao: data.funcao,
          processo: data.processo,
          etapa: data.etapa,
          prazo: isoPrazo,
          situacao: data.situacao,
          garagem: data.garagem,
          alerta_trafego: data.alerta_trafego ?? '',
        })

        setProcessos((prev) =>
          prev.map((item) => {
            if (item.id === data.id) {
              return {
                ...item,
                matricula: data.matricula,
                colaborador: data.nome,
                funcao: data.funcao,
                processo: data.processo,
                etapa: data.etapa,
                prazo: isoPrazo || data.prazo,
                situacao: data.situacao,
                garagem: data.garagem || item.garagem,
                alerta_trafego: data.alerta_trafego ?? item.alerta_trafego,
              }
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

    // Validação extra: o usuário do Tráfego só pode alterar processos da sua própria garagem
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
      await updateProcessoSituacao(processoAlterarSituacao.id, novaSituacaoTrafego)
      setProcessos((prev) =>
        prev.map((item) =>
          item.id === processoAlterarSituacao.id
            ? { ...item, situacao: novaSituacaoTrafego }
            : item,
        ),
      )
      toast.success(`Situação alterada para "${novaSituacaoTrafego}" com sucesso!`)
      setProcessoAlterarSituacao(null)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao atualizar a situação do processo no servidor.')
    } finally {
      setSalvandoSituacaoTrafego(false)
    }
  }, [processoAlterarSituacao, novaSituacaoTrafego, isTrafego, userGaragem])

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

      return true
    })
  }, [visibleProcessos, selectedCategoria, searchTerm, selectedEtapa, selectedGaragem, isTrafego])

  const hasActiveFilters = Boolean(
    searchTerm.trim() ||
    selectedEtapa !== 'todas' ||
    (!isTrafego && selectedGaragem !== 'todas') ||
    selectedCategoria,
  )

  const handleClearFilters = useCallback(() => {
    setSearchTerm('')
    setSelectedEtapa('todas')
    setSelectedGaragem('todas')
    setSelectedCategoria(null)
  }, [])

  // Resetar página atual quando filtros mudarem
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedCategoria, viewRegulares, searchTerm, selectedEtapa, selectedGaragem])

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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
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
                {paginatedProcessos.map((processo) => (
                  <tr
                    key={processo.id}
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
                      <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                        {processo.processo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <FilePlus2 className="h-3.5 w-3.5 text-muted-foreground/70" />
                        {processo.etapa}
                      </span>
                    </td>
                    <td className="px-4 py-3">
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
          if (editingProcesso) {
            await handleUpdate({
              id: editingProcesso.id,
              ...data,
            })
          }
        }}
      />

      {/* Modal Visualizar Cartas (Admin e RH) */}
      <VisualizarCartasModal open={cartasModalOpen} onOpenChange={setCartasModalOpen} />

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
        onUpdateSituacaoTrafego={async (id, situacao) => {
          await updateProcessoSituacao(id, situacao)
          setProcessos((prev) =>
            prev.map((item) => (item.id === id ? { ...item, situacao } : item)),
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

interface ProcessoCadastralFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: ProcessoCadastral | null
  employees: Employee[]
  onSubmit: (data: {
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
  }) => Promise<void> | void
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
  const [matricula, setMatricula] = useState('')
  const [nome, setNome] = useState('')
  const [funcao, setFuncao] = useState('')
  const [etapa, setEtapa] = useState<Etapa>(ETAPA_INICIAL)
  const [prazo, setPrazo] = useState('')
  const [situacao, setSituacao] = useState<Situacao>('Pendente')
  const [garagem, setGaragem] = useState<'CURSINO' | 'SAPOPEMBA'>('CURSINO')
  const [alertaTrafego, setAlertaTrafego] = useState<AlertaTrafego>('')
  const [searchingEmployee, setSearchingEmployee] = useState(false)
  const [resolvedEmployeeId, setResolvedEmployeeId] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      if (initialData) {
        setProcesso(initialData.processo)
        setMatricula(initialData.matricula || '')
        setNome(initialData.colaborador || '')
        setFuncao(initialData.funcao || '')
        setEtapa(initialData.etapa || ETAPA_INICIAL)
        setPrazo(initialData.prazo || '')
        setSituacao(initialData.situacao || 'Pendente')
        setGaragem(initialData.garagem === 'SAPOPEMBA' ? 'SAPOPEMBA' : 'CURSINO')
        setAlertaTrafego((initialData.alerta_trafego as AlertaTrafego) || '')
        setResolvedEmployeeId(undefined)
      } else {
        setProcesso('Inclusão')
        setMatricula('')
        setNome('')
        setFuncao('')
        setEtapa(ETAPA_INICIAL)
        setPrazo('')
        setSituacao('Pendente')
        setGaragem('CURSINO')
        setAlertaTrafego('')
        setResolvedEmployeeId(undefined)
      }
    }
  }, [open, initialData])

  // Auto-preenchimento ao digitar o registro/chapa
  useEffect(() => {
    if (!open) return
    const term = matricula.trim()
    if (!term) return

    let isMounted = true
    const timer = setTimeout(async () => {
      // 1. Tenta encontrar na lista em memória (se já carregada)
      const localMatch = employees.find((emp) => {
        const chapa = (emp.chapa || '').trim().toLowerCase()
        const reg = (emp.registro || '').trim().toLowerCase()
        const target = term.toLowerCase()
        return chapa === target || reg === target
      })

      if (localMatch) {
        if (!isMounted) return
        if (localMatch.name) setNome(localMatch.name)
        if (localMatch.funcao) setFuncao(localMatch.funcao)
        if (localMatch.filial) {
          const f = localMatch.filial.toUpperCase()
          if (f.includes('SAPOPEMBA')) setGaragem('SAPOPEMBA')
          else if (f.includes('CURSINO')) setGaragem('CURSINO')
        }
        setResolvedEmployeeId(localMatch.id)
        return
      }
      // 2. Se não encontrou em memória, busca na coleção employees do PocketBase
      setSearchingEmployee(true)
      try {
        const safe = term.replace(/"/g, '\\"')
        // Consulta exata ou prefixo com zeros comuns em chapas (ex: 13 -> 000013)
        const padded6 = /^\d+$/.test(term) ? term.padStart(6, '0') : term
        const safePadded = padded6.replace(/"/g, '\\"')
        const records = await pb.collection<Employee>('employees').getList(1, 1, {
          filter: `chapa = "${safe}" || chapa = "${safePadded}" || registro = "${safe}" || registro = "${safePadded}" || chapa ~ "${safe}"`,
        })

        if (!isMounted) return
        if (records.items.length > 0) {
          const emp = records.items[0]
          if (emp.name) setNome(emp.name)
          if (emp.funcao) setFuncao(emp.funcao)
          if (emp.filial) {
            const f = emp.filial.toUpperCase()
            if (f.includes('SAPOPEMBA')) setGaragem('SAPOPEMBA')
            else if (f.includes('CURSINO')) setGaragem('CURSINO')
          }
          setResolvedEmployeeId(emp.id)
        }
      } catch (error) {
        console.error('Erro ao buscar colaborador por registro:', error)
      } finally {
        if (isMounted) setSearchingEmployee(false)
      }
    }, 300)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [matricula, open, employees])

  const selectedEmployee = useMemo(
    () =>
      employees.find(
        (employee) =>
          employee.id === resolvedEmployeeId ||
          employee.chapa === matricula.trim() ||
          employee.registro === matricula.trim() ||
          employee.name.toLowerCase() === nome.trim().toLowerCase(),
      ),
    [employees, matricula, nome, resolvedEmployeeId],
  )

  const canSubmit = matricula.trim() !== '' && nome.trim() !== '' && processo !== null && !saving

  const handleSubmit = async () => {
    if (!canSubmit) return

    // Se houver valor no campo prazo, valida se é uma data válida antes de submeter
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

    setSaving(true)
    try {
      await onSubmit({
        processo,
        matricula: matricula.trim(),
        nome: nome.trim(),
        funcao: funcao.trim(),
        etapa,
        prazo,
        // Em novo processo a situação é sempre gravada automaticamente como "Pendente"
        situacao: isEditing ? situacao : 'Pendente',
        garagem,
        alerta_trafego: alertaTrafego,
        employeeId: resolvedEmployeeId || selectedEmployee?.id,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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
                Novo processo
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Edite os dados cadastrais do processo selecionado.'
              : 'Cadastre manualmente uma movimentação de colaborador.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="modal-processo">Tipo de movimentação</Label>
              <Select value={processo} onValueChange={(value) => setProcesso(value as Categoria)}>
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

            <div className="space-y-2">
              <Label htmlFor="modal-garagem">Garagem</Label>
              <Select
                value={garagem}
                onValueChange={(val) => setGaragem(val as 'CURSINO' | 'SAPOPEMBA')}
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
            <div className="flex items-center justify-between">
              <Label htmlFor="modal-matricula">Registro / Chapa</Label>
              {searchingEmployee && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  Buscando colaborador…
                </span>
              )}
            </div>
            <Input
              id="modal-matricula"
              placeholder="Digite o registro ou chapa (ex: 000055)"
              value={matricula}
              onChange={(event) => setMatricula(event.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="modal-nome">Nome Completo</Label>
            <Input
              id="modal-nome"
              placeholder="Nome completo do colaborador"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="modal-funcao">Função</Label>
            <Input
              id="modal-funcao"
              placeholder="Função do colaborador"
              value={funcao}
              onChange={(event) => setFuncao(event.target.value)}
              autoComplete="off"
            />
          </div>

          {isEditing ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            </div>
          ) : (
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

          <div className="space-y-2">
            <Label htmlFor="modal-prazo">Prazo</Label>
            <Input
              id="modal-prazo"
              type="date"
              value={prazo}
              onChange={(event) => setPrazo(event.target.value)}
            />
          </div>

          {/* Marcação de ciência para o Tráfego (informativo) */}
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
              {saving ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Registrar processo'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
