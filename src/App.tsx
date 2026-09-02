import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import Layout from '@/components/Layout'
import VisaoGeral from './pages/VisaoGeral'
import Funcionarios from './pages/Funcionarios'
import Cnhs from './pages/Cnhs'
import Afastados from './pages/Afastados'
import AtualizacaoFiscal from './pages/AtualizacaoFiscal'
import ProcessosSPTrans from './pages/ProcessosSPTrans'
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

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

const App = () => (
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
            <Route path="/" element={<VisaoGeral />} />
            <Route path="/funcionarios" element={<Funcionarios />} />
            <Route path="/cnhs" element={<Cnhs />} />
            <Route path="/afastados" element={<Afastados />} />
            <Route path="/atualizacao-fiscal" element={<AtualizacaoFiscal />} />
            <Route path="/processos-sptrans" element={<ProcessosSPTrans />} />
            <Route path="/processos-cadastrais" element={<ProcessosCadastrais />} />
            <Route path="/assistente-ia" element={<AssistenteIA />} />
            <Route path="/painel-acesso" element={<PainelAcesso />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </TooltipProvider>
  </BrowserRouter>
)

export default App
