import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Building2,
  CalendarX,
  CircleAlert,
  FileDown,
  Loader2,
  Search,
  UserMinus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { useRealtime } from '@/hooks/use-realtime'
import { formatDate, formatCnh } from '@/lib/format'
import { listAllEmployees } from '@/services/employees'
import { FILIAIS, SITUACOES } from '@/lib/types'
import type { Employee } from '@/lib/types'
import { cn } from '@/lib/utils'
import { comparable, normalizeEmployees } from '@/lib/normalize'

const inputClass =
  'h-10 rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

type AfastadosCardFilter = 'todos' | 'principal' | 'outras'

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
  const situacaoCnh = employee.situacao_cnh as string | ''
  if (!employee.cnh_numero || !situacaoCnh || situacaoCnh === 'Sem CNH') {
    return { label: 'Sem CNH', tone: 'gray' }
  }
  if (situacaoCnh === 'Vencida' || situacaoCnh === 'Vencida CNH') {
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

const PRINCIPAL_COMPANY = 'Via Sudeste Transportes'

export default function Afastados() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [filial, setFilial] = useState('')
  const [situacao, setSituacao] = useState('')
  const [cardFilter, setCardFilter] = useState<AfastadosCardFilter>('todos')

  const load = useCallback(async () => {
    try {
      const data = await listAllEmployees()
      setEmployees(normalizeEmployees(data))
    } catch {
      toast.error('Não foi possível carregar os afastados')
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

  const afastados = useMemo(
    () => employees.filter((employee) => comparable(employee.situacao) === 'afastado'),
    [employees],
  )

  // Base filtrada pelos seletores do formulário
  const baseFiltered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const situacaoComp = comparable(situacao)
    return afastados.filter((employee) => {
      if (
        term &&
        !employee.name.toLowerCase().includes(term) &&
        !employee.chapa.toLowerCase().includes(term)
      ) {
        return false
      }
      if (empresa && employee.company !== empresa) return false
      if (filial && employee.filial !== filial) return false
      if (situacao && comparable(employee.situacao) !== situacaoComp) return false
      return true
    })
  }, [afastados, search, empresa, filial, situacao])

  const summary = useMemo(() => {
    const principal = baseFiltered.filter(
      (e) => e.company === PRINCIPAL_COMPANY && e.filial === 'CURSINO',
    ).length
    const outras = baseFiltered.length - principal
    return { principal, outras, total: baseFiltered.length }
  }, [baseFiltered])

  // Lista final exibida na tabela (combinando filtros do formulário + clique no card)
  const filtered = useMemo(() => {
    if (cardFilter === 'principal') {
      return baseFiltered.filter((e) => e.company === PRINCIPAL_COMPANY && e.filial === 'CURSINO')
    }
    if (cardFilter === 'outras') {
      return baseFiltered.filter(
        (e) => !(e.company === PRINCIPAL_COMPANY && e.filial === 'CURSINO'),
      )
    }
    return baseFiltered
  }, [baseFiltered, cardFilter])

  const handleCardClick = (filter: AfastadosCardFilter) => {
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
    setSituacao('')
    setCardFilter('todos')
  }

  const exportCsv = () => {
    const header = [
      'Chapa',
      'Nome',
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
    link.download = `afastados-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success(`Consulta exportada (${filtered.length} registro(s))`)
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
          label="Afastados na empresa principal com filial específica"
          value={summary.principal}
          icon={Building2}
          tone="orange"
          active={cardFilter === 'principal'}
          onClick={() => handleCardClick('principal')}
        />
        <SummaryCard
          label="Afastados em outras empresas com outras filiais"
          value={summary.outras}
          icon={CircleAlert}
          tone="red"
          active={cardFilter === 'outras'}
          onClick={() => handleCardClick('outras')}
        />
        <SummaryCard
          label="Total de afastados"
          value={summary.total}
          icon={Users}
          tone="slate"
          active={cardFilter === 'todos'}
          onClick={() => handleCardClick('todos')}
        />
      </div>

      {/* Filtros */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
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
        {(search || empresa || filial || situacao || cardFilter !== 'todos') && (
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {cardFilter !== 'todos' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary">
                  Filtrando por card:{' '}
                  {cardFilter === 'principal'
                    ? 'Empresa principal / CURSINO'
                    : 'Outras empresas / filiais'}
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
            Exibindo <span className="font-semibold text-foreground">{filtered.length}</span>{' '}
            afastado(s)
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
                  <th className="px-4 py-3 font-semibold">Chapa</th>
                  <th className="px-4 py-3 font-semibold">Nome</th>
                  <th className="px-4 py-3 font-semibold">Empresa</th>
                  <th className="px-4 py-3 font-semibold">Filial/Garagem</th>
                  <th className="px-4 py-3 font-semibold">Função</th>
                  <th className="px-4 py-3 font-semibold">Situação</th>
                  <th className="px-4 py-3 font-semibold">CNH</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((employee) => (
                  <tr
                    key={employee.id}
                    className="border-b transition-colors last:border-b-0 hover:bg-muted/40"
                  >
                    <td className="tabular-nums px-4 py-3 font-medium">{employee.chapa}</td>
                    <td className="px-4 py-3">
                      <span className="block font-medium">{employee.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        Registro: {formatCnh(employee.cnh_categoria, employee.cnh_numero)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{employee.company || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{employee.filial || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{employee.funcao || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge value={employee.situacao} />
                        <span className="text-xs text-muted-foreground">
                          {employee.motivo_afastamento || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <CnhBadge status={cnhStatus(employee)} />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhum colaborador afastado encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarX className="h-3.5 w-3.5" />
        Datas de validade da CNH exibidas conforme o cadastro atualizado na matriz de funcionários.
      </p>
    </div>
  )
}
