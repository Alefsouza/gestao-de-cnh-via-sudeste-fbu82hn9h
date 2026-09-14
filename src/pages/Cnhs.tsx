import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  CreditCard,
  FileDown,
  Loader2,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'

import NovaCartaModal from '@/components/NovaCartaModal'
import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { useRealtime } from '@/hooks/use-realtime'
import pb from '@/lib/pocketbase/client'
import { daysUntil, formatDate, formatCnh } from '@/lib/format'
import {
  CNH_VALIDA_FIELD_FILTER,
  getCnhsSummary,
  listDistinctFuncoes,
  listEmployees,
  listEmployeesControlled,
  type CnhsSummary,
  type EmployeeFilters,
} from '@/services/employees'
import { FILIAIS } from '@/lib/types'
import type { Employee, ProcessoCadastralRecord } from '@/lib/types'

const PAGE_SIZE = 15
const RELOAD_THROTTLE_MS = 5_000

type StatusFilter = 'todas' | 'Válida' | 'A vencer' | 'Vencida'
type SituacaoFilter = 'todos' | 'Ativo' | 'Afastado'
type SortField = 'validade' | 'dias'
type SortDirection = 'asc' | 'desc'

const TABS: { key: StatusFilter; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'Válida', label: 'Válidas' },
  { key: 'A vencer', label: 'Vence Hoje' },
  { key: 'Vencida', label: 'Vencidas' },
]

function daysLabel(days: number | null): string {
  if (days === null) return '—'
  if (days < 0) return `vencida há ${Math.abs(days)} d`
  if (days === 0) return 'vence hoje'
  return `${days} dias`
}

