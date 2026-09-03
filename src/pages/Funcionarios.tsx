import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarX,
  Eye,
  FileDown,
  Loader2,
  Search,
  UserCheck,
  UserMinus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import StatusBadge from '@/components/StatusBadge'
import NovaMovimentacaoModal from '@/components/NovaMovimentacaoModal'
import { Button } from '@/components/ui/button'
import { useRealtime } from '@/hooks/use-realtime'
import { formatDate } from '@/lib/format'
import { listAllEmployees } from '@/services/employees'
import { listMovementsByEmployee } from '@/services/movements'
import { FILIAIS, SITUACOES } from '@/lib/types'
import type { Employee, Movement } from '@/lib/types'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 10

const inputClass =
  'h-10 rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

type SummaryCardFilter = 'todos' | 'ativos' | 'afastados' | 'cnh_vencida'

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
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
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
  label: 'Sem CNH' | 'Regular' | 'Vencida'
  tone: 'gray' | 'green' | 'red'
  date?: string
}

function cnhStatus(employee: Employee): CnhStatus {
  if (!employee.cnh_numero || !employee.situacao_cnh) {
    return { label: 'Sem CNH', tone: 'gray' }
  }
  if (employee.situacao_cnh === 'Vencida') {
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

export default function Funcionarios() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [filial, setFilial] = useState('')
  const [funcao, setFuncao] = useState('')
  const [situacao, setSituacao] = useState('')
  const [cardFilter, setCardFilter] = useState<SummaryCardFilter>('todos')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Employee | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [movementsLoading, setMovementsLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await listAllEmployees()
      setEmployees(data)
    } catch {
      toast.error('Não foi possível carregar a matriz de funcionários')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useRealtime('employees', () => {
    load()
  })

  const empresas = useMemo(
    () => Array.from(new Set(employees.map((e) => e.company).filter(Boolean))).sort(),
    [employees],
  )

  const funcoes = useMemo(
    () =>
      Array.from(new Set(employees.map((e) => (e.funcao ?? '').trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, 'pt-BR'),
      ),
    [employees],
  )

  // Lista base filtrada pelos seletores e busca (sem o cardFilter)
  const baseFiltered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return employees.filter((employee) => {
      if (
        term &&
        !employee.name.toLowerCase().includes(term) &&
        !employee.chapa.toLowerCase().includes(term) &&
        !(employee.cnh_numero ?? '').toLowerCase().includes(term) &&
        !employee.funcao.toLowerCase().includes(term)
      ) {
        return false
      }
      if (empresa && employee.company !== empresa) return false
      if (filial && employee.filial !== filial) return false
      if (funcao && employee.funcao !== funcao) return false
      if (situacao && employee.situacao !== situacao) return false
      return true
    })
  }, [employees, search, empresa, filial, funcao, situacao])

  // Contagens dos cards baseadas no universo filtrado pelos controles
  const summary = useMemo(() => {
    const ativos = baseFiltered.filter((e) => e.situacao === 'Ativo').length
    const afastados = baseFiltered.filter((e) => e.situacao === 'Afastado').length
    const cnhVencida = baseFiltered.filter((e) => e.situacao_cnh === 'Vencida').length
    return { total: baseFiltered.length, ativos, afastados, cnhVencida }
  }, [baseFiltered])

  // Lista final exibida na tabela (combinando baseFiltered + cardFilter)
  const filtered = useMemo(() => {
    if (cardFilter === 'ativos') {
      return baseFiltered.filter((e) => e.situacao === 'Ativo')
    }
    if (cardFilter === 'afastados') {
      return baseFiltered.filter((e) => e.situacao === 'Afastado')
    }
    if (cardFilter === 'cnh_vencida') {
      return baseFiltered.filter((e) => e.situacao_cnh === 'Vencida')
    }
    return baseFiltered
  }, [baseFiltered, cardFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [search, empresa, filial, funcao, situacao, cardFilter])

  const openDetail = async (employee: Employee) => {
    setSelected(employee)
    setMovements([])
    setMovementsLoading(true)
    try {
      const history = await listMovementsByEmployee(employee.id)
      setMovements(history)
    } catch {
      toast.error('Não foi possível carregar o histórico de movimentações')
    } finally {
      setMovementsLoading(false)
    }
  }

  const handleCardClick = (filter: SummaryCardFilter) => {
    // Se clicar em 'todos' ou clicar no mesmo filtro já selecionado, desativa
    if (filter === 'todos' || cardFilter === filter) {
      setCardFilter('todos')
    } else {
      setCardFilter(filter)
    }
  }

  const clearFilters = () => {
    setSearch('')
    setEmpresa('')
    setFilial('')
    setFuncao('')
    setSituacao('')
    setCardFilter('todos')
  }

  const exportCsv = () => {
    const header = [
      'Chapa',
      'Nome',
      'Registro CNH',
      'Empresa',
      'Filial/Garagem',
      'Função',
      'Situação',
      'CNH',
      'Validade CNH',
    ]
    const escape = (value: string) => `"${(value ?? '').replace(/"/g, '""')}"`
    const rows = filtered.map((employee) => {
      const status = cnhStatus(employee)
      return [
        employee.chapa,
        employee.name,
        employee.cnh_numero || '',
        employee.company || '',
        employee.filial || '',
        employee.funcao || '',
        employee.situacao || '',
        status.label,
        status.date ?? '',
      ]
        .map(escape)
        .join(';')
    })
    const csv = '\uFEFF' + [header.map(escape).join(';'), ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `matriz-funcionarios-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success(`Consulta exportada (${filtered.length} registro(s))`)
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Matriz de funcionários</h1>
            <p className="text-xs text-muted-foreground">
              Listagem completa dos colaboradores da empresa
            </p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="relative md:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, chapa, registro ou função…"
              className="h-10 w-full rounded-md border border-input bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <select
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            className={inputClass}
          >
            <option value="">Todas as empresas</option>
            {empresas.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={filial} onChange={(e) => setFilial(e.target.value)} className={inputClass}>
            <option value="">Todas as filiais</option>
            {FILIAIS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select value={funcao} onChange={(e) => setFuncao(e.target.value)} className={inputClass}>
            <option value="">Todas as funções</option>
            {funcoes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={situacao}
            onChange={(e) => setSituacao(e.target.value)}
            className={inputClass}
          >
            <option value="">Todas as situações</option>
            {SITUACOES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        {(search || empresa || filial || funcao || situacao || cardFilter !== 'todos') && (
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {cardFilter !== 'todos' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
                  Filtrando por card:{' '}
                  {cardFilter === 'ativos'
                    ? 'Ativos'
                    : cardFilter === 'afastados'
                      ? 'Afastados'
                      : 'CNHs vencidas'}
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

      {/* Resumo clicável */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          label="Total de colaboradores"
          value={summary.total}
          icon={Users}
          tone="slate"
          active={cardFilter === 'todos'}
          onClick={() => handleCardClick('todos')}
        />
        <SummaryCard
          label="Ativos"
          value={summary.ativos}
          icon={UserCheck}
          tone="green"
          active={cardFilter === 'ativos'}
          onClick={() => handleCardClick('ativos')}
        />
        <SummaryCard
          label="Afastados"
          value={summary.afastados}
          icon={UserMinus}
          tone="orange"
          active={cardFilter === 'afastados'}
          onClick={() => handleCardClick('afastados')}
        />
        <SummaryCard
          label="CNHs vencidas (motoristas)"
          value={summary.cnhVencida}
          icon={CalendarX}
          tone="red"
          active={cardFilter === 'cnh_vencida'}
          onClick={() => handleCardClick('cnh_vencida')}
        />
      </div>

      {/* Tabela */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Exibindo <span className="font-semibold text-foreground">{filtered.length}</span>{' '}
            colaborador(es)
          </p>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <FileDown className="mr-2 h-4 w-4" />
            Exportar consulta
          </Button>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando…
            </div>
          ) : (
            <table className="w-full min-w-[900px] text-left text-sm">
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
                {pageItems.map((employee) => (
                  <tr
                    key={employee.id}
                    className="border-b transition-colors last:border-b-0 hover:bg-muted/40"
                  >
                    <td className="tabular-nums px-4 py-3 font-medium">{employee.chapa}</td>
                    <td className="px-4 py-3">
                      <span className="block font-medium">{employee.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {employee.cnh_numero ? `CNH: ${employee.cnh_numero}` : 'Sem CNH'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{employee.company || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{employee.filial || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{employee.funcao || '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={employee.situacao} />
                    </td>
                    <td className="px-4 py-3">
                      <CnhBadge status={cnhStatus(employee)} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openDetail(employee)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title="Ver detalhes"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {pageItems.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhum funcionário encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
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

      {/* Drawer de detalhes */}
      {selected && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <p className="text-base font-bold text-foreground">{selected.name}</p>
                <p className="text-xs text-muted-foreground">
                  Chapa {selected.chapa} · {selected.funcao || '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
              >
                Fechar
              </button>
            </div>

            <div className="space-y-6 p-5">
              <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Dados pessoais</h3>
                <dl className="space-y-1.5 rounded-lg border bg-muted/20 p-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Empresa</dt>
                    <dd className="text-right font-medium">{selected.company || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Filial/Garagem</dt>
                    <dd className="text-right font-medium">{selected.filial || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Situação</dt>
                    <dd>
                      <StatusBadge value={selected.situacao} />
                    </dd>
                  </div>
                </dl>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">CNH</h3>
                <dl className="space-y-1.5 rounded-lg border bg-muted/20 p-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Número</dt>
                    <dd className="tabular-nums text-right font-medium">
                      {selected.cnh_numero || '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Categoria</dt>
                    <dd className="text-right font-medium">{selected.cnh_categoria || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Validade</dt>
                    <dd className="text-right font-medium">{formatDate(selected.validade_cnh)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>
                      <CnhBadge status={cnhStatus(selected)} />
                    </dd>
                  </div>
                </dl>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">
                  Histórico de movimentações
                </h3>
                {movementsLoading ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando histórico…
                  </div>
                ) : movements.length === 0 ? (
                  <p className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                    Nenhuma movimentação registrada.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {movements.map((movement) => (
                      <li key={movement.id} className="rounded-lg border bg-muted/20 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{movement.type}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(movement.date)}
                          </span>
                        </div>
                        {movement.notes && (
                          <p className="mt-1 text-xs text-muted-foreground">{movement.notes}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </aside>
        </div>
      )}

      <NovaMovimentacaoModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  )
}
