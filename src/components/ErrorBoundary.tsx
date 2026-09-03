import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary capturou um erro não tratado:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  handleGoHome = () => {
    this.setState({ hasError: false, error: null })
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 text-slate-800">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-xl shadow-rose-100/50">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <AlertTriangle className="h-7 w-7" />
            </div>

            <h1 className="text-center text-xl font-bold tracking-tight text-slate-900">
              Ops! Ocorreu um erro inesperado
            </h1>

            <p className="mt-2 text-center text-sm text-slate-600">
              Aconteceu uma falha durante o carregamento desta página. Os dados continuam seguros.
            </p>

            {this.state.error?.message && (
              <div className="mt-4 rounded-lg bg-slate-100 p-3 text-xs font-mono text-slate-700 break-words max-h-24 overflow-y-auto">
                {this.state.error.message}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={this.handleReset}
                className="inline-flex items-center justify-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Tentar novamente
              </Button>
              <Button
                type="button"
                onClick={this.handleGoHome}
                className="inline-flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary/90"
              >
                <Home className="h-4 w-4" />
                Ir para a Visão Geral
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
export default ErrorBoundary
