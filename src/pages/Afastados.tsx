import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Building2,
  CalendarX,
  CircleAlert,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Loader2,
  Search,
  UserMinus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'

import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { useRealtime } from '@/hooks/use-realtime'
import { formatDate, formatCnh } from '@/lib/format'
import {
  getAfastadosSummary,
  listEmployees,
  listEmployeesControlled,
  type AfastadosSummary,
  type EmployeeFilters,
} from '@/services/employees'
import type { Employee } from '@/lib/types'
import { cn } from '@/lib/utils'
import { comparable, isCnhVencida, normalizeEmployees } from '@/lib/normalize'

const inputClass =
  'h-10 rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

const PAGE_SIZE = 15
const RELOAD_THROTTLE_MS = 2500

type AfastadosCardFilter = 'todos' | 'cursino' | 'sapopemba'
type CnhFilter = 'todos' | 'Vencida' | 'Regular' | 'Sem CNH'

/** Resumo colorido exibido acima da tabela e clicável como filtro. */
function SummaryCard({
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
  tone: 'green' | 'orange' | 'red' | 'slate'
  active?: boolean
  onClick?: () => void
}) {
  const tones = {
    green: {
      bg: 'bg-green-100',
      text: 'text-green-700',
      ring: 'border-green-200',
      activeRing: 'border-green-500 ring-2 ring-green-500/20 bg-green-50/50',
    },
    orange: {
      bg: 'bg-orange-100',
      text: 'text-orange-700',
      ring: 'border-orange-200',
      activeRing: 'border-orange-500 ring-2 ring-orange-500/20 bg-orange-50/50',
    },
    red: {
      bg: 'bg-red-100',
      text: 'text-red-700',
      ring: 'border-red-200',
      activeRing: 'border-red-500 ring-2 ring-red-500/20 bg-red-50/50',
    },
    slate: {
      bg: 'bg-primary/10',
      text: 'text-primary',
      ring: 'border-border',
      activeRing: 'border-primary ring-2 ring-primary/20 bg-primary/[0.04]',
    },
  }[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border bg-white p-4 text-left shadow-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:shadow-md cursor-pointer',
        tones.ring,
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

type CnhStatus = {
  label: 'Vencida' | 'Regular' | 'Sem CNH'
  tone: 'gray' | 'green' | 'red'
  date?: string
}

function cnhStatus(employee: Employee): CnhStatus {
  const hasCnh = Boolean(employee.cnh_numero && employee.cnh_numero.trim())
  const situacaoRaw = (employee.situacao_cnh ?? '').trim()
  const comp = comparable(situacaoRaw)

  if (!hasCnh || !situacaoRaw || comp === 'sem cnh') {
    return { label: 'Sem CNH', tone: 'gray' }
  }
  if (comp === 'vencida' || comp === 'vencida cnh' || isCnhVencida(employee)) {
    return { label: 'Vencida', tone: 'red', date: formatDate(employee.validade_cnh) }
  }
  return { label: 'Regular', tone: 'green', date: formatDate(employee.validade_cnh) }
}

function CnhBadge({ status }: { status: CnhStatus }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
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

export default function Afastados() {
  const [employees, setEmployees] = useState<Employee[]>([])

  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [empresa, setEmpresa] = useState('VIA SUDESTE')
  const [cnhFilter, setCnhFilter] = useState<CnhFilter>('todos')
  const [cardFilter, setCardFilter] = useState<AfastadosCardFilter>('todos')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)

  const [summary, setSummary] = useState<AfastadosSummary>({
    total: 0,
    cursino: 0,
    sapopemba: 0,
    outros: 0,
  })

  const listRunId = useRef(0)
  const summaryRunId = useRef(0)
  const loadInProgress = useRef(false)
  const lastLoadedAt = useRef(0)

  // Debounce de 300ms na busca para não gerar rajadas de consultas ao backend
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Reseta para a página 1 ao alterar filtros
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, empresa, cnhFilter, cardFilter])

  // Carrega contadores agregados diretamente do backend com debounce e espaçamento
  const loadSummary = useCallback(async () => {
    const runId = ++summaryRunId.current
    try {
      const res = await getAfastadosSummary({
        search: debouncedSearch.trim() || undefined,
        empresa: empresa.trim() || undefined,
      })
      if (runId !== summaryRunId.current) return
      setSummary(res.summary)
    } catch (err) {
      if (runId === summaryRunId.current) {
        console.error('Erro ao carregar contadores de afastados:', err)
      }
    }
  }, [debouncedSearch, empresa])

  // Filtros ativos para a consulta paginada no servidor
  const activeFilters = useMemo<EmployeeFilters>(() => {
    const customParts: string[] = ["situacao = 'Afastado'"]

    if (empresa.trim()) {
      customParts.push(`company = "${empresa.trim().replace(/"/g, '\\"')}"`)
    }

    if (cardFilter === 'cursino') {
      customParts.push("(filial = 'CURSINO' || filial = 'cursino')")
    } else if (cardFilter === 'sapopemba') {
      customParts.push("(filial = 'SAPOPEMBA' || filial = 'sapopemba')")
    }
    if (cnhFilter === 'Vencida') {
      customParts.push(
        '(situacao_cnh = "Vencida" || situacao_cnh = "Vencida CNH" || (cnh_numero != "" && situacao_cnh != "Sem CNH" && validade_cnh != "" && validade_cnh < @now))',
      )
    } else if (cnhFilter === 'Regular') {
      customParts.push(
        'cnh_numero != "" && (situacao_cnh = "Válida" || situacao_cnh = "A vencer" || (situacao_cnh != "Sem CNH" && situacao_cnh != "Vencida" && situacao_cnh != "Vencida CNH" && (validade_cnh = "" || validade_cnh >= @now)))',
      )
    } else if (cnhFilter === 'Sem CNH') {
      customParts.push('(cnh_numero = "" || situacao_cnh = "Sem CNH" || situacao_cnh = "")')
    }

    return {
      search: debouncedSearch.trim() || undefined,
      customFilter: customParts.join(' && '),
      page,
      perPage: PAGE_SIZE,
      sort: 'chapa',
    }
  }, [debouncedSearch, empresa, cnhFilter, cardFilter, page])

  // Busca apenas a página corrente do servidor
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
      console.error('Erro ao listar página de afastados:', err)
      toast.error('Não foi possível carregar a lista de afastados')
    } finally {
      if (runId === listRunId.current) {
        loadInProgress.current = false
        lastLoadedAt.current = Date.now()
        setLoading(false)
      }
    }
  }, [activeFilters])

  // Disparo da listagem paginada
  useEffect(() => {
    void loadPage()
  }, [loadPage])

  // Disparo dos contadores com debounce para evitar concorrência com loadPage
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSummary()
    }, 250)
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

  const handleCardClick = (filter: AfastadosCardFilter) => {
    if (filter === 'todos' || cardFilter === filter) {
      setCardFilter('todos')
    } else {
      setCardFilter(filter)
    }
  }

  const clearFilters = () => {
    setSearch('')
    setEmpresa('VIA SUDESTE')
    setCnhFilter('todos')
    setCardFilter('todos')
  }

  // Exportação com carregamento em lotes sequenciais, pausa entre páginas e retry para evitar 429
  const exportXlsx = async () => {
    if (totalItems === 0 || exporting) {
      toast.error('Nenhum colaborador afastado para exportar.')
      return
    }

    setExporting(true)
    const toastId = toast.loading('Preparando planilha de afastados…')
    try {
      const exportFilters: EmployeeFilters = {
        search: activeFilters.search,
        customFilter: activeFilters.customFilter,
        sort: 'chapa',
      }

      const allData = await listEmployeesControlled(exportFilters, {
        batchSize: 200,
        pageDelayMs: 250,
        onProgress: (loaded, total) => {
          toast.loading(`Baixando afastados para planilha (${loaded} de ${total})…`, {
            id: toastId,
          })
        },
      })
      const normalized = normalizeEmployees(allData)

      const rows = normalized.map((employee) => {
        const status = cnhStatus(employee)
        const inicio = formatDate(employee.inicio_afastamento || employee.data_afastamento)
        const termino = formatDate(
          employee.termino_afastamento ||
            employee.previsao_retorno ||
            employee.data_retorno_afastamento,
        )
        return {
          Chapa: employee.chapa,
          Registro: employee.registro || employee.chapa,
          Nome: employee.name,
          Empresa: employee.company || 'VIA SUDESTE',
          'Filial/Garagem': employee.filial || '',
          'Função Atual': employee.funcao || '',
          'Função Anterior': employee.funcao_anterior || '',
          Situação: employee.situacao || '',
          'Início Afastamento': inicio,
          'Término Afastamento': termino,
          'Motivo do Afastamento': employee.motivo_afastamento || '',
          CNH: status.label,
          'Validade CNH': status.date ?? '',
        }
      })

      const worksheet = XLSX.utils.json_to_sheet(rows)
      worksheet['!cols'] = [
        { wch: 12 }, // Chapa
        { wch: 12 }, // Registro
        { wch: 32 }, // Nome
        { wch: 20 }, // Empresa
        { wch: 18 }, // Filial/Garagem
        { wch: 22 }, // Função Atual
        { wch: 22 }, // Função Anterior
        { wch: 16 }, // Situação
        { wch: 18 }, // Início Afastamento
        { wch: 18 }, // Término Afastamento
        { wch: 28 }, // Motivo do Afastamento
        { wch: 14 }, // CNH
        { wch: 16 }, // Validade CNH
      ]

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Afastados')

      const dateStr = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(workbook, `afastados-${dateStr}.xlsx`)
      toast.dismiss(toastId)
      toast.success(`Exportação concluída (${rows.length} registro(s))`)
    } catch (error) {
      console.error('Erro ao exportar afastados para XLSX:', error)
      toast.dismiss(toastId)
      toast.error('Ocorreu um erro ao gerar o arquivo Excel.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
          <UserMinus className="h-5 w-5 text-amber-700" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Afastados</h1>
          <p className="text-xs text-muted-foreground">
            Colaboradores afastados e a divisão por garagem
          </p>
        </div>
      </div>

      {/* Resumo clicável */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryCard
          label="Total de Afastados"
          value={summary.total}
          icon={Users}
          tone="slate"
          active={cardFilter === 'todos'}
          onClick={() => handleCardClick('todos')}
        />
        <SummaryCard
          label="Afastados da Cursino"
          value={summary.cursino}
          icon={Building2}
          tone="orange"
          active={cardFilter === 'cursino'}
          onClick={() => handleCardClick('cursino')}
        />
        <SummaryCard
          label="Afastados da Sapopemba"
          value={summary.sapopemba}
          icon={CircleAlert}
          tone="red"
          active={cardFilter === 'sapopemba'}
          onClick={() => handleCardClick('sapopemba')}
        />
      </div>

      {/* Filtros */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome ou chapa…"
              className="h-10 w-full rounded-md border border-input bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <select
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            className={inputClass}
          >
            <option value="VIA SUDESTE">VIA SUDESTE</option>
            <option value="">Todas as empresas</option>
          </select>
          <select
            value={cnhFilter}
            onChange={(e) => setCnhFilter(e.target.value as CnhFilter)}
            className={inputClass}
          >
            <option value="todos">Todos os status da CNH</option>
            <option value="Vencida">Vencida</option>
            <option value="Regular">Regular</option>
            <option value="Sem CNH">Sem CNH</option>
          </select>
        </div>
        {(search ||
          (empresa && empresa !== 'VIA SUDESTE') ||
          cnhFilter !== 'todos' ||
          cardFilter !== 'todos') && (
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {cardFilter !== 'todos' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
                  Filtrando por card:{' '}
                  {cardFilter === 'cursino' ? 'Afastados da Cursino' : 'Afastados da Sapopemba'}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Limpar todos os filtros
            </button>
          </div>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Exibindo <span className="font-semibold text-foreground">{totalItems}</span> afastado(s)
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={exportXlsx}
            disabled={totalItems === 0 || exporting}
          >
            {exporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exportando…
              </>
            ) : (
              <>
                <FileDown className="mr-2 h-4 w-4" />
                Exportar .xlsx
              </>
            )}
          </Button>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando…
            </div>
          ) : (
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Chapa</th>
                  <th className="px-4 py-3 font-semibold">Nome</th>
                  <th className="px-4 py-3 font-semibold">Filial/Garagem</th>
                  <th className="px-4 py-3 font-semibold">Função Atual</th>
                  <th className="px-4 py-3 font-semibold">Função Anterior</th>
                  <th className="px-4 py-3 font-semibold">Início Afastamento</th>
                  <th className="px-4 py-3 font-semibold">Término Afastamento</th>
                  <th className="px-4 py-3 font-semibold">Motivo</th>
                  <th className="px-4 py-3 font-semibold">CNH</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => {
                  const inicio = formatDate(
                    employee.inicio_afastamento || employee.data_afastamento,
                  )
                  const termino = formatDate(
                    employee.termino_afastamento ||
                      employee.previsao_retorno ||
                      employee.data_retorno_afastamento,
                  )
                  return (
                    <tr
                      key={employee.id}
                      className="border-b transition-colors last:border-b-0 hover:bg-muted/40"
                    >
                      <td className="tabular-nums px-4 py-3 font-medium">{employee.chapa}</td>
                      <td className="px-4 py-3">
                        <span className="block font-medium">{employee.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {employee.company || 'VIA SUDESTE'}
                          {employee.cnh_numero?.trim()
                            ? ` • CNH: ${formatCnh(employee.cnh_categoria, employee.cnh_numero)}`
                            : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{employee.filial || '—'}</td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {employee.funcao || '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {employee.funcao_anterior ? (
                          <span className="inline-block rounded bg-muted/60 px-2 py-0.5 text-xs font-medium text-foreground">
                            {employee.funcao_anterior}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="tabular-nums px-4 py-3 text-muted-foreground">
                        {inicio || '—'}
                      </td>
                      <td className="tabular-nums px-4 py-3 text-muted-foreground">
                        {termino || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {employee.motivo_afastamento ? (
                          <span
                            className="inline-block max-w-[200px] truncate rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 border border-amber-200"
                            title={employee.motivo_afastamento}
                          >
                            {employee.motivo_afastamento}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <CnhBadge status={cnhStatus(employee)} />
                      </td>
                    </tr>
                  )
                })}
                {employees.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhum colaborador afastado encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
            <span>
              Página {page} de {totalPages} ({totalItems} registros)
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarX className="h-3.5 w-3.5" />
        Datas de validade da CNH exibidas conforme o cadastro atualizado no Globus.
      </p>
    </div>
  )
}
