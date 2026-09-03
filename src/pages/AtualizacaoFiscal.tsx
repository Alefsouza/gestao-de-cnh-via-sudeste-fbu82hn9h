import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Building2,
  FileCheck2,
  FileDown,
  Info,
  Loader2,
  Search,
  UserCheck,
  UserMinus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'

import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useRealtime } from '@/hooks/use-realtime'
import { daysUntil, formatDate, formatCnh } from '@/lib/format'
import {
  getFiscaisSummary,
  listAllEmployees,
  listEmployees,
  type EmployeeFilters,
  type FiscaisSummary,
} from '@/services/employees'
import { createMovement } from '@/services/movements'
import { createNotification } from '@/services/notifications'
import { FILIAIS, type Employee } from '@/lib/types'
import { cn } from '@/lib/utils'
import { normalizeEmployees } from '@/lib/normalize'

type CnhStatusCategory = 'Vencida' | 'A vencer' | 'Válida' | 'Sem CNH'

type CnhStatus = {
  label: CnhStatusCategory
  tone: 'gray' | 'green' | 'red' | 'amber'
  date?: string
}

/**
 * Classifica a CNH de um colaborador nas categorias reais da base:
 * - Sem CNH: sem número ou situacao_cnh explicitamente 'Sem CNH'
 * - Vencida: situacao_cnh 'Vencida' / 'Vencida CNH' ou dias até validade < 0
 * - A vencer: situacao_cnh 'A vencer' ou validade entre 0 e 30 dias
 * - Válida: demais casos com CNH cadastrada e válida
 */
function getCnhCategory(employee: Employee): CnhStatusCategory {
  const hasNumero = Boolean(employee.cnh_numero && employee.cnh_numero.trim())
  const situacaoRaw = (employee.situacao_cnh ?? '').trim()

  if (!hasNumero || situacaoRaw === 'Sem CNH' || !situacaoRaw) {
    return 'Sem CNH'
  }

  const situacaoNorm = situacaoRaw.toLowerCase()
  if (situacaoNorm === 'vencida' || situacaoNorm === 'vencida cnh') {
    return 'Vencida'
  }
  if (situacaoNorm === 'a vencer') {
    return 'A vencer'
  }

  const days = daysUntil(employee.validade_cnh)
  if (days !== null) {
    if (days < 0) return 'Vencida'
    if (days <= 30) return 'A vencer'
  }

  return 'Válida'
}

function cnhStatus(employee: Employee): CnhStatus {
  const category = getCnhCategory(employee)
  if (category === 'Sem CNH') {
    return { label: 'Sem CNH', tone: 'gray' }
  }
  if (category === 'Vencida') {
    return { label: 'Vencida', tone: 'red', date: formatDate(employee.validade_cnh) }
  }
  if (category === 'A vencer') {
    return { label: 'A vencer', tone: 'amber', date: formatDate(employee.validade_cnh) }
  }
  return { label: 'Válida', tone: 'green', date: formatDate(employee.validade_cnh) }
}

function CnhBadge({ status }: { status: CnhStatus }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-800',
  }[status.tone]
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
          tones,
        )}
      >
        {status.label}
      </span>
      {status.date && (
        <span className="text-[11px] text-muted-foreground">Val.: {status.date}</span>
      )}
    </div>
  )
}

type FiscalCardFilter = 'todos' | 'ativos' | 'afastados'

/** Contador do banner de abertura com suporte a clique para filtrar a lista. */
function Counter({
  label,
  value,
  icon: Icon,
  tone,
  active,
  onClick,
}: {
  label: string
  value: number
  icon: typeof Users
  tone: 'green' | 'orange' | 'slate'
  active?: boolean
  onClick?: () => void
}) {
  const tones = {
    green: {
      bg: 'bg-green-100',
      text: 'text-green-700',
      activeRing: 'border-green-500 ring-2 ring-green-500/20 bg-green-50/60',
    },
    orange: {
      bg: 'bg-orange-100',
      text: 'text-orange-700',
      activeRing: 'border-orange-500 ring-2 ring-orange-500/20 bg-orange-50/60',
    },
    slate: {
      bg: 'bg-primary/10',
      text: 'text-primary',
      activeRing: 'border-primary ring-2 ring-primary/20 bg-primary/[0.04]',
    },
  }[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border bg-muted/30 p-4 text-left shadow-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:shadow-md cursor-pointer hover:bg-white',
        active && tones.activeRing,
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105',
          tones.bg,
        )}
      >
        <Icon className={cn('h-5 w-5', tones.text)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="tabular-nums text-2xl font-bold leading-none text-foreground">{value}</p>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">{label}</p>
      </div>
      {active && (
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
          Ativo
        </span>
      )}
    </button>
  )
}

