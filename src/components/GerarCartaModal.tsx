import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, FileText, Info, Loader2, Printer, RefreshCw } from 'lucide-react'
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
import { withModalRetry, withTimeout, MODAL_TIMEOUT_MS, TimeoutError } from '@/lib/modalNet'
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
/** Situação do carregamento do cadastro de colaboradores (enriquecimento). */
type CadastroEstado = 'carregando' | 'ok' | 'erro'

const MODELO_NOMES: Record<CartaModeloId, string> = {
  inss_retorno: 'Retorno de Afastamento pelo INSS',
  inss_afastados: 'Afastados pelo INSS',
  prat: 'PRAT — Acidente de Trânsito',
  atualizacao_cadastral: 'Atualização Cadastral',
  exclusao_condubus: 'Exclusão Cadastral — CONDUBUS',
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
  /** Estado do modal: null = fluxo normal (gerando/gerada); erro = mostra erro com "Tentar de novo"; sem_modelo = mensagem amigável. */
  const [erro, setErro] = useState<string | null>(null)
  const [tipoSemModelo, setTipoSemModelo] = useState<string | null>(null)
  const [cadastroEstado, setCadastroEstado] = useState<CadastroEstado>('carregando')
  const [tentativa, setTentativa] = useState(0)
  /** id da carta já persistida — evita duplicar linhas quando o efeito reenriquece a pré-visualização. */
  const persistiuRef = useRef<string | null>(null)
  /** true quando a última tentativa estourou o timeout de rede (~15s). */
  const [porTimeout, setPorTimeout] = useState(false)

  const linhas = useMemo<CartaRecord[]>(
    () => linhasDaCarta ?? (carta ? [carta] : []),
    [linhasDaCarta, carta],
  )

  // Reabrir o modal recomeça o fluxo (o carregamento do cadastro é refeito).
  useEffect(() => {
    if (open) return
    setEtapa('gerando')
    setErro(null)
    setTipoSemModelo(null)
    setPorTimeout(false)
    setHtmlPreview('')
    setDerivada(null)
    setSaving(false)
    setCadastroEstado('carregando')
    setTentativa(0)
  }, [open])

  // Carrega o cadastro para COMPLETAR CPF/GRUPO/datas — nunca como pré-condição
  // da geração: se falhar (ou voltar vazio), a carta é gerada mesmo assim com
  // os dados da própria carta registrada e o erro fica visível com "Tentar de novo".
  useEffect(() => {
    if (!open || cadastroEstado !== 'carregando') return
    let cancelled = false
    // Teto de ~15s + retry automático: se a rede oscilar (ERR_HTTP2_PING_FAILED,
    // requisição pendente sem resposta), o carregamento é abortado e vira erro
    // com "Tentar de novo" — nunca fica pendente para sempre.
    withModalRetry(() => listAllEmployees({ excludeDesligados: true }), {
      timeoutMs: MODAL_TIMEOUT_MS,
    })
      .then((items) => {
        if (cancelled) return
        setEmployees(items)
        setCadastroEstado(items.length > 0 ? 'ok' : 'erro')
      })
      .catch((err) => {
        if (!cancelled) {
          setPorTimeout(err instanceof TimeoutError)
          setEmployees([])
          setCadastroEstado('erro')
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, cadastroEstado])

  // Deriva tudo da carta registrada e gera a pré-visualização direto — sem
  // nenhuma tela de escolha de tipo/número/colaboradores. O cadastro, quando
  // disponível, só completa CPF/GRUPO/datas; nome, matrícula e função vêm da carta.
  useEffect(() => {
    if (!open || !carta || cadastroEstado === 'carregando') return
    let cancelled = false

    const tipo = carta.tipo_carta || ''
    const modeloId = modeloIdParaTipoCarta(tipo)
    if (!modeloId) {
      // Tipo sem modelo implementado: mensagem explicativa amigável (não erro
      // genérico, não spinner). O modal para de carregar e explica o motivo.
      setTipoSemModelo(tipo || 'não informado')
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

    // Avisos de dados faltantes só na primeira geração (evita toast duplicado
    // a cada reenriquecimento/retry).
    if (dados.avisos.length > 0 && persistiuRef.current !== carta.id) {
      for (const aviso of dados.avisos) toast.warning(aviso)
    }

    setDerivada(dados)
    setHtmlPreview(gerarCartaHtml(montarDadosGerados(dados)))
    setEtapa('gerada')

    // Persiste uma única vez por carta: grava na coleção `cartas`, registra a
    // timeline e exibe a pré-visualização. Reenriquecimentos do cadastro não
    // regravam as linhas (persistiuRef = null libera nova gravação após erro).
    if (persistiuRef.current === carta.id) {
      return
    }
    persistiuRef.current = carta.id
    setErro(null)
    setTipoSemModelo(null)
    void (async () => {
      setSaving(true)
      try {
        // Teto de ~15s na gravação: se a rede travar, o modal mostra erro com
        // "Tentar de novo" em vez de ficar em "Registrando…" para sempre.
        const detalhe = await withModalRetry(
          (sendOptions) =>
            persistirCartaGerada(
              {
                modelo: dados.modelo,
                numeroCarta: dados.numeroCarta,
                colaboradores: dados.colaboradores,
                dataRetorno: dados.dataRetorno,
                prefixoVeiculo: dados.prefixoVeiculo,
                dataSinistro: dados.dataSinistro,
              },
              { sendOptions },
            ),
          { timeoutMs: MODAL_TIMEOUT_MS },
        )

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
        // Libera a carta para nova tentativa de gravação.
        persistiuRef.current = null
        console.error('Erro ao salvar carta gerada:', err)
        if (!cancelled) {
          const msg =
            err instanceof TimeoutError
              ? 'A gravação da carta não respondeu em 15 segundos (rede instável). Nada foi registrado — tente novamente.'
              : 'Não foi possível registrar a carta. Tente novamente.'
          setPorTimeout(err instanceof TimeoutError)
          setErro(msg)
          toast.error(msg)
        }
      } finally {
        if (!cancelled) setSaving(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, carta, employees, cadastroEstado, tentativa])

  /** "Tentar de novo": refaz o carregamento do cadastro ou a gravação da carta. */
  function tentarNovamente() {
    if (cadastroEstado === 'erro') {
      // Refaz o carregamento; se der certo, o efeito reenriquece a pré-visualização.
      setErro(null)
      setPorTimeout(false)
      setCadastroEstado('carregando')
      return
    }
    setErro(null)
    setPorTimeout(false)
    setTentativa((t) => t + 1)
  }

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

  const mostrarErroCadastro = cadastroEstado === 'erro'

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

        {tipoSemModelo ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">Modelo de carta não disponível</p>
                <p>
                  O tipo da carta registrada é “{tipoSemModelo}”, que não corresponde a nenhum dos
                  modelos oficiais disponíveis para geração: Retorno de Afastamento pelo INSS,
                  Afastados pelo INSS, PRAT (Acidente de Trânsito), Atualização Cadastral ou
                  Exclusão Cadastral — CONDUBUS.
                </p>
                <p className="text-xs text-amber-800">
                  Confira o tipo da carta em Cartas Emitidas ou registre uma nova carta com um dos
                  tipos acima para gerar o documento.
                </p>
              </div>
            </div>
          </div>
        ) : erro || mostrarErroCadastro ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <p>
                  {erro ||
                    (porTimeout
                      ? `O carregamento do cadastro não respondeu em ${Math.round(MODAL_TIMEOUT_MS / 1000)} segundos (rede instável). Tente novamente.`
                      : 'Não foi possível carregar o cadastro de colaboradores. Tente novamente.')}
                </p>
                {mostrarErroCadastro && !erro && (
                  <p className="text-xs text-destructive/80">
                    A carta será gerada com os dados da própria carta registrada (nome, matrícula e
                    função); CPF, GRUPO e datas entram quando o cadastro carregar.
                  </p>
                )}
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={tentarNovamente}
              disabled={cadastroEstado === 'carregando' || saving}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Tentar de novo
            </Button>
          </div>
        ) : etapa === 'gerando' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-14 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            Gerando a carta com os dados da carta registrada…
          </div>
        ) : (
          etapa === 'gerada' &&
          derivada && (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Registrando a carta em Cartas Emitidas…
                </div>
              )}
              <iframe
                title="Pré-visualização da carta"
                srcDoc={htmlPreview}
                className="h-[46vh] w-full rounded-lg border bg-white"
                sandbox="allow-same-origin"
              />
              <p className="text-[11px] text-muted-foreground">
                A impressão sai em formato A4, sem elementos de tela — use "Salvar como PDF" na
                janela de impressão do navegador.
              </p>
            </div>
          )
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
          {etapa === 'gerada' && !erro && !tipoSemModelo && (
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
