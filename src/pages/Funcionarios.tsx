import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, Loader2, Search, Users } from 'lucide-react'
import { toast } from 'sonner'

import StatusBadge from '@/components/StatusBadge'
import { useRealtime } from '@/hooks/use-realtime'
import { formatDate } from '@/lib/format'
import { listAllEmployees, updateEmployee } from '@/services/employees'
import { listMovementsByEmployee } from '@/services/movements'
import { FILIAIS, FUNCOES, SITUACOES } from '@/lib/types'
import type { Employee, Movement } from '@/lib/types'

const PAGE_SIZE = 10

export default function Funcionarios() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filial, setFilial] = useState('')
  const [funcao, setFuncao] = useState('')
  const [situacao, setSituacao] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Employee | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [movementsLoading, setMovementsLoading] = useState(false)

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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return employees.filter((employee) => {
      if (
        term &&
        !employee.name.toLowerCase().includes(term) &&
        !employee.chapa.toLowerCase().includes(term)
      ) {
        return false
      }
      if (filial && employee.filial !== filial) return false
      if (funcao && employee.funcao !== funcao) return false
      if (situacao && employee.situacao !== situacao) return false
      return true
    })
  }, [employees, search, filial, funcao, situacao])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [search, filial, funcao, situacao])

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

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Matriz de funcionários</h1>
          <p className="text-xs text-muted-foreground">
            {filtered.length} colaborador(es) encontrados
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome ou chapa…"
              className="h-10 w-full rounded-md border border-input bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <select
            value={filial}
            onChange={(event) => setFilial(event.target.value)}
            className="h-10 rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Todas as filiais</option>
            {FILIAIS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={funcao}
            onChange={(event) => setFuncao(event.target.value)}
            className="h-10 rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Todas as funções</option>
            {FUNCOES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={situacao}
            onChange={(event) => setSituacao(event.target.value)}
            className="h-10 rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Todas as situações</option>
            {SITUACOES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando…
            </div>
          ) : (
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Chapa</th>
                  <th className="px-4 py-3 font-semibold">Nome</th>
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
                    <td className="px-4 py-3 font-medium">{employee.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{employee.filial || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{employee.funcao || '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={employee.situacao} />
                    </td>
                    <td className="px-4 py-3">
                      {employee.situacao_cnh ? (
                        <StatusBadge value={employee.situacao_cnh} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
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
                      {selected.situacao_cnh ? <StatusBadge value={selected.situacao_cnh} /> : '—'}
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
    </div>
  )
}
