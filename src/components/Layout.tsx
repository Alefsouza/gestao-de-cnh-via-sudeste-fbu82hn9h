import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Bus,
  ChevronDown,
  CreditCard,
  FileCheck2,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Plus,
  ShieldCheck,
  Sparkles,
  UserCircle,
  UserMinus,
  Users,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'

import NotificationBell from '@/components/NotificationBell'
import NovaMovimentacaoModal from '@/components/NovaMovimentacaoModal'
import { useAuth } from '@/contexts/AuthContext'
import { useIsMobile } from '@/hooks/use-mobile'
import { useRealtime } from '@/hooks/use-realtime'
import { greetingFor, initials } from '@/lib/format'
import { listNotifications } from '@/services/notifications'
import type { Notification } from '@/lib/types'
import { cn } from '@/lib/utils'

interface MenuItem {
  label: string
  to: string
  icon: LucideIcon
}

const MENU: MenuItem[] = [
  { label: 'Visão geral', to: '/', icon: LayoutDashboard },
  { label: 'Matriz de funcionários', to: '/funcionarios', icon: Users },
  { label: 'CNHs de motoristas', to: '/cnhs', icon: CreditCard },
  { label: 'Afastados', to: '/afastados', icon: UserMinus },
  { label: 'Atualização fiscal', to: '/atualizacao-fiscal', icon: FileCheck2 },
  { label: 'Processos Cadastrais', to: '/processos-cadastrais', icon: FolderKanban },
  { label: 'Assistente IA', to: '/assistente-ia', icon: Sparkles },
  { label: 'Painel de acesso', to: '/painel-acesso', icon: ShieldCheck },
]

function pageLabel(pathname: string): string {
  const item = MENU.find((item) => item.to === pathname)
  return item?.label ?? 'Página'
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary shadow-inner">
        <Bus className="h-5 w-5 text-white" />
      </div>
      {!compact && (
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold leading-tight text-white">Via Sudeste</p>
          <p className="truncate text-[11px] leading-tight text-emerald-200/70">Portal RH</p>
        </div>
      )}
    </div>
  )
}

