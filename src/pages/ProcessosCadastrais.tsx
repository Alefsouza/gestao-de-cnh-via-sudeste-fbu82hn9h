import { useCallback, useEffect, useMemo, useState } from 'react'
import { FolderKanban, Loader2, Plus } from 'lucide-react'

import NovaMovimentacaoModal from '@/components/NovaMovimentacaoModal'
import { useRealtime } from '@/hooks/use-realtime'
import { formatDate } from '@/lib/format'
import { listMovementsByType } from '@/services/movements'
import { MOVEMENT_STAGES } from '@/lib/types'
import type { Movement } from '@/lib/types'
import { cn } from '@/lib/utils'

const STEPS = MOVEMENT_STAGES

export default function ProcessosCadastrais() {
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await listMovementsByType('Admissão')
      setMovements(data)
    } catch {
      // silencioso
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useRealtime('movements', () => {
    load()
  })

  const processos = useMemo(
    () =>
      movements
        .filter((movement) => movement.expand?.employee)
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [movements],
  )

  const stepIndex = (stage: string) => {
    const index = STEPS.indexOf(stage as (typeof STEPS)[number])
    return index === -1 ? 0 : index
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FolderKanban className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Processos Cadastrais</h1>
            <p className="text-xs text-muted-foreground">
              {processos.length} processo(s) de admissão
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Novo processo
        </button>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border bg-white py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : (
          processos.map((processo) => {
            const employee = processo.expand?.employee
            const current = stepIndex(processo.stage || '')
            return (
              <div key={processo.id} className="rounded-xl border bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {employee?.name ?? 'Colaborador'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Chapa {employee?.chapa ?? '—'} · {employee?.filial || '—'} · iniciado em{' '}
                      {formatDate(processo.date)}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                    {processo.stage || 'Documentação'}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-1.5">
                  {STEPS.map((step, index) => (
                    <div key={step} className="flex flex-1 flex-col gap-1.5">
                      <div
                        className={cn(
                          'h-1.5 rounded-full transition-colors',
                          index <= current ? 'bg-primary' : 'bg-muted',
                        )}
                      />
                      <span
                        className={cn(
                          'text-[11px] font-medium',
                          index <= current ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {step}
                      </span>
                    </div>
                  ))}
                </div>

                {processo.notes && (
                  <p className="mt-3 text-xs text-muted-foreground">{processo.notes}</p>
                )}
              </div>
            )
          })
        )}
        {!loading && processos.length === 0 && (
          <div className="rounded-xl border bg-white p-10 text-center text-sm text-muted-foreground">
            Nenhum processo de admissão encontrado.
          </div>
        )}
      </div>

      <NovaMovimentacaoModal open={modalOpen} onOpenChange={setModalOpen} defaultType="Admissão" />
    </div>
  )
}
