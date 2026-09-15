import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CreditCard,
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
import { formatDate, formatCnh, relativeDayLabel } from '@/lib/format'
import { getVisaoGeralStats, listCnhsVencidasTop, type VisaoGeralStats } from '@/services/employees'
import { triggerSync } from '@/lib/sync'
import type { Employee } from '@/lib/types'
import { normalizeEmployees } from '@/lib/normalize'
import { BannerControleCartas } from '@/components/BannerControleCartas'
/** Janela em que eventos de realtime são ignorados após um carregamento (evita refetch em rajada). */
const RELOAD_THROTTLE_MS = 5_000

/** Cores conhecidas das barras por garagem com fallback para outras. */
const BAR_STYLES: Record<string, string> = {
  CURSINO: 'bg-gradient-to-r from-[#14532D] to-[#16A34A]',
  SAPOPEMBA: 'bg-gradient-to-r from-[#8FA398] to-[#B9C7BE]',
  GUAIANASES: 'bg-gradient-to-r from-[#0369A1] to-[#38BDF8]',
  ITAQUERA: 'bg-gradient-to-r from-[#D97706] to-[#FBBF24]',
}

const DEFAULT_BAR_STYLE = 'bg-gradient-to-r from-[#4B5563] to-[#9CA3AF]'

function DistribuitionBar({
  garagem,
  total,
  percent,
  delay,
}: {
  garagem: string
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
          className={`h-full rounded-full transition-all duration-[600ms] ease-out ${BAR_STYLES[garagem] ?? DEFAULT_BAR_STYLE}`}
          style={{ width: mounted ? `${percent}%` : '0%' }}
        />
      </div>
    </div>
  )
}

