import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import VisaoGeral from './pages/VisaoGeral'
import Funcionarios from './pages/Funcionarios'
import Cnhs from './pages/Cnhs'
import Afastados from './pages/Afastados'
import NotFound from './pages/NotFound'

const App = () => (
  <BrowserRouter>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Routes>
        <Route path="/" element={<VisaoGeral />} />
        <Route path="/funcionarios" element={<Funcionarios />} />
        <Route path="/cnhs" element={<Cnhs />} />
        <Route path="/afastados" element={<Afastados />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </TooltipProvider>
  </BrowserRouter>
)

export default App