const PAGE_SIZE = 15
const RELOAD_THROTTLE_MS = 5_000

export default function AtualizacaoFiscal() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [garagem, setGaragem] = useState('')
  const [cnhStatusFilter, setCnhStatusFilter] = useState<
    'todos' | 'Vencida' | 'A vencer' | 'Válida'
  >('todos')
  const [cardFilter, setCardFilter] = useState<FiscalCardFilter>('todos')
  const [processoTarget, setProcessoTarget] = useState<Employee | null>(null)
  const [observacoes, setObservacoes] = useState('')
  const [saving, setSaving] = useState(false)

  const [summary, setSummary] = useState<FiscaisSummary>({
    total: 0,
    ativos: 0,
    afastados: 0,
  })

  // Guardas de concorrência e throttle para evitar rajada e erro 429
  const listRunId = useRef(0)
  const summaryRunId = useRef(0)
  const loadInProgress = useRef(false)
  const lastLoadedAt = useRef(0)

  // Debounce da busca textual
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Volta à primeira página ao alterar qualquer filtro
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, garagem, cnhStatusFilter, cardFilter])

  // Lista de garagens disponíveis para filtro
  const garagens = useMemo(() => FILIAIS.filter((f) => f !== 'ITAQUERA'), [])

  // Monta a expressão de filtro para a categoria de CNH no servidor
  const cnhCustomFilter = useMemo(() => {
    if (cnhStatusFilter === 'Vencida') {
      return '(situacao_cnh = "Vencida" || situacao_cnh = "Vencida CNH" || (cnh_numero != "" && situacao_cnh != "Sem CNH" && validade_cnh != "" && validade_cnh < @now))'
    }
    if (cnhStatusFilter === 'A vencer') {
      return '(situacao_cnh = "A vencer" || (cnh_numero != "" && situacao_cnh != "Sem CNH" && validade_cnh != "" && validade_cnh >= @now && validade_cnh <= @now + 2592000))'
    }
    if (cnhStatusFilter === 'Válida') {
      return '(cnh_numero != "" && situacao_cnh != "Sem CNH" && situacao_cnh != "Vencida" && situacao_cnh != "Vencida CNH" && situacao_cnh != "A vencer" && (validade_cnh = "" || validade_cnh > @now + 2592000))'
    }
    return undefined
  }, [cnhStatusFilter])

  // Filtros ativos para a consulta paginada da tabela
  const activeFilters = useMemo<EmployeeFilters>(() => {
    const customParts: string[] = ['funcao ~ "fiscal"']
    if (cnhCustomFilter) {
      customParts.push(cnhCustomFilter)
    }

    const filters: EmployeeFilters = {
      search: debouncedSearch.trim() || undefined,
      filial: garagem || undefined,
      customFilter: customParts.join(' && '),
      page,
      perPage: PAGE_SIZE,
      sort: 'chapa',
    }

    if (cardFilter === 'ativos') {
      filters.situacao = 'Ativo'
    } else if (cardFilter === 'afastados') {
      filters.situacao = 'Afastado'
    }

    return filters
  }, [debouncedSearch, garagem, cnhCustomFilter, cardFilter, page])

  // Carrega os contadores dos cards no backend
  const loadSummary = useCallback(async () => {
    const runId = ++summaryRunId.current
    try {
      const res = await getFiscaisSummary({
        search: debouncedSearch.trim(),
        filial: garagem || undefined,
        cnhCategoryFilter: cnhStatusFilter,
      })
      if (runId !== summaryRunId.current) return
      setSummary(res.summary)
    } catch (err) {
      if (runId === summaryRunId.current) {
        console.error('Erro ao carregar contadores de fiscais:', err)
      }
    }
  }, [debouncedSearch, garagem, cnhStatusFilter])

  // Busca a página atual de fiscais do servidor
  const loadPage = useCallback(async () => {
    const runId = ++listRunId.current
    loadInProgress.current = true
    setLoading(true)
    try {
      const result = await listEmployees(activeFilters)
      if (runId !== listRunId.current) return

      setEmployees(normalizeEmployees(result.items))
      setTotalItems(result.totalItems)
      setTotalPages(Math.max(1, result.totalPages))
    } catch (err) {
      if (runId !== listRunId.current) return
      console.error('Erro ao listar página de fiscais:', err)
      toast.error('Não foi possível carregar os fiscais')
    } finally {
      if (runId === listRunId.current) {
        loadInProgress.current = false
        lastLoadedAt.current = Date.now()
        setLoading(false)
      }
    }
  }, [activeFilters])

  // Executa a listagem da página
  useEffect(() => {
    void loadPage()
  }, [loadPage])

  // Executa os contadores com debounce e espaçamento de 300ms para evitar rajadas simultâneas
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSummary()
    }, 300)
    return () => clearTimeout(timer)
  }, [loadSummary])

  // Throttled reload para eventos em tempo real
  const requestReload = useCallback(() => {
    if (loadInProgress.current) return
    if (Date.now() - lastLoadedAt.current < RELOAD_THROTTLE_MS) return
    void loadPage()
    void loadSummary()
  }, [loadPage, loadSummary])

  useRealtime('employees', () => {
    requestReload()
  })

  const handleCardClick = (filter: FiscalCardFilter) => {
    if (filter === 'todos' || cardFilter === filter) {
      setCardFilter('todos')
    } else {
      setCardFilter(filter)
    }
  }

  const clearFilters = () => {
    setSearch('')
    setGaragem('')
    setCnhStatusFilter('todos')
    setCardFilter('todos')
  }

  const hasActiveFilters = Boolean(
    search || garagem || cnhStatusFilter !== 'todos' || cardFilter !== 'todos',
  )

  const exportXlsx = useCallback(async () => {
    if (totalItems === 0 || exporting) {
      toast.error('Nenhum fiscal para exportar.')
      return
    }

    setExporting(true)
    const toastId = toast.loading('Gerando arquivo da consulta…')
    try {
      const exportFilters: EmployeeFilters = {
        search: activeFilters.search,
        filial: activeFilters.filial,
        situacao: activeFilters.situacao,
        customFilter: activeFilters.customFilter,
        sort: 'chapa',
      }
      const allData = await listAllEmployees(exportFilters)
      const normalized = normalizeEmployees(allData)

      const rows = normalized.map((employee) => {
        const cnhInfo = cnhStatus(employee)
        return {
          REGISTRO: employee.chapa,
          Nome: employee.name,
          Empresa: employee.company || '',
          'Filial/Garagem': employee.filial || '',
          Função: 'Fiscal',
          Situação: employee.situacao || '',
          CNH: employee.cnh_numero?.trim()
            ? formatCnh(employee.cnh_categoria, employee.cnh_numero)
            : 'Sem CNH',
          'Status CNH': cnhInfo.label,
          'Validade CNH': cnhInfo.date || '',
        }
      })

      const worksheet = XLSX.utils.json_to_sheet(rows)
      worksheet['!cols'] = [
        { wch: 14 }, // REGISTRO
        { wch: 32 }, // Nome
        { wch: 20 }, // Empresa
        { wch: 20 }, // Filial/Garagem
        { wch: 16 }, // Função
        { wch: 16 }, // Situação
        { wch: 20 }, // CNH
        { wch: 16 }, // Status CNH
        { wch: 16 }, // Validade CNH
      ]

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Atualização Fiscal')

      const dateStr = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(workbook, `fiscais-${dateStr}.xlsx`)
      toast.dismiss(toastId)
      toast.success(`Exportação concluída (${rows.length} registro(s))`)
    } catch (error) {
      console.error('Erro ao exportar fiscais para XLSX:', error)
      toast.dismiss(toastId)
      toast.error('Ocorreu um erro ao gerar o arquivo Excel.')
    } finally {
      setExporting(false)
    }
  }, [totalItems, exporting, activeFilters])

  const handleAbrirProcesso = async () => {
    if (!processoTarget) return
    setSaving(true)
    try {
      await createMovement({
        employee: processoTarget.id,
        type: 'Atualização fiscal',
        stage: 'Documentação',
        notes:
          observacoes.trim() ||
          'Processo de atualização cadastral do fiscal aberto pela tela Atualização fiscal.',
      })
      await createNotification({
        title: 'Atualização cadastral',
        message: `Processo de atualização aberto para ${processoTarget.name} (${processoTarget.chapa}).`,
        type: 'info',
      })
      toast.success(`Processo aberto para ${processoTarget.name}`)
      setProcessoTarget(null)
      setObservacoes('')
    } catch {
      toast.error('Não foi possível abrir o processo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100">
            <FileCheck2 className="h-5 w-5 text-teal-700" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Atualização fiscal</h1>
            <p className="text-xs text-muted-foreground">
              Fiscais localizados na matriz e seus processos de atualização
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="default"
            onClick={() => void exportXlsx()}
            disabled={totalItems === 0 || exporting}
            className="inline-flex h-10 items-center gap-2"
          >
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Exportando…
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4" />
                Exportar .xlsx
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Banner com contadores */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-8 w-1 rounded-full bg-primary" />
          <div>
            <h2 className="text-base font-bold text-foreground">
              Atualização cadastral dos fiscais
            </h2>
            <p className="text-xs text-muted-foreground">
              Panorama dos fiscais da matriz por situação
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Counter
            label="Total na matriz"
            value={summary.total}
            icon={Users}
            tone="slate"
            active={cardFilter === 'todos'}
            onClick={() => handleCardClick('todos')}
          />
          <Counter
            label="Ativos"
            value={summary.ativos}
            icon={UserCheck}
            tone="green"
            active={cardFilter === 'ativos'}
            onClick={() => handleCardClick('ativos')}
          />
          <Counter
            label="Afastados"
            value={summary.afastados}
            icon={UserMinus}
            tone="orange"
            active={cardFilter === 'afastados'}
            onClick={() => handleCardClick('afastados')}
          />
        </div>
      </div>

      {/* Aviso informativo */}
      <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
        <div className="space-y-1 text-sm text-teal-900">
          <p>Os fiscais agora entram no mesmo controle de documentos, prazos e conclusão</p>
          <p>Abra a atualização diretamente na linha do colaborador</p>
        </div>
      </div>

      {/* Filtros e Tabela */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        {/* Barra de Filtros */}
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome ou chapa…"
              className="h-10 w-full rounded-md border border-input bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <select
            value={garagem}
            onChange={(e) => setGaragem(e.target.value)}
            className="h-10 rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Todas as garagens</option>
            {garagens.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <select
            value={cnhStatusFilter}
            onChange={(e) =>
              setCnhStatusFilter(e.target.value as 'todos' | 'Vencida' | 'A vencer' | 'Válida')
            }
            className="h-10 rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="todos">Todos os status da CNH</option>
            <option value="Vencida">Vencida</option>
            <option value="A vencer">A vencer</option>
            <option value="Válida">Válida</option>
          </select>
        </div>

        {/* Linha de status e contagem de exibição */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">
              Exibindo <span className="font-semibold text-foreground">{totalItems}</span>{' '}
              fiscal(is) localizado(s) na matriz
            </p>
            {cardFilter !== 'todos' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                Filtrando por card: {cardFilter === 'ativos' ? 'Ativos' : 'Afastados'}
              </span>
            )}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Limpar todos os filtros
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando…
            </div>
          ) : (
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">REGISTRO</th>
                  <th className="px-4 py-3 font-semibold">Nome</th>
                  <th className="px-4 py-3 font-semibold">Empresa</th>
                  <th className="px-4 py-3 font-semibold">Filial/Garagem</th>
                  <th className="px-4 py-3 font-semibold">Função</th>
                  <th className="px-4 py-3 font-semibold">Situação</th>
                  <th className="px-4 py-3 font-semibold">CNH</th>
                  <th className="px-4 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr
                    key={employee.id}
                    className="border-b transition-colors last:border-b-0 hover:bg-muted/40"
                  >
                    <td className="tabular-nums px-4 py-3 font-medium">{employee.chapa}</td>
                    <td className="px-4 py-3">
                      <span className="block font-medium">{employee.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {employee.cnh_numero?.trim()
                          ? `CNH: ${formatCnh(employee.cnh_categoria, employee.cnh_numero)}`
                          : 'Sem CNH'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{employee.company || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Building2 className="h-3.5 w-3.5" />
                          {employee.filial || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Fiscal
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={employee.situacao} />
                    </td>
                    <td className="px-4 py-3">
                      <CnhBadge status={cnhStatus(employee)} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setProcessoTarget(employee)
                          setObservacoes('')
                        }}
                        className="rounded-md border border-primary/50 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
                      >
                        Abrir processo
                      </button>
                    </td>
                  </tr>
                ))}
                {employees.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhum fiscal encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t p-4 text-sm">
            <span className="text-muted-foreground">
              Página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de abertura de processo */}
      <Dialog
        open={processoTarget !== null}
        onOpenChange={(open) => {
          if (!open) setProcessoTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-primary" />
              Abrir processo de atualização
            </DialogTitle>
            <DialogDescription>
              Registre a abertura do processo de atualização cadastral deste fiscal.
            </DialogDescription>
          </DialogHeader>

          {processoTarget && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="font-medium">{processoTarget.name}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · Chapa {processoTarget.chapa} · {processoTarget.filial || '—'}
                </span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="observacoes-fiscal">Observações</Label>
                <Textarea
                  id="observacoes-fiscal"
                  placeholder="Detalhes do processo (opcional)"
                  rows={3}
                  value={observacoes}
                  onChange={(event) => setObservacoes(event.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setProcessoTarget(null)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleAbrirProcesso} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Abrindo…
                </>
              ) : (
                'Abrir processo'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