export default function Cnhs() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [tab, setTab] = useState<StatusFilter>('todas')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [garagem, setGaragem] = useState('')
  const [situacao, setSituacao] = useState<SituacaoFilter>('todos')
  const [funcao, setFuncao] = useState('')
  const [funcoesList, setFuncoesList] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [sortField, setSortField] = useState<SortField>('validade')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Mapa de processos cadastrais indexados por matrícula (chapa e registro)
  // para identificar situações como "Foto Bloqueada" ou "Impossibilitado de Trabalhar"
  const [processosMap, setProcessosMap] = useState<Map<string, ProcessoCadastralRecord>>(new Map())
  const [cartaModalEmployee, setCartaModalEmployee] = useState<Employee | null>(null)
  const [cartaModalOpen, setCartaModalOpen] = useState(false)

  const [counts, setCounts] = useState<Record<StatusFilter, number>>({
    todas: 0,
    Válida: 0,
    'A vencer': 0,
    Vencida: 0,
  })

  // Debounce do termo de busca digitado pelo usuário para evitar disparar consultas a cada tecla
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
    setPage(1)
  }

  const listRunId = useRef(0)
  const summaryRunId = useRef(0)
  const loadInProgress = useRef(false)
  const lastLoadedAt = useRef(0)

  // Carrega as opções distintas de funções para o dropdown de filtro
  useEffect(() => {
    let active = true
    void listDistinctFuncoes().then((list) => {
      if (active && Array.isArray(list)) {
        setFuncoesList(list)
      }
    })
    return () => {
      active = false
    }
  }, [])

  // Reseta a página para 1 quando os filtros mudam
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, tab, garagem, situacao, funcao])

  // Carrega os contadores dos cards e abas no backend de forma leve e pontual
  const loadSummary = useCallback(async () => {
    const runId = ++summaryRunId.current
    try {
      const res = await getCnhsSummary({
        search: debouncedSearch.trim(),
        filial: garagem || undefined,
        funcao: funcao || undefined,
        situacao: situacao === 'todos' ? undefined : situacao,
      })
      if (runId !== summaryRunId.current) return
      setCounts({
        todas: Number(res?.summary?.todas) || 0,
        Válida: Number(res?.summary?.valida) || 0,
        'A vencer': Number(res?.summary?.aVencer) || 0,
        Vencida: Number(res?.summary?.vencida) || 0,
      })
    } catch (err) {
      if (runId === summaryRunId.current) {
        console.error('Erro ao carregar contadores de CNH:', err)
      }
    }
  }, [debouncedSearch, garagem, funcao, situacao])

  // Filtros ativos para a consulta paginada
  const activeFilters = useMemo<EmployeeFilters>(() => {
    const customParts: string[] = [CNH_VALIDA_FIELD_FILTER]

    if (tab === 'Válida') {
      customParts.push('situacao_cnh = "Válida"')
    } else if (tab === 'A vencer') {
      customParts.push('situacao_cnh = "A vencer"')
    } else if (tab === 'Vencida') {
      customParts.push('situacao_cnh = "Vencida" || situacao_cnh = "Vencida CNH"')
    }

    // Ordenação no backend por validade_cnh quando sortField for validade ou dias
    const pbSort = sortDirection === 'asc' ? '+validade_cnh,chapa' : '-validade_cnh,chapa'

    return {
      search: debouncedSearch.trim() || undefined,
      filial: garagem || undefined,
      funcao: funcao || undefined,
      situacao: situacao === 'todos' ? undefined : situacao,
      customFilter: customParts.join(' && '),
      page,
      perPage: PAGE_SIZE,
      sort: pbSort,
    }
  }, [debouncedSearch, garagem, funcao, situacao, tab, page, sortDirection])

  // Busca apenas a página corrente do servidor
  const loadPage = useCallback(async () => {
    const runId = ++listRunId.current
    loadInProgress.current = true
    setLoading(true)
    try {
      const result = await listEmployees(activeFilters)
      if (runId !== listRunId.current) return

      setEmployees(Array.isArray(result?.items) ? result.items : [])
      setTotalItems(Number(result?.totalItems) || 0)
      setTotalPages(Math.max(1, Number(result?.totalPages) || 1))
    } catch (err) {
      if (runId !== listRunId.current) return
      console.error('Erro ao listar página de CNHs:', err)
      toast.error('Não foi possível carregar as CNHs')
    } finally {
      if (runId === listRunId.current) {
        loadInProgress.current = false
        lastLoadedAt.current = Date.now()
        setLoading(false)
      }
    }
  }, [activeFilters])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  // Carrega os contadores com debounce e espaçado após a requisição inicial da listagem da página
  // para eliminar a concorrência em rajada no PocketBase
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSummary()
    }, 400)
    return () => clearTimeout(timer)
  }, [loadSummary])

  // Carrega a lista de processos cadastrais para saber a situação atual de cada colaborador
  const loadProcessos = useCallback(async () => {
    try {
      const records = await pb
        .collection('processos_cadastrais')
        .getFullList<ProcessoCadastralRecord>({
          sort: '-updated',
        })
      const map = new Map<string, ProcessoCadastralRecord>()
      for (const proc of records) {
        const mat = String(proc.matricula || '').trim()
        const colab = String(proc.colaborador || '')
          .trim()
          .toLowerCase()
        if (mat && !map.has(mat)) map.set(mat, proc)
        const unpadded = mat.replace(/^0+/, '')
        if (unpadded && !map.has(unpadded)) map.set(unpadded, proc)
        if (colab && !map.has(colab)) map.set(colab, proc)
      }
      setProcessosMap(map)
    } catch (err) {
      console.warn('Erro ao carregar processos cadastrais em Cnhs:', err)
    }
  }, [])

  useEffect(() => {
    void loadProcessos()
  }, [loadProcessos])

  useRealtime('processos_cadastrais', () => {
    void loadProcessos()
  })

  // Recarregamento via realtime com throttle para evitar rajadas e erro 429
  const requestReload = useCallback(() => {
    if (loadInProgress.current) return
    if (Date.now() - lastLoadedAt.current < RELOAD_THROTTLE_MS) return
    void loadPage()
    void loadSummary()
    void loadProcessos()
  }, [loadPage, loadSummary, loadProcessos])

  useRealtime('employees', () => {
    requestReload()
  })

  // Função auxiliar para obter o processo cadastral correspondente a um colaborador
  const getProcessoForEmployee = useCallback(
    (emp: Employee | null | undefined): ProcessoCadastralRecord | undefined => {
      if (!emp || !processosMap) return undefined
      const chapa = String(emp.chapa || '').trim()
      const registro = String(emp.registro || '').trim()
      const nome = String(emp.name || '')
        .trim()
        .toLowerCase()

      if (chapa && processosMap.has(chapa)) return processosMap.get(chapa)
      const chapaUnpadded = chapa.replace(/^0+/, '')
      if (chapaUnpadded && processosMap.has(chapaUnpadded)) return processosMap.get(chapaUnpadded)
      if (registro && processosMap.has(registro)) return processosMap.get(registro)
      const regUnpadded = registro.replace(/^0+/, '')
      if (regUnpadded && processosMap.has(regUnpadded)) return processosMap.get(regUnpadded)
      if (nome && processosMap.has(nome)) return processosMap.get(nome)
      return undefined
    },
    [processosMap],
  )

  // Exportação para XLSX respeitando todos os filtros ativos no momento do clique,
  // com carregamento sequencial controlado e retry/backoff para não gerar rajadas de 429
  const exportXlsx = useCallback(async () => {
    if (totalItems === 0 || exporting) return
    setExporting(true)
    const toastId = toast.loading('Preparando dados para exportação…')
    try {
      const exportFilters: EmployeeFilters = {
        search: activeFilters.search,
        filial: activeFilters.filial,
        funcao: activeFilters.funcao,
        situacao: activeFilters.situacao,
        customFilter: activeFilters.customFilter,
        sort: activeFilters.sort,
      }

      const allData = await listEmployeesControlled(exportFilters, {
        batchSize: 200,
        pageDelayMs: 250,
        onProgress: (loaded, total) => {
          toast.loading(`Baixando CNHs para planilha (${loaded} de ${total})…`, { id: toastId })
        },
      })

      const rows = allData.map((employee) => {
        const days = daysUntil(employee.validade_cnh)
        return {
          REGISTRO: employee.chapa || employee.registro || '',
          Nome: employee.name || '',
          Função: employee.funcao || '',
          'Filial/Garagem': employee.filial || '',
          'Situação Funcionário': employee.situacao || '',
          CNH: formatCnh(employee.cnh_categoria, employee.cnh_numero),
          Categoria: employee.cnh_categoria || '',
          Validade: formatDate(employee.validade_cnh),
          'Dias para vencer': daysLabel(days),
          'Situação CNH': employee.situacao_cnh || '',
        }
      })

      const worksheet = XLSX.utils.json_to_sheet(rows)
      worksheet['!cols'] = [
        { wch: 14 }, // REGISTRO
        { wch: 32 }, // Nome
        { wch: 24 }, // Função
        { wch: 20 }, // Filial/Garagem
        { wch: 22 }, // Situação Funcionário
        { wch: 20 }, // CNH
        { wch: 12 }, // Categoria
        { wch: 16 }, // Validade
        { wch: 20 }, // Dias para vencer
        { wch: 16 }, // Situação CNH
      ]

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'CNHs')

      const dateStr = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(workbook, `cnhs-${dateStr}.xlsx`)
      toast.dismiss(toastId)
      toast.success(`Exportação concluída (${allData.length} registro(s))`)
    } catch (error) {
      console.error('Erro ao exportar CNHs para XLSX:', error)
      toast.dismiss(toastId)
      toast.error('Ocorreu um erro ao gerar o arquivo Excel.')
    } finally {
      setExporting(false)
    }
  }, [totalItems, exporting, activeFilters])

  const vencidasCount = counts['Vencida']

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">CNHs dos colaboradores</h1>
            <p className="text-xs text-muted-foreground">
              Controle de validade das CNHs cadastradas
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

      {vencidasCount > 0 && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setTab(tab === 'Vencida' ? 'todas' : 'Vencida')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setTab(tab === 'Vencida' ? 'todas' : 'Vencida')
            }
          }}
          className={`group flex cursor-pointer items-start justify-between gap-3 rounded-xl border p-4 transition-all ${
            tab === 'Vencida'
              ? 'border-red-500 bg-red-100/70 ring-2 ring-red-500/20'
              : 'border-red-200 bg-red-50 hover:bg-red-100/50 hover:shadow-sm'
          }`}
          title="Clique para filtrar apenas as CNHs vencidas"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-red-600" />
            <div>
              <p className="text-sm font-semibold text-red-800">
                {vencidasCount} {vencidasCount === 1 ? 'CNH vencida' : 'CNHs vencidas'}
              </p>
              <p className="text-xs text-red-700/80">
                Regularize a situação dos colaboradores com CNH fora da validade antes da próxima
                escala. Clique para filtrar a lista.
              </p>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${
              tab === 'Vencida'
                ? 'bg-red-600 text-white'
                : 'bg-red-200/80 text-red-800 group-hover:bg-red-200'
            }`}
          >
            {tab === 'Vencida' ? 'Filtro ativo' : 'Ver vencidas'}
          </span>
        </div>
      )}

      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  tab === item.key
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {item.label} ({counts[item.key]})
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, chapa ou CNH…"
                className="h-10 w-full min-w-[220px] rounded-md border border-input bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-64"
              />
            </div>
            <select
              value={funcao}
              onChange={(event) => setFuncao(event.target.value)}
              className="h-10 rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Função do colaborador"
            >
              <option value="">Todas as funções</option>
              {funcoesList.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={situacao}
              onChange={(event) => setSituacao(event.target.value as SituacaoFilter)}
              className="h-10 rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Situação do funcionário"
            >
              <option value="todos">Todas as situações</option>
              <option value="Ativo">Ativos</option>
              <option value="Afastado">Afastados</option>
              <option value="Desligado">Desligados</option>
            </select>
            <select
              value={garagem}
              onChange={(event) => setGaragem(event.target.value)}
              className="h-10 rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Filial ou garagem"
            >
              <option value="">Todas as garagens</option>
              {FILIAIS.filter((item) => item !== 'ITAQUERA').map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
          <span>
            Total de <strong className="text-foreground">{totalItems}</strong> CNH(s) encontrada(s)
          </span>
          {(search || garagem || funcao || situacao !== 'todos' || tab !== 'todas') && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setGaragem('')
                setFuncao('')
                setSituacao('todos')
                setTab('todas')
              }}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Limpar filtros
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
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">
                    REGISTRO
                    <br />
                  </th>
                  <th className="px-4 py-3 font-semibold">Nome</th>
                  <th className="px-4 py-3 font-semibold">Função</th>
                  <th className="px-4 py-3 font-semibold">Filial/Garagem</th>
                  <th className="px-4 py-3 font-semibold">Situação</th>
                  <th className="px-4 py-3 font-semibold">CNH</th>
                  <th className="px-4 py-3 font-semibold">Categoria</th>
                  <th className="px-4 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => handleSort('validade')}
                      className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1 py-0.5 -mx-1"
                      title="Ordenar por Validade"
                    >
                      <span>Validade</span>
                      {sortField === 'validade' ? (
                        sortDirection === 'asc' ? (
                          <ChevronUp className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-primary" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => handleSort('dias')}
                      className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1 py-0.5 -mx-1"
                      title="Ordenar por Dias para Vencer"
                    >
                      <span>Dias para vencer</span>
                      {sortField === 'dias' ? (
                        sortDirection === 'asc' ? (
                          <ChevronUp className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-primary" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold">Status CNH</th>
                  <th className="px-4 py-3 font-semibold text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => {
                  const days = daysUntil(employee?.validade_cnh)
                  const proc = getProcessoForEmployee(employee)
                  const procSit = proc?.situacao
                  // Condição do requisito: colaboradores com SITUAÇÃO "Foto Bloqueada" ou "Impossibilitado de Trabalhar"
                  // Verifica tanto na situação do processo cadastral vinculado quanto na situação do colaborador
                  const canEmitirCarta =
                    procSit === 'Foto Bloqueada' ||
                    procSit === 'Impossibilitado de Trabalhar' ||
                    employee?.situacao === ('Foto Bloqueada' as any) ||
                    employee?.situacao === ('Impossibilitado de Trabalhar' as any)

                  const empId = employee?.id || `emp-${employee?.chapa || Math.random()}`
                  const empChapa = employee?.chapa || employee?.registro || '—'
                  const empName = employee?.name || '—'
                  const empFuncao = employee?.funcao || '—'
                  const empFilial = employee?.filial || '—'

                  return (
                    <tr
                      key={empId}
                      className={`border-b transition-colors last:border-b-0 hover:bg-muted/40 ${
                        canEmitirCarta ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      <td className="tabular-nums px-4 py-3 font-medium">{empChapa}</td>
                      <td className="px-4 py-3 font-medium">
                        <div>{empName}</div>
                        {procSit && (
                          <div className="text-[11px] text-muted-foreground">
                            Processo:{' '}
                            <span
                              className={
                                procSit === 'Foto Bloqueada'
                                  ? 'font-semibold text-rose-700'
                                  : procSit === 'Impossibilitado de Trabalhar'
                                    ? 'font-semibold text-amber-700'
                                    : procSit === 'Regular'
                                      ? 'text-emerald-700'
                                      : 'text-muted-foreground'
                              }
                            >
                              {procSit}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{empFuncao}</td>
                      <td className="px-4 py-3 text-muted-foreground">{empFilial}</td>
                      <td className="px-4 py-3">
                        <StatusBadge value={employee?.situacao} />
                      </td>
                      <td className="tabular-nums px-4 py-3 font-medium">
                        {formatCnh(employee?.cnh_categoria, employee?.cnh_numero)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {employee?.cnh_categoria || '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(employee?.validade_cnh)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{daysLabel(days)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge value={employee?.situacao_cnh} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canEmitirCarta ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setCartaModalEmployee(employee)
                              setCartaModalOpen(true)
                            }}
                            className="inline-flex h-8 items-center gap-1.5 border-emerald-600 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900"
                            title={`Emitir carta de regularização para ${empName}`}
                          >
                            <CheckCircle className="h-4 w-4 text-emerald-600" />
                            <span>Carta</span>
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {employees.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhum registro encontrado.
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

      {/* Pop-up de Carta com upload dos 5 documentos obrigatórios */}
      <NovaCartaModal
        open={cartaModalOpen}
        onOpenChange={setCartaModalOpen}
        employee={cartaModalEmployee}
        processoSituacao={
          cartaModalEmployee ? getProcessoForEmployee(cartaModalEmployee)?.situacao : undefined
        }
        onSuccess={() => {
          void loadProcessos()
          void loadPage()
        }}
      />
    </div>
  )
}
