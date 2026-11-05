import { useEffect, useMemo, useState } from 'react'
import { FileText, Loader2, Printer } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Employee } from '@/lib/types'
import { listAllEmployees } from '@/services/employees'
import { persistirCartaGerada, registrarCartaNaTimeline } from '@/services/cartasGeradas'
import { gerarCartaHtml, type CartaGeradaDados, type CartaModeloId } from '@/lib/cartaModelos'
import {
  derivarDadosDaCarta,
  modeloIdParaTipoCarta,
  type CartaDerivada,
} from '@/lib/cartasDerivacao'
import type { CartaRecord } from '@/services/cartas'
import type { ProcessoCadastralRecord } from '@/lib/types'

interface GerarCartaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Carta registrada (linha da coleção `cartas`) selecionada em Cartas Emitidas. */
  carta: CartaRecord | null
  /** Todas as linhas da coleção `cartas` da mesma numeração. */
  linhasDaCarta?: CartaRecord[]
  /** Processos da tela — fonte de data de afastamento/retorno e da timeline. */
  processos?: ProcessoCadastralRecord[]
  onSuccess?: () => void
}

type Etapa = 'gerando' | 'gerada'

const MODELO_NOMES: Record<CartaModeloId, string> = {
  inss_retorno: 'Retorno de Afastamento pelo INSS',
  inss_afastados: 'Afastados pelo INSS',
  prat: 'PRAT — Acidente de Trânsito',
}

function labelOf(modelo: CartaModeloId): string {
  return MODELO_NOMES[modelo]
}

/** Monta os dados no formato do gerador de modelos a partir da carta derivada. */
function montarDadosGerados(dados: CartaDerivada): CartaGeradaDados {
  return {
    modelo: dados.modelo,
    numeroCarta: dados.numeroCarta,
    colaboradores: dados.colaboradores,
    dataRetorno: dados.dataRetorno,
    prefixoVeiculo: dados.prefixoVeiculo,
    dataSinistro: dados.dataSinistro,
  }
}

export default function GerarCartaModal({
  open,
  onOpenChange,
  carta,
  linhasDaCarta,
  processos,
  onSuccess,
}: GerarCartaModalProps) {
  const [etapa, setEtapa] = useState<Etapa>('gerando')
  const [saving, setSaving] = useState(false)
  const [htmlPreview, setHtmlPreview] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [derivada, setDerivada] = useState<CartaDerivada | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // Garante a base do cadastro real (fonte dos dados pessoais) mesmo sem prop
  useEffect(() => {
    if (!open) return
    let cancelled = false
    listAllEmployees({ excludeDesligados: true })
      .then((items) => {
        if (!cancelled) setEmployees(items)
      })
      .catch(() => {
        // silencioso
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const linhas = useMemo<CartaRecord[]>(
    () => linhasDaCarta ?? (carta ? [carta] : []),
    [linhasDaCarta, carta],
  )

  // Deriva tudo da carta registrada e gera a pré-visualização direto — sem
  // nenhuma tela de escolha de tipo/número/colaboradores.
  useEffect(() => {
    if (!open || !carta || employees.length === 0) return
    let cancelled = false
    setEtapa('gerando')
    setErro(null)
    setHtmlPreview('')

    const tipo = carta.tipo_carta || ''
    const modeloId = modeloIdParaTipoCarta(tipo)
    if (!modeloId) {
      setErro(
        `O tipo "${tipo || 'não informado'}" desta carta não corresponde a nenhum modelo oficial ` +
          '(Retorno INSS, Afastados INSS ou PRAT). Registre a carta com um desses tipos para gerar o documento.',
      )
      return
    }

    const dados = derivarDadosDaCarta({
      carta,
      linhasDaCarta: linhas,
      employees,
      processos,
    })

    if (!dados.ok) {
      setErro('Não foi possível identificar os dados da carta registrada.')
      return
    }

    if (dados.avisos.length > 0) {
      for (const aviso of dados.avisos) toast.warning(aviso)
    }

    setDerivada(dados)
    setHtmlPreview(gerarCartaHtml(montarDadosGerados(dados)))

    // Persiste automaticamente: grava na coleção `cartas`, registra a timeline
    // e exibe a pré-visualização A4.
    void (async () => {
      setSaving(true)
      try {
        const detalhe = await persistirCartaGerada({
          modelo: dados.modelo,
          numeroCarta: dados.numeroCarta,
          colaboradores: dados.colaboradores,
          dataRetorno: dados.dataRetorno,
          prefixoVeiculo: dados.prefixoVeiculo,
          dataSinistro: dados.dataSinistro,
        })

        const tipoCartaLabel = labelOf(dados.modelo)
        for (const l of dados.colaboradores) {
          const proc = processos?.find(
            (p) => p.matricula === l.registro || p.colaborador === l.nome,
          )
          if (proc) {
            await registrarCartaNaTimeline(
              proc,
              tipoCartaLabel,
              dados.numeroCarta,
              detalhe || undefined,
            )
          }
        }

        toast.success(`Carta ${dados.numeroCarta} registrada em Cartas Emitidas.`)
        onSuccess?.()
        if (!cancelled) setEtapa('gerada')
      } catch (err) {
        console.error('Erro ao salvar carta gerada:', err)
        if (!cancelled) {
          setErro('Não foi possível registrar a carta. Tente novamente.')
          toast.error('Não foi possível registrar a carta. Tente novamente.')
        }
      } finally {
        if (!cancelled) setSaving(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, carta, employees])

  function imprimirCarta() {
    if (!htmlPreview) return
    const win = window.open('', '_blank', 'width=900,height=1000')
    if (!win) {
      toast.error('Permita pop-ups para visualizar e imprimir a carta.')
      return
    }
    win.document.open()
    win.document.write(htmlPreview)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
    }, 300)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Gerar Carta{derivada ? ` — ${MODELO_NOMES[derivada.modelo]}` : ''}
          </DialogTitle>
          <DialogDescription>
            {derivada
              ? `Carta N.º ${derivada.numeroCarta} · ${derivada.colaboradores.length} colaborador(es) · dados identificados da carta registrada.`
              : 'Identificando o Tipo da Carta, o Número e os colaboradores da carta registrada…'}
          </DialogDescription>
        </DialogHeader>

        {erro && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {erro}
          </div>
        )}

        {!erro && etapa === 'gerando' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-14 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            Gerando a carta com os dados da carta registrada…
          </div>
        )}

        {!erro && etapa === 'gerada' && derivada && (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <iframe
              title="Pré-visualização da carta"
              srcDoc={htmlPreview}
              className="h-[46vh] w-full rounded-lg border bg-white"
              sandbox="allow-same-origin"
            />
            <p className="text-[11px] text-muted-foreground">
              A impressão sai em formato A4, sem elementos de tela — use "Salvar como PDF" na janela
              de impressão do navegador.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Fechar
          </Button>
          {etapa === 'gerada' && !erro && (
            <Button type="button" onClick={imprimirCarta} disabled={saving || !htmlPreview}>
              <Printer className="mr-1.5 h-4 w-4" />
              Imprimir / Salvar PDF
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
