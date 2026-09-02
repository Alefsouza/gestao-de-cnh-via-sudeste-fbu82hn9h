import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileCheck2,
  Loader2,
  MapPin,
  RefreshCw,
  Sparkles,
  UserMinus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import StatCard from '@/components/StatCard'
import StatusBadge from '@/components/StatusBadge'
import { useRealtime } from '@/hooks/use-realtime'
import { formatDate, relativeDayLabel } from '@/lib/format'
import { listAllEmployees } from '@/services/employees'
import type { Employee } from '@/lib/types'

const GARAGENS = ['CURSINO', 'SAPOPEMBA'] as const

/** Cores das barras por garagem (gradiente escuro -> claro). */
const BAR_STYLES: Record<(typeof GARAGENS)[number], string> = {
  CURSINO: 'bg-gradient-to-r from-[#14532D] to-[#16A34A]',
  SAPOPEMBA: 'bg-gradient-to-r from-[#8FA398] to-[#B9C7BE]',
}

/** Percentual ilustrativo fixo por garagem, conforme especificação. */
const BAR_PERCENT: Record<(typeof GARAGENS)[number], number> = {
  CURSINO: 57,
  SAPOPEMBA: 43,
}

function DistribuitionBar({
  garagem,
  total,
  percent,
  delay,
}: {
  garagem: (typeof GARAGENS)[number]
  total: number
  percent: number
  delay: number
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-foreground">{garagem}</p>
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{total}</span> colaboradores · {percent}%
        </p>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#E5E7EB]">
        <div
          className={`h-full rounded-full transition-all duration-[600ms] ease-out ${BAR_STYLES[garagem]}`}
          style={{ width: mounted ? `${percent}%` : '0%' }}
        />
      </div>
    </div>
  )
}

