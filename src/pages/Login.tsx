import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bus, Loader2, Lock, ShieldCheck } from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'

export default function Login() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError('Informe e-mail e senha para entrar.')
      return
    }

    setLoading(true)
    try {
      await signIn(email.trim(), password)
      navigate('/', { replace: true })
    } catch {
      setError('Credenciais inválidas. Verifique seu e-mail e senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Painel de marca */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0C1B14] via-[#123B24] to-[#14532D] p-12 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, transparent, transparent 18px, #ffffff 18px, #ffffff 20px)',
          }}
        />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10">
            <Bus className="h-6 w-6 text-emerald-300" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">Via Sudeste</p>
            <p className="text-xs text-emerald-200/70">Portal RH / Treinamento</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-bold leading-tight text-white">
            Gestão de CNH, escalas e documentos da sua operação em um só lugar.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-emerald-100/70">
            Acompanhe a validade das CNHs dos motoristas, afastamentos e processos admissionais das
            garagens CURSINO e SAPOPEMBA.
          </p>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-emerald-200/70">
          <ShieldCheck className="h-4 w-4" />
          Acesso protegido — uso exclusivo de colaboradores autorizados.
        </div>
      </div>

      {/* Formulário */}
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <Bus className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-foreground">Via Sudeste</p>
              <p className="text-xs text-muted-foreground">Portal RH / Treinamento</p>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-8 shadow-sm">
            <h2 className="text-xl font-bold text-foreground">Entrar</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Acesse o portal com suas credenciais.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-foreground">
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="voce@viasudeste.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={`flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring ${
                    error ? 'border-red-400' : 'border-input'
                  }`}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-foreground">
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring ${
                    error ? 'border-red-400' : 'border-input'
                  }`}
                />
              </div>

              {error && <p className="text-xs font-medium text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Entrando…
                  </>
                ) : (
                  'Entrar'
                )}
              </button>
            </form>

            <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Acesso restrito a colaboradores autorizados.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
