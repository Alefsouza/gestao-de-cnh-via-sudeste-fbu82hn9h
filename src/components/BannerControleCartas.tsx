import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, FileText } from 'lucide-react'
import { extrairNumeroSequencialCarta, listCartas } from '@/services/cartas'
import { useRealtime } from '@/hooks/use-realtime'
import pb from '@/lib/pocketbase/client'

interface BannerControleCartasProps {
  className?: string
}

export function BannerControleCartas({ className = '' }: BannerControleCartasProps) {
  // Conforme requisito do usuário:
  // "Por mais que não esteja no sistema, estamos na carta 288"
  // Piso mínimo é 288.
  const BASE_INICIAL = 288

  const [ultimaCarta, setUltimaCarta] = useState<number>(BASE_INICIAL)
  const [loading, setLoading] = useState<boolean>(true)

  const calcularNumeros = useCallback(async () => {
    let maior = BASE_INICIAL

    try {
      // 1. Busca cartas registradas
      const cartas = await listCartas()
      for (const c of cartas) {
        const num = extrairNumeroSequencialCarta(c.numero_carta)
        if (num !== null && num > maior) {
          maior = num
        }
      }

      // 2. Cobertura adicional: processo_anexos com numero_carta
      try {
        const anexos = await pb.collection('processo_anexos').getList(1, 100, {
          filter: "numero_carta != ''",
          sort: '-created',
          fields: 'numero_carta',
        })
        for (const a of anexos.items) {
          const num = extrairNumeroSequencialCarta(a.numero_carta)
          if (num !== null && num > maior) {
            maior = num
          }
        }
      } catch {
        // silencioso
      }
    } catch (err) {
      console.warn('Erro ao calcular números das cartas para o banner:', err)
    } finally {
      setUltimaCarta(maior)
      setLoading(false)
    }
  }, [BASE_INICIAL])

  useEffect(() => {
    void calcularNumeros()
  }, [calcularNumeros])

  // Recalcula em tempo real caso uma nova carta ou anexo de processo seja registrado
  useRealtime('cartas', () => {
    void calcularNumeros()
  })

  useRealtime('processo_anexos', () => {
    void calcularNumeros()
  })

  const proximaCarta = ultimaCarta + 1

  return (
    <section
      aria-label="Controle Único de Cartas"
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#042f1d] via-[#064229] to-[#0e5c3b] text-white shadow-lg border border-[#0e5c3b]/60 ${className}`}
    >
      {/* Detalhes sutis de iluminação do gradiente Via Sudeste */}
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -left-12 -bottom-12 h-48 w-48 rounded-full bg-emerald-500/10 blur-2xl"
        aria-hidden="true"
      />

      <div className="relative flex flex-col gap-6 p-5 sm:p-6 xl:flex-row xl:items-center xl:justify-between">
        {/* Bloco Esquerda + Centro (Cartões): agrupados ou distribuídos */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between xl:justify-start xl:gap-8 flex-1 min-w-0">
          {/* Bloco Esquerda: Ícone + Título + Subtítulo */}
          <div className="flex items-start gap-4 min-w-0 max-w-xl">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 flex-none items-center justify-center rounded-xl border border-white/20 bg-white/10 text-[#d4af37] shadow-inner">
              <FileText className="h-6 w-6 sm:h-7 sm:w-7 text-[#ecd58a]" strokeWidth={1.8} />
            </div>

            <div className="min-w-0 space-y-1">
              <p className="text-[11px] font-bold tracking-wider text-emerald-200/90 uppercase">
                CONTROLE ÚNICO DE CARTAS
              </p>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-tight">
                Você está na Carta SPTrans nº{' '}
                <span className="text-white underline decoration-emerald-400/40 decoration-2 underline-offset-4">
                  {loading ? '…' : ultimaCarta}
                </span>
              </h2>
              <p className="text-xs sm:text-[13px] text-emerald-100/80 leading-relaxed font-normal">
                A mesma sequência é utilizada para Atualização, Inclusão, Exclusão, Alteração, PRAT
                e Retorno de Afastamento.
              </p>
            </div>
          </div>

          {/* Cartões lado a lado com chevron separador */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap flex-shrink-0">
            {/* Cartão 1: Última carta utilizada */}
            <div className="flex-1 sm:flex-initial min-w-[150px] rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm shadow-sm transition-all hover:bg-white/[0.14]">
              <p className="text-[10px] font-bold tracking-wider text-emerald-200/90 uppercase">
                ÚLTIMA CARTA UTILIZADA
              </p>
              <p className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight tabular-nums mt-0.5">
                {loading ? '…' : ultimaCarta}
              </p>
              <p className="text-[11px] text-emerald-100/70 font-medium">Registrada no histórico</p>
            </div>

            {/* Separador Chevron */}
            <div className="hidden sm:flex flex-none items-center justify-center text-emerald-300/60">
              <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
            </div>

            {/* Cartão 2: Próxima carta disponível (amarelo/âmbar) */}
            <div className="flex-1 sm:flex-initial min-w-[160px] rounded-xl bg-[#ebb459] px-4 py-3 text-[#3d2400] shadow-md transition-all hover:bg-[#f0bd66]">
              <p className="text-[10px] font-extrabold tracking-wider text-[#5f3c05] uppercase">
                PRÓXIMA CARTA DISPONÍVEL
              </p>
              <p className="text-2xl sm:text-3xl font-black text-[#2e1a00] tracking-tight tabular-nums mt-0.5">
                {loading ? '…' : proximaCarta}
              </p>
              <p className="text-[11px] text-[#543505] font-semibold">Será confirmada na emissão</p>
            </div>
          </div>
        </div>

        {/* Bloco Direita: Botão Abrir Controle de Cartas alinhado à direita do banner */}
        <div className="flex flex-none items-center justify-end xl:pl-4">
          <Link
            to="/processos-cadastrais?openCartas=true"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl border border-white/30 bg-white/15 px-4 py-3 text-xs sm:text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white hover:text-[#064229] hover:border-white shadow-sm active:scale-[0.98] whitespace-nowrap"
            title="Abrir controle de cartas emitidas e documentos anexos"
          >
            <span>Abrir controle de cartas</span>
            <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
          </Link>
        </div>
      </div>
    </section>
  )
}

export default BannerControleCartas
