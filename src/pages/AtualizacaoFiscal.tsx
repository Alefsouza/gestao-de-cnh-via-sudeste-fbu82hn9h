import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Building2,
  FileCheck2,
  Info,
  Loader2,
  Search,
  UserCheck,
  UserMinus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import StatusBadge from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { formatDate } from '@/lib/format'
import { listAllEmployees } from '@/services/employees'
import { createMovement } from '@/services/movements'
import { createNotification } from '@/services/notifications'
import type { Employee } from '@/lib/types'
import { cn } from '@/lib/utils'

type CnhStatus = {
  label: 'Vencida' | 'Sem CNH' | 'Válida'
  tone: 'gray' | 'green' | 'red'
  date?: string
}

function cnhStatus(employee: Employee): CnhStatus {
  const situacaoCnh = employee.situacao_cnh as string | ''
  if (!employee.cnh_numero || !situacaoCnh || situacaoCnh === 'Sem CNH') {
    return { label: 'Sem CNH', tone: 'gray' }
  }
  if (situacaoCnh === 'Vencida') {
    return { label: 'Vencida', tone: 'red', date: formatDate(employee.validade_cnh) }
  }
  return { label: 'Válida', tone: 'green', date: formatDate(employee.validade_cnh) }
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

export default function AtualizacaoFiscal() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cardFilter, setCardFilter] = useState<FiscalCardFilter>('todos')
  const [processoTarget, setProcessoTarget] = useState<Employee | null>(null)
  const [observacoes, setObservacoes] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await listAllEmployees()
      setEmployees(data)
    } catch {
      toast.error('Não foi possível carregar os fiscais')
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
    () =>
      employees.filter((employee) => {
        const funcao = employee.funcao?.trim().toLowerCase()
        return Boolean(funcao && funcao.includes('fiscal'))
      }),
    [employees],
  )

  const resumo = useMemo(
    () => ({
      total: fiscais.length,
      ativos: fiscais.filter((employee) => employee.situacao === 'Ativo').length,
      afastados: fiscais.filter((employee) => employee.situacao === 'Afastado').length,
    }),
    [fiscais],
  )

  const baseFiltered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return fiscais
    return fiscais.filter(
      (employee) =>
        employee.name.toLowerCase().includes(term) || employee.chapa.toLowerCase().includes(term),
    )
  }, [fiscais, search])

  const filtered = useMemo(() => {
    if (cardFilter === 'ativos') {
      return baseFiltered.filter((e) => e.situacao === 'Ativo')
    }
    if (cardFilter === 'afastados') {
      return baseFiltered.filter((e) => e.situacao === 'Afastado')
    }
    return baseFiltered
  }, [baseFiltered, cardFilter])

  const handleCardClick = (filter: FiscalCardFilter) => {
    if (filter === 'todos' || cardFilter === filter) {
      setCardFilter('todos')
    } else {
      setCardFilter(filter)
    }
  }

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
            value={resumo.total}
            icon={Users}
            tone="slate"
            active={cardFilter === 'todos'}
            onClick={() => handleCardClick('todos')}
          />
          <Counter
            label="Ativos"
            value={resumo.ativos}
            icon={UserCheck}
            tone="green"
            active={cardFilter === 'ativos'}
            onClick={() => handleCardClick('ativos')}
          />
          <Counter
            label="Afastados"
            value={resumo.afastados}
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

      {/* Tabela */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">
              Exibindo <span className="font-semibold text-foreground">{filtered.length}</span>{' '}
              fiscal(is) localizado(s) na matriz
            </p>
            {cardFilter !== 'todos' && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Filtrando por card: {cardFilter === 'ativos' ? 'Ativos' : 'Afastados'}
                </span>
                <button
                  type="button"
                  onClick={() => setCardFilter('todos')}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Limpar filtro de card
                </button>
              </div>
            )}
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome ou chapa…"
              className="h-10 w-full rounded-md border border-input bg-white pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
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
                {filtered.map((employee) => (
                  <tr
                    key={employee.id}
                    className="border-b transition-colors last:border-b-0 hover:bg-muted/40"
                  >
                    <td className="tabular-nums px-4 py-3 font-medium">{employee.chapa}</td>
                    <td className="px-4 py-3">
                      <span className="block font-medium">{employee.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {employee.cnh_numero?.trim()
                          ? `CNH: ${employee.cnh_numero.trim()}`
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
                {filtered.length === 0 && (
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