export default function VisaoGeral() {
  const [stats, setStats] = useState<VisaoGeralStats>({
    ativos: 0,
    afastados: 0,
    vencidas: 0,
    fiscais: 0,
    totalColaboradores: 0,
    porGaragem: {},
    garagens: [],
  })
  const [vencidasRaw, setVencidasRaw] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)

  // Guardas para não empilhar carregamentos: um em andamento e um recente.
  const loadRunId = useRef(0)
  const loadInProgress = useRef(false)
  const lastLoadedAt = useRef(0)

  /**
   * Carrega os contadores e os 5 primeiros registros de CNHs vencidas
   * sem baixar a base inteira, usando contagens pontuais no backend PocketBase.
   */
  const load = useCallback(async () => {
    const runId = ++loadRunId.current
    loadInProgress.current = true
    setLoading(true)
    setLoadError(false)
    try {
      const [statsResult, cnhsResult] = await Promise.allSettled([
        getVisaoGeralStats(),
        listCnhsVencidasTop(5),
      ])

      if (runId !== loadRunId.current) return

      let hasFailure = false

      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value.stats)
        if (statsResult.value.hasError) {
          hasFailure = true
        }
      } else {
        hasFailure = true
        console.error('Erro ao buscar estatísticas da Visão Geral:', statsResult.reason)
      }

      if (cnhsResult.status === 'fulfilled') {
        setVencidasRaw(cnhsResult.value)
      } else {
        hasFailure = true
        console.error('Erro ao buscar CNHs vencidas:', cnhsResult.reason)
      }

      if (hasFailure && statsResult.status === 'rejected' && cnhsResult.status === 'rejected') {
        setLoadError(true)
        toast.error('Não foi possível carregar os dados da matriz')
      }
    } catch {
      if (runId === loadRunId.current) {
        setLoadError(true)
        toast.error('Não foi possível carregar os dados da matriz')
      }
    } finally {
      if (runId === loadRunId.current) {
        loadInProgress.current = false
        lastLoadedAt.current = Date.now()
        setLoading(false)
      }
    }
  }, [])

  const requestLoad = useCallback(() => {
    if (loadInProgress.current) return
    if (Date.now() - lastLoadedAt.current < RELOAD_THROTTLE_MS) return
    void load()
  }, [load])

  useEffect(() => {
    void load()
  }, [load])

  useRealtime('employees', () => {
    requestLoad()
  })

  // Normalização leve aplicada apenas aos 5 registros trazidos para a tabela
  const vencidasList = useMemo(() => normalizeEmployees(vencidasRaw), [vencidasRaw])

  const hasBaseData =
    stats.totalColaboradores > 0 ||
    stats.ativos > 0 ||
    stats.afastados > 0 ||
    Object.values(stats.porGaragem).some((val) => val > 0) ||
    vencidasList.length > 0

  const handleSync = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const result = await triggerSync()
      if (result.status === 'Sucesso') {
        toast.success(`Matriz atualizada: ${result.records_updated} registros sincronizados`)
      } else {
        toast.error(result.error || 'A sincronização falhou — verifique a conexão com a matriz')
      }
      setLastSync(new Date().toISOString())
      await load()
    } catch {
      toast.error('Não foi possível disparar a sincronização da matriz')
    } finally {
      setSyncing(false)
    }
  }

  const totalColaboradores = stats.totalColaboradores

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Banner informativo de controle de cartas no topo da Visão Geral */}
      <BannerControleCartas />

      <div className="grid grid-cols-1 items-start gap-6 min-[1200px]:grid-cols-[minmax(0,1fr)_340px]">
        {/* Coluna principal */}
        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Colaboradores ativos"
              value={stats.ativos}
              icon={Users}
              tone="green"
              trend="up"
              caption="Base sincronizada do Globus"
              delay={0}
              to="/funcionarios"
            />
            <StatCard
              label="Colaboradores afastados"
              value={stats.afastados}
              icon={UserMinus}
              tone="amber"
              trend="down"
              caption="Base sincronizada do Globus"
              delay={80}
              to="/afastados"
            />
            <StatCard
              label="CNHs vencidas"
              value={stats.vencidas}
              icon={CreditCard}
              tone="red"
              trend="down"
              caption="Base sincronizada do Globus"
              delay={160}
              to="/cnhs"
            />
          </div>

          <section
            className="animate-fade-up rounded-xl border bg-white shadow-sm"
            style={{ animationDelay: '120ms' }}
          >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-foreground">CNHs vencidas</h2>
                <p className="text-xs text-muted-foreground">
                  Colaboradores com CNH fora da validade
                </p>
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
              ) : hasBaseData ? (
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-5 py-3 font-semibold">registro</th>
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
                            {formatCnh(employee.cnh_categoria, employee.cnh_numero)}
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
              ) : !hasBaseData && loadError ? (
                <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
                  <p className="text-sm font-medium text-foreground">
                    Não foi possível carregar os dados da matriz
                  </p>
                  <p className="max-w-md text-xs text-muted-foreground">
                    O backend está sobrecarregado neste momento. Tente novamente em alguns
                    instantes.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => void load()}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        Tentar novamente
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 px-5 py-12 text-center">
                  <p className="text-sm font-medium text-foreground">
                    Nenhum colaborador na base ainda
                  </p>
                  <p className="max-w-md text-xs text-muted-foreground">
                    Use “Atualizar matriz” ao lado para buscar os dados reais da matriz Via Sudeste
                    — os dados de exemplo somem após a sincronização.
                  </p>
                </div>
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
                Última sincronização: {lastSync ? relativeDayLabel(lastSync) : 'aguardando…'}
              </p>
            </div>
            <Button
              variant="outline"
              className="mt-4 w-full border-primary/50 text-primary hover:bg-primary/5 hover:text-primary"
              onClick={() => void handleSync()}
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
                  Atualizar dados
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
              <p className="text-xs text-muted-foreground">{totalColaboradores} colaboradores</p>
            </header>
            <div className="mt-4 space-y-4">
              {stats.garagens.map((item, index) => {
                const percent =
                  totalColaboradores > 0 ? Math.round((item.total / totalColaboradores) * 100) : 0
                return (
                  <DistribuitionBar
                    key={item.garagem}
                    garagem={item.garagem}
                    total={item.total}
                    percent={percent}
                    delay={100 * (index + 1)}
                  />
                )
              })}
              {stats.garagens.length === 0 && !loading && (
                <p className="text-xs text-muted-foreground">Nenhuma garagem cadastrada.</p>
              )}
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
              Exibindo os dados reais carregados do Globus.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
