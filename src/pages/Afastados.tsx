import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, UserMinus } from 'lucide-react'
import { toast } from 'sonner'

import StatusBadge from '@/components/StatusBadge'
import { useRealtime } from '@/hooks/use-realtime'
import { formatDate } from '@/lib/format'
import { listAllEmployees, updateEmployee } from '@/services/employees'
import { createMovement } from '@/services/movements'
import { createNotification } from '@/services/notifications'
import type { Employee } from '@/lib/types'

export default function Afastados() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<Employee | null>(null)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await listAllEmployees()
      setEmployees(data)
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

  const afastados = useMemo(
    () => employees.filter((employee) => employee.situacao === 'Afastado'),
    [employees],
  )

  const confirmReturn = async () => {
    if (!pending) return
    setConfirming(true)
    try {
      await updateEmployee(pending.id, { situacao: 'Ativo' })
      await createMovement({
        employee: pending.id,
        type: 'Retorno',
        notes: `Retorno registrado — ${pending.motivo_afastamento || 'afastamento encerrado'}.`,
      })
      await createNotification({
        title: 'Retorno registrado',
        message: `${pending.name} (${pending.chapa}) retornou ao quadro de ativos.`,
        type: 'success',
      })
      toast.success('Retorno registrado com sucesso')
      setPending(null)
      load()
    } catch {
      toast.error('Não foi possível registrar o retorno')
    } finally {
      setConfirming(false)
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
            {afastados.length} colaborador(es) afastado(s)
          </p>
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
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Chapa</th>
                  <th className="px-4 py-3 font-semibold">Nome</th>
                  <th className="px-4 py-3 font-semibold">Filial/Garagem</th>
                  <th className="px-4 py-3 font-semibold">Função</th>
                  <th className="px-4 py-3 font-semibold">Motivo</th>
                  <th className="px-4 py-3 font-semibold">Início</th>
                  <th className="px-4 py-3 font-semibold">Previsão de retorno</th>
                  <th className="px-4 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {afastados.map((employee) => (
                  <tr
                    key={employee.id}
                    className="border-b transition-colors last:border-b-0 hover:bg-muted/40"
                  >
                    <td className="tabular-nums px-4 py-3 font-medium">{employee.chapa}</td>
                    <td className="px-4 py-3 font-medium">{employee.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{employee.filial || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{employee.funcao || '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={employee.situacao} className="mb-1" />
                      <span className="block text-xs text-muted-foreground">
                        {employee.motivo_afastamento || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(employee.inicio_afastamento)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(employee.previsao_retorno)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setPending(employee)}
                        className="rounded-md border border-primary/50 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
                      >
                        Registrar retorno
                      </button>
                    </td>
                  </tr>
                ))}
                {afastados.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhum colaborador afastado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !confirming && setPending(null)}
          />
          <div className="relative w-full max-w-sm rounded-xl border bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-foreground">Registrar retorno</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Confirmar o retorno de{' '}
              <span className="font-medium text-foreground">{pending.name}</span> (chapa{' '}
              {pending.chapa}) à situação <span className="font-medium text-foreground">Ativo</span>
              ?
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={confirming}
                onClick={() => setPending(null)}
                className="rounded-md border px-4 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={confirming}
                onClick={confirmReturn}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {confirming ? 'Confirmando…' : 'Confirmar retorno'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
