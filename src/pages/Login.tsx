import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'

const BG_IMAGE_URL =
  'https://wrnhfpncasqifaisvyaf.supabase.co/storage/v1/object/public/assets/6.jpeg'
const LOGO_URL =
  'https://wrnhfpncasqifaisvyaf.supabase.co/storage/v1/object/public/assets/logo_branco_transparente_nitido-80a6a-BIUCr1YD.png'

export default function Login() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) {
      const role = ((user.role as string) || '').toLowerCase()
      const isTrafego = role === 'tráfego' || role === 'trafego'
      navigate(isTrafego ? '/processos-cadastrais' : '/', { replace: true })
    }
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
      const loggedUser = await signIn(email.trim(), password)
      const role = ((loggedUser?.role as string) || '').toLowerCase()
      const isTrafego = role === 'tráfego' || role === 'trafego'
      navigate(isTrafego ? '/processos-cadastrais' : '/', { replace: true })
    } catch {
      setError('Credenciais inválidas. Verifique seu e-mail e senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-4 selection:bg-emerald-500 selection:text-white overflow-hidden">
      {/* Background Image com Cover */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat transform scale-105 transition-transform duration-1000"
        style={{
          backgroundImage: `url("${BG_IMAGE_URL}")`,
        }}
      />

      {/* Overlay escuro com leve gradiente para imersão cinematográfica */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/60 to-black/85 backdrop-blur-[2px]" />

      {/* Container Principal */}
      <div className="relative z-10 w-full max-w-[440px] flex flex-col items-center animate-fade-in-up">
        {/* Logo Via Sudeste em contêiner estilizado (glass box arredondado) */}
        <div className="mb-6 flex items-center justify-center rounded-2xl border border-white/15 bg-white/[0.08] px-8 py-4 backdrop-blur-xl shadow-2xl shadow-black/40 ring-1 ring-white/10 hover:border-white/25 transition-all duration-300">
          <img
            src={LOGO_URL}
            alt="Via Sudeste Transportes S/A"
            className="h-16 w-auto object-contain drop-shadow-md select-none"
            loading="eager"
          />
        </div>

        {/* Card de Login Glassmorphism */}
        <div className="w-full rounded-2xl border border-white/15 bg-slate-900/40 p-7 sm:p-8 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
          {/* Cabeçalho do Card */}
          <div className="text-center">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-wider text-white uppercase drop-shadow-sm font-sans">
              GESTÃO DE CNH
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-200/80 font-normal">
              Insira suas credenciais para acessar sua conta
            </p>
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
            {/* Campo E-mail */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-200"
              >
                E-mail <span className="text-red-400">*</span>
              </label>
              <div className="relative flex items-center">
                <div className="pointer-events-none absolute left-3.5 flex items-center justify-center text-slate-500">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="ti@viasudeste.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={`h-11 w-full rounded-lg border bg-white/95 pl-10 pr-4 text-sm text-slate-900 font-medium placeholder:text-slate-400 outline-none shadow-inner transition-all duration-200 focus:bg-white focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-500 ${
                    error ? 'border-red-400 bg-red-50/90 text-red-900' : 'border-white/20'
                  }`}
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-200"
              >
                Senha <span className="text-red-400">*</span>
              </label>
              <div className="relative flex items-center">
                <div className="pointer-events-none absolute left-3.5 flex items-center justify-center text-slate-500">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`h-11 w-full rounded-lg border bg-white/95 pl-10 pr-11 text-sm text-slate-900 font-medium placeholder:text-slate-400 outline-none shadow-inner transition-all duration-200 focus:bg-white focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-500 ${
                    error ? 'border-red-400 bg-red-50/90 text-red-900' : 'border-white/20'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  className="absolute right-3 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors p-1 rounded focus:outline-none"
                  aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-emerald-700" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Mensagem de Erro */}
            {error && (
              <div className="rounded-lg bg-red-500/15 border border-red-500/30 p-2.5 text-center text-xs font-medium text-red-200 animate-fade-in">
                {error}
              </div>
            )}

            {/* Botão de Entrar (Verde Corporativo) */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="relative flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#22633d] hover:bg-[#1b5232] active:bg-[#164329] text-white text-sm font-semibold tracking-wide shadow-lg shadow-black/30 ring-1 ring-white/10 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed hover:shadow-emerald-900/30 active:scale-[0.99]"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    <span>Entrando…</span>
                  </>
                ) : (
                  <span>Entrar</span>
                )}
              </button>
            </div>
          </form>

          {/* Rodapé do Card */}
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-300/80">
              Acesso restrito ao sistema interno{' '}
              <span className="font-semibold text-white">Via Sudeste</span>
            </p>
          </div>
        </div>

        {/* Informações de copyright/versão discretas no fundo */}
        <p className="mt-6 text-center text-[11px] text-white/50">
          © {new Date().getFullYear()} Via Sudeste Transportes S/A. Todos os direitos reservados.
        </p>
      </div>
    </div>
  )
}