function SidebarNav({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      {MENU.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={onNavigate}
          title={compact ? item.label : undefined}
          className={({ isActive }) =>
            cn(
              'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
              compact && 'justify-center px-0',
              isActive
                ? 'bg-primary text-white shadow-sm'
                : 'text-emerald-100/70 hover:bg-white/5 hover:text-white',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  'absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-emerald-300 transition-all duration-200',
                  isActive ? 'opacity-100' : 'opacity-0',
                )}
              />
              <item.icon className="h-[18px] w-[18px] flex-none" />
              {!compact && <span className="truncate">{item.label}</span>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function SidebarFooter({ compact, onSignOut }: { compact?: boolean; onSignOut: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user } = useAuth()
  const name = user?.name || 'Administrador Via Sudeste'

  return (
    <div className="border-t border-white/10 p-3">
      <div className="flex items-center gap-2.5 rounded-lg bg-white/5 px-3 py-2.5">
        <span className="relative flex h-2 w-2 flex-none items-center justify-center">
          <span className="animate-ping-dot absolute inline-flex h-2 w-2 rounded-full bg-green-500" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        {!compact && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">Matriz conectada</p>
            <p className="truncate text-[10px] text-emerald-200/60">
              Base sincronizada · hoje às 06:00
            </p>
          </div>
        )}
      </div>

      <div className="relative mt-2">
        {menuOpen && <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />}
        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-white/5',
            compact && 'justify-center px-0',
          )}
          title={compact ? name : undefined}
        >
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            {initials(name)}
          </span>
          {!compact && (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-xs font-semibold text-white">{name}</span>
                <span className="mt-0.5 inline-flex rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                  Admin
                </span>
              </span>
              <ChevronDown className="h-4 w-4 flex-none text-emerald-200/60" />
            </>
          )}
        </button>

        {!compact && menuOpen && (
          <div className="absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-lg border border-white/10 bg-[#0F2A1C] shadow-xl">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-emerald-50 transition-colors hover:bg-white/5"
              onClick={() => setMenuOpen(false)}
            >
              <UserCircle className="h-4 w-4" />
              Meu perfil
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onSignOut()
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-emerald-50 transition-colors hover:bg-white/5"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Header({
  onOpenSidebar,
  onNewMovement,
  notifications,
  onReloadNotifications,
}: {
  onOpenSidebar: () => void
  onNewMovement: () => void
  notifications: Notification[]
  onReloadNotifications: () => void
}) {
  const location = useLocation()
  const { user } = useAuth()

  return (
    <header className="sticky top-0 z-30 flex h-[68px] items-center gap-3 border-b bg-white px-4 shadow-sm md:px-6">
      <button
        type="button"
        aria-label="Abrir menu"
        onClick={onOpenSidebar}
        className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0">
        <h1 className="truncate text-base font-bold leading-tight text-foreground md:text-[17px]">
          Via Sudeste - Portal RH / Treinamento
        </h1>
        <p className="truncate text-xs text-muted-foreground">{pageLabel(location.pathname)}</p>
      </div>

      <div className="ml-auto flex items-center gap-3 lg:gap-5">
        <div className="hidden text-right lg:block">
          <p className="text-sm font-semibold leading-tight text-foreground">
            {greetingFor(user?.name)}
          </p>
          <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            Unidade CURSINO
          </p>
        </div>

        <Button onClick={onNewMovement} className="hidden h-10 items-center gap-2 sm:inline-flex">
          <Plus className="h-4 w-4" />
          Nova movimentação
        </Button>

        <NotificationBell notifications={notifications} onReload={onReloadNotifications} />

        <span className="hidden items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary md:inline-flex">
          <ShieldCheck className="h-3.5 w-3.5" />
          Acesso protegido
        </span>
      </div>
    </header>
  )
}

export default function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()

  const loadNotifications = useCallback(async () => {
    try {
      const items = await listNotifications()
      setNotifications(items)
    } catch {
      // silencioso: o sino apenas fica vazio
    }
  }, [])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  useRealtime('notifications', () => {
    loadNotifications()
  })

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  const handleSignOut = useCallback(() => {
    signOut()
    toast.success('Sessão encerrada')
    navigate('/login', { replace: true })
  }, [signOut, navigate])

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 z-40 hidden h-screen w-[264px] shrink-0 flex-col bg-[#0C1B14] md:flex">
        <div className="flex h-[68px] items-center border-b border-white/10 px-5">
          <Brand />
        </div>
        <SidebarNav />
        <SidebarFooter onSignOut={handleSignOut} />
      </aside>

      {/* Sidebar móvel (drawer) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[264px] flex-col bg-[#0C1B14] shadow-xl">
            <div className="flex h-[68px] items-center justify-between border-b border-white/10 px-5">
              <Brand />
              <button
                type="button"
                aria-label="Fechar menu"
                onClick={() => setDrawerOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-emerald-100/70 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarNav onNavigate={() => setDrawerOpen(false)} />
            <SidebarFooter onSignOut={handleSignOut} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          onOpenSidebar={() => setDrawerOpen(true)}
          onNewMovement={() => setModalOpen(true)}
          notifications={notifications}
          onReloadNotifications={loadNotifications}
        />
        <main key={location.pathname} className="animate-fade-up flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      <NovaMovimentacaoModal open={modalOpen} onOpenChange={setModalOpen} />

      {/* Botão flutuante de nova movimentação em telas muito pequenas */}
      {isMobile && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="fixed bottom-5 right-5 z-30 flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white shadow-lg sm:hidden"
        >
          <Plus className="h-4 w-4" />
          Nova movimentação
        </button>
      )}
    </div>
  )
}
