import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  CreditCard,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

import StatusBadge from '@/components/StatusBadge'
import { useRealtime } from '@/hooks/use-realtime'
import { daysUntil, formatDate } from '@/lib/format'
import { listAllEmployees } from '@/services/employees'
import { FILIAIS } from '@/lib/types'
import type { Employee } from '@/lib/types'

type StatusFilter = 'todas' | 'Válida' | 'A vencer' | 'Vencida'
type SortField = 'validade' | 'dias'
type SortDirection = 'asc' | 'desc'

const TABS: { key: StatusFilter; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'Válida', label: 'Válidas' },
  { key: 'A vencer', label: 'A vencer' },
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
  const [tab, setTab] = useState<StatusFilter>('todas')
  const [garagem, setGaragem] = useState('')
  const [sortField, setSortField] = useState<SortField>('validade')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const load = useCallback(async () => {
    try {
      const data = await listAllEmployees()
      setEmployees(data)
    } catch {
      toast.error('Não foi possível carregar as CNHs')
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

  const employeesWithCnh = useMemo(
    () =>
      employees.filter(
        (employee) =>
          Boolean(employee.cnh_numero && employee.cnh_numero.trim()) &&
          employee.situacao_cnh !== 'Sem CNH' &&
          employee.situacao_cnh !== '',
      ),
    [employees],
  )

  const counts = useMemo(() => {
    const byStatus = (status: StatusFilter) =>
      employeesWithCnh.filter((item) => item.situacao_cnh === status).length
    return {
      todas: employeesWithCnh.length,
      Válida: byStatus('Válida'),
      'A vencer': byStatus('A vencer'),
      Vencida: byStatus('Vencida'),
    } as Record<StatusFilter, number>
  }, [employeesWithCnh])

  const filtered = useMemo(
    () =>
      employeesWithCnh
        .filter((employee) => (tab === 'todas' ? true : employee.situacao_cnh === tab))
        .filter((employee) => (garagem ? employee.filial === garagem : true))
        .sort((a, b) => {
          if (sortField === 'validade') {
            const valA = a.validade_cnh
              ? new Date(a.validade_cnh).getTime()
              : sortDirection === 'asc'
                ? Infinity
                : -Infinity
            const valB = b.validade_cnh
              ? new Date(b.validade_cnh).getTime()
              : sortDirection === 'asc'
                ? Infinity
                : -Infinity
            const diff = valA - valB
            return sortDirection === 'asc' ? diff : -diff
          }

          if (sortField === 'dias') {
            const daysA = daysUntil(a.validade_cnh)
            const daysB = daysUntil(b.validade_cnh)
            const numA = daysA === null ? (sortDirection === 'asc' ? Infinity : -Infinity) : daysA
            const numB = daysB === null ? (sortDirection === 'asc' ? Infinity : -Infinity) : daysB
            const diff = numA - numB
            return sortDirection === 'asc' ? diff : -diff
          }

          return 0
        }),
    [employeesWithCnh, tab, garagem, sortField, sortDirection],
  )

  const vencidasCount = counts['Vencida']

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <CreditCard className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">CNHs dos colaboradores</h1>
          <p className="text-xs text-muted-foreground">Controle de validade das CNHs cadastradas</p>
        </div>
      </div>

      {vencidasCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-red-600" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              {vencidasCount} {vencidasCount === 1 ? 'CNH vencida' : 'CNHs vencidas'}
            </p>
            <p className="text-xs text-red-700/80">
              Regularize a situação dos colaboradores com CNH fora da validade antes da próxima
              escala.
            </p>
          </div>
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
          <select
            value={garagem}
            onChange={(event) => setGaragem(event.target.value)}
            className="h-10 rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Todas as garagens</option>
            {FILIAIS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
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
                  <th className="px-4 py-3 font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((employee) => {
                  const days = daysUntil(employee.validade_cnh)
                  return (
                    <tr
                      key={employee.id}
                      className="border-b transition-colors last:border-b-0 hover:bg-muted/40"
                    >
                      <td className="tabular-nums px-4 py-3 font-medium">{employee.chapa}</td>
                      <td className="px-4 py-3 font-medium">{employee.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{employee.funcao || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{employee.filial || '—'}</td>
                      <td className="tabular-nums px-4 py-3">{employee.cnh_numero || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {employee.cnh_categoria || '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(employee.validade_cnh)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{daysLabel(days)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge value={employee.situacao_cnh} />
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
