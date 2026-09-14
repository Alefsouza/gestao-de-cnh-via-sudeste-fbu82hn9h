import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import ErrorBoundary from '@/components/ErrorBoundary'
import Layout from '@/components/Layout'
import VisaoGeral from './pages/VisaoGeral'
import Funcionarios from './pages/Funcionarios'
import Cnhs from './pages/Cnhs'
import Afastados from './pages/Afastados'
import ProcessosCadastrais from './pages/ProcessosCadastrais'
import AssistenteIA from './pages/AssistenteIA'
import PainelAcesso from './pages/PainelAcesso'
import Login from './pages/Login'
import NotFound from './pages/NotFound'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Carregando…</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RoleRouteGuard({
  children,
  allowedRoles,
}: {
  children: React.ReactNode
  allowedRoles?: string[]
}) {
  const { user, loading } = useAuth()

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />

  const userRole = (user.role as string) || 'Admin'
  const normalizedRole = userRole.toLowerCase()
  const isTrafego = normalizedRole === 'tráfego' || normalizedRole === 'trafego'

  // Tráfego só pode acessar /processos-cadastrais
  if (isTrafego) {
    if (
      allowedRoles &&
      !allowedRoles.some((r) => r.toLowerCase() === 'tráfego' || r.toLowerCase() === 'trafego')
    ) {
      return <Navigate to="/processos-cadastrais" replace />
    }
  } else if (allowedRoles && !allowedRoles.some((r) => r.toLowerCase() === normalizedRole)) {
    // Para outros papéis caso haja restrição
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) {
    const role = ((user.role as string) || '').toLowerCase()
    const isTrafego = role === 'tráfego' || role === 'trafego'
    return <Navigate to={isTrafego ? '/processos-cadastrais' : '/'} replace />
  }
  return <>{children}</>
}

const App = () => (
  <ErrorBoundary>
    <BrowserRouter>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <Routes>
            <Route
              path="/login"
              element={
                <PublicOnly>
                  <Login />
                </PublicOnly>
              }
            />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route
                path="/"
                element={
                  <RoleRouteGuard allowedRoles={['Admin', 'RH']}>
                    <VisaoGeral />
                  </RoleRouteGuard>
                }
              />
              <Route
                path="/funcionarios"
                element={
                  <RoleRouteGuard allowedRoles={['Admin', 'RH']}>
                    <Funcionarios />
                  </RoleRouteGuard>
                }
              />
              <Route
                path="/cnhs"
                element={
                  <RoleRouteGuard allowedRoles={['Admin', 'RH']}>
                    <Cnhs />
                  </RoleRouteGuard>
                }
              />
              <Route
                path="/afastados"
                element={
                  <RoleRouteGuard allowedRoles={['Admin', 'RH']}>
                    <Afastados />
                  </RoleRouteGuard>
                }
              />
              <Route path="/processos-cadastrais" element={<ProcessosCadastrais />} />
              <Route
                path="/assistente-ia"
                element={
                  <RoleRouteGuard allowedRoles={['Admin', 'RH']}>
                    <AssistenteIA />
                  </RoleRouteGuard>
                }
              />
              <Route
                path="/painel-acesso"
                element={
                  <RoleRouteGuard allowedRoles={['Admin']}>
                    <PainelAcesso />
                  </RoleRouteGuard>
                }
              />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </TooltipProvider>
    </BrowserRouter>
  </ErrorBoundary>
)

export default App
