import { useLocation } from 'react-router-dom'
import { useEffect } from 'react'

const NotFound = () => {
  const location = useLocation()

  useEffect(() => {
    console.error('404 Error: User attempted to access non-existent route:', location.pathname)
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <h1 className="text-5xl font-bold text-foreground">404</h1>
        <p className="mt-3 text-lg text-muted-foreground">Ops! Página não encontrada</p>
        <a
          href="/"
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Voltar para a Visão Geral
        </a>
      </div>
    </div>
  )
}

export default NotFound