export default function VisaoGeral() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)

  const load = async () => {
    try {
      const data = await listAllEmployees()
      setEmployees(data)
    } catch {
      toast.error('Não foi possível carregar os dados da matriz')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useRealtime('employees', () => {
    load()
  })

  const stats = useMemo(() => {
    const ativos = employees.filter((employee) => employee.situacao === 'Ativo').length
    const afastados = employees.filter((employee) => employee.situacao === 'Afastado').length
    const vencidas = employees.filter((employee) => employee.situacao_cnh === 'Vencida').length
    const fiscais = employees.filter((employee) => employee.funcao === 'Fiscal de Viajem').length
    const porGaragem = Object.fromEntries(
      GARAGENS.map((garagem) => [
        garagem,
        employees.filter((employee) => employee.filial === garagem).length,
      ]),
    ) as Record<(typeof GARAGENS)[number], number>
    return { ativos, afastados, vencidas, fiscais, porGaragem }
  }, [employees])

  const vencidasList = useMemo(
    () =>
      employees
        .filter((employee) => employee.situacao_cnh === 'Vencida')
        .sort((a, b) => (a.validade_cnh ?? '').localeCompare(b.validade_cnh ?? ''))
        .slice(0, 5),
    [employees],
  )

  const handleSync = () => {
    if (syncing) return
    setSyncing(true)
    setTimeout(() => {
      setSyncing(false)
      setLastSync(new Date().toISOString())
      toast.success('Matriz atualizada com sucesso')
    }, 2000)
  }

  const totalGaragem = stats.porGaragem.CURSINO + stats.porGaragem.SAPOPEMBA

  return (
    <div className="mx-auto max-w-7xl">
      <div className="grid grid-cols-1 items-start gap-6 min-[1200px]:grid-cols-[minmax(0,1fr)_340px]">
        {/* Coluna principal */}
        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Colaboradores ativos"
              value={312}
              icon={Users}
              tone="green"
              trend="up"
              caption="+8 neste mês"
              delay={0}
            />
            <StatCard
              label="Colaboradores afastados"
              value={18}
              icon={UserMinus}
              tone="amber"
              trend="down"
              caption="6 por saúde ocupacional"
              delay={80}
            />
            <StatCard
              label="CNHs vencidas de motoristas"
              value={9}
              icon={CreditCard}
              tone="red"
              trend="down"
              caption="3 vencem em 30 dias"
              delay={160}
            />
            <StatCard
              label="Fiscais na base"
              value={24}
              icon={FileCheck2}
              tone="teal"
              trend="up"
              caption="100% com documentos em dia"
              delay={240}
            />
          </div>

          <section
            className="animate-fade-up rounded-xl border bg-white shadow-sm"
            style={{ animationDelay: '120ms' }}
          >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-foreground">CNHs vencidas de motoristas</h2>
                <p className="text-xs text-muted-foreground">Motoristas com CNH fora da validade</p>
              </div>
              <Link
                to="/cnhs"
                className="flex items-center gap-1 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
              >
                Ver todas
                <ChevronRight className="h-4 w-4" />
              </Link>
            </header>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando…
                </div>
              ) : (
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-5 py-3 font-semibold">Chapa</th>
                      <th className="px-5 py-3 font-semibold">Nome</th>
                      <th className="px-5 py-3 font-semibold">Empresa</th>
                      <th className="px-5 py-3 font-semibold">Filial/Garagem</th>
                      <th className="px-5 py-3 font-semibold">Função</th>
                      <th className="px-5 py-3 font-semibold">Situação</th>
                      <th className="px-5 py-3 font-semibold">CNH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vencidasList.map((employee, index) => (
                      <tr
                        key={employee.id}
                        className={`border-b transition-colors last:border-b-0 hover:bg-muted/40 ${
                          index % 2 === 1 ? 'bg-muted/20' : ''
                        }`}
                      >
                        <td className="tabular-nums px-5 py-3.5 font-medium text-foreground">
                          {employee.chapa}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-foreground">{employee.name}</td>
                        <td className="px-5 py-3.5 text-muted-foreground">
                          {employee.company || '—'}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">
                          {employee.filial || '—'}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">
                          {employee.funcao || '—'}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge value={employee.situacao_cnh} />
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="tabular-nums block font-medium text-foreground">
                            {employee.cnh_numero || '—'}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            Val. {formatDate(employee.validade_cnh)}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {vencidasList.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                          Nenhuma CNH vencida encontrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        {/* Painel lateral */}
        <aside className="space-y-6">
          <section
            className="animate-fade-up rounded-xl border bg-white p-5 shadow-sm"
            style={{ animationDelay: '160ms' }}
          >
            <header className="flex items-center gap-2">
              <span className="relative flex h-2 w-2 items-center justify-center">
                <span className="animate-ping-dot absolute inline-flex h-2 w-2 rounded-full bg-green-500" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              <h2 className="text-sm font-bold text-foreground">Fonte Atual</h2>
            </header>
            <div className="mt-4 space-y-1">
              <p className="text-sm font-semibold text-foreground">Base de dados conectada</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                Última sincronização: {lastSync ? relativeDayLabel(lastSync) : 'hoje às 06:00'}
              </p>
            </div>
            <Button
              variant="outline"
              className="mt-4 w-full border-primary/50 text-primary hover:bg-primary/5 hover:text-primary"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sincronizando…
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Atualizar matriz
                </>
              )}
            </Button>
          </section>

          <section
            className="animate-fade-up rounded-xl border bg-white p-5 shadow-sm"
            style={{ animationDelay: '220ms' }}
          >
            <header>
              <h2 className="text-sm font-bold text-foreground">Distribuição por Garagem</h2>
              <p className="text-xs text-muted-foreground">{totalGaragem} colaboradores</p>
            </header>
            <div className="mt-4 space-y-4">
              <DistribuitionBar
                garagem="CURSINO"
                total={stats.porGaragem.CURSINO}
                percent={BAR_PERCENT.CURSINO}
                delay={150}
              />
              <DistribuitionBar
                garagem="SAPOPEMBA"
                total={stats.porGaragem.SAPOPEMBA}
                percent={BAR_PERCENT.SAPOPEMBA}
                delay={300}
              />
            </div>
          </section>

          <section
            className="animate-fade-up overflow-hidden rounded-xl border bg-white shadow-sm"
            style={{ animationDelay: '280ms' }}
          >
            <header className="flex items-center gap-3 bg-gradient-to-r from-[#0C1B14] to-[#14532D] px-5 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
                <Sparkles className="h-5 w-5 text-emerald-300" />
              </span>
              <h2 className="text-sm font-bold text-white">Assistente IA</h2>
            </header>
            <div className="p-5">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Tire dúvidas sobre colaboradores, CNHs, afastamentos e processos.
              </p>
              <Link
                to="/assistente-ia"
                className="mt-4 flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-left text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <span>“Quais CNHs vencem neste mês?”</span>
                <ArrowRight className="h-4 w-4 flex-none text-primary" />
              </Link>
              <Link
                to="/assistente-ia"
                className="mt-3 flex items-center justify-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
              >
                Abrir assistente
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>

          <section
            className="animate-fade-up flex items-center gap-3 rounded-xl border border-green-100 bg-green-50 p-4"
            style={{ animationDelay: '340ms' }}
          >
            <CheckCircle2 className="h-5 w-5 flex-none text-green-600" />
            <p className="text-xs leading-relaxed text-green-900">
              Dados de exemplo carregados da base de demonstração via Sudeste.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
