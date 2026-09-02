import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileCheck2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import StatusBadge from '@/components/StatusBadge'
import { useRealtime } from '@/hooks/use-realtime'
import { daysUntil, formatDate } from '@/lib/format'
import { listAllEmployees, updateEmployee } from '@/services/employees'
import { createMovement } from '@/services/movements'
import type { Employee } from '@/lib/types'

function fiscalStatus(employee: Employee): 'Em dia' | 'A vencer' | 'Vencido' | null {
  const days = daysUntil(employee.validade_documento_fiscal)
  if (days === null) return null
  if (days < 0) return 'Vencido'
  if (days <= 30) return 'A vencer'
  return 'Em dia'
}

export default function AtualizacaoFiscal() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await listAllEmployees()
      setEmployees(data)
    } catch {
      toast.error('Não foi possível carregar os dados fiscais')
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

  const fiscais = useMemo(
    () => employees.filter((employee) => employee.funcao === 'Fiscal de Viajem'),
    [employees],
  )

  const handleUpdate = async (employee: Employee) => {
    if (updatingId) return
    setUpdatingId(employee.id)
    try {
      const current = employee.validade_documento_fiscal
        ? new Date(employee.validade_documento_fiscal)
        : new Date()
      const next = new Date(current)
      next.setFullYear(next.getFullYear() + 1)
      await updateEmployee(employee.id, { validade_documento_fiscal: next.toISOString() })
      await createMovement({
        employee: employee.id,
        type: 'Atualização fiscal',
        notes: 'Documento fiscal atualizado por mais 12 meses.',
      })
      toast.success('Documento marcado como atualizado')
      load()
    } catch {
      toast.error('Não foi possível atualizar o documento')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100">
          <FileCheck2 className="h-5 w-5 text-teal-700" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Atualização fiscal</h1>
          <p className="text-xs text-muted-foreground">{fiscais.length} fiscal(is) na base</p>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
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
                  <th className="px-4 py-3 font-semibold">Chapa</th>
                  <th className="px-4 py-3 font-semibold">Nome</th>
                  <th className="px-4 py-3 font-semibold">Filial/Garagem</th>
                  <th className="px-4 py-3 font-semibold">Documento</th>
                  <th className="px-4 py-3 font-semibold">Validade</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {fiscais.map((employee) => {
                  const status = fiscalStatus(employee)
                  return (
                    <tr
                      key={employee.id}
                      className="border-b transition-colors last:border-b-0 hover:bg-muted/40"
                    >
                      <td className="tabular-nums px-4 py-3 font-medium">{employee.chapa}</td>
                      <td className="px-4 py-3 font-medium">{employee.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{employee.filial || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {employee.documento_fiscal || '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(employee.validade_documento_fiscal)}
                      </td>
                      <td className="px-4 py-3">
                        {status ? (
                          <StatusBadge value={status} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={updatingId === employee.id}
                          onClick={() => handleUpdate(employee)}
                          className="rounded-md border border-primary/50 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 disabled:opacity-50"
                        >
                          {updatingId === employee.id ? 'Atualizando…' : 'Marcar como atualizado'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {fiscais.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhum fiscal encontrado.
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
