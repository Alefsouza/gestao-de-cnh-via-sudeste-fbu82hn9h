import { useEffect, useMemo, useState } from 'react'
import { FileText, Loader2, Printer, RotateCcw, Search, X } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Employee } from '@/lib/types'
import { listAllEmployees } from '@/services/employees'
import { getProximoNumeroCartaSequencial } from '@/services/cartas'
import { persistirCartaGerada, registrarCartaNaTimeline } from '@/services/cartasGeradas'
import { labelTipoCartaParaModelo } from '@/lib/cartaModelos'
import type { ProcessoCadastralRecord } from '@/lib/types'
import {
  CARTA_MODELOS,
  gerarCartaHtml,
  getCartaModelo,
  type CartaGeradaDados,
  type CartaModeloId,
} from '@/lib/cartaModelos'

interface GerarCartaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Colaboradores já carregados na tela de processos (opcional). */
  employees?: Employee[]
  /** Processos da tela — usado para registrar a carta na timeline do processo. */
  processos?: ProcessoCadastralRecord[]
  onSuccess?: () => void
}

type Etapa = 'tipo' | 'campos' | 'gerada'

/** Modelos que exigem uma etapa compacta de campos antes de gerar. */
const MODELO_EXIGE_CAMPOS: Record<CartaModeloId, boolean> = {
  inss_retorno: false,
  inss_afastados: true,
  prat: true,
}

interface LinhaColaborador {
  employeeId?: string
  nome: string
  registro: string
  funcao: string
  cpf: string
  filial: string
  dataAfastamento: string
}

function employeeParaLinha(e: Employee): LinhaColaborador {
  return {
    employeeId: e.id,
    nome: e.name || '',
    registro: e.registro || e.chapa || '',
    funcao: e.funcao || '',
    cpf: e.cpf || '',
    filial: e.filial || '',
    dataAfastamento: e.inicio_afastamento || e.data_afastamento || '',
  }
}

export default function GerarCartaModal({
  open,
  onOpenChange,
  employees,
  processos,
  onSuccess,
}: GerarCartaModalProps) {
  const [etapa, setEtapa] = useState<Etapa>('tipo')
  const [modeloId, setModeloId] = useState<CartaModeloId | null>(null)
  const [baseColaboradores, setBaseColaboradores] = useState<Employee[]>(() => employees ?? [])
  const [busca, setBusca] = useState('')
  const [selecionadas, setSelecionadas] = useState<LinhaColaborador[]>([])
  const [numeroCarta, setNumeroCarta] = useState('')
  const [dataRetorno, setDataRetorno] = useState('')
  const [prefixoVeiculo, setPrefixoVeiculo] = useState('')
  const [dataSinistro, setDataSinistro] = useState('')
  const [saving, setSaving] = useState(false)
  const [htmlPreview, setHtmlPreview] = useState('')

  const modelo = modeloId ? getCartaModelo(modeloId) : null
  const exigeCampos = modeloId ? MODELO_EXIGE_CAMPOS[modeloId] : false

  // Reset quando abre/fecha
  useEffect(() => {
    if (open) {
      setEtapa('tipo')
      setModeloId(null)
      setSelecionadas([])
      setBusca('')
      setDataRetorno('')
      setPrefixoVeiculo('')
      setDataSinistro('')
      setHtmlPreview('')
      void getProximoNumeroCartaSequencial()
        .then(setNumeroCarta)
        .catch(() => {})
    }
  }, [open])

  // Garante a base de colaboradores mesmo sem prop employees
  useEffect(() => {
    if (!open) return
    if (employees && employees.length > 0) {
      setBaseColaboradores(employees)
      return
    }
    let cancelled = false
    listAllEmployees({ excludeDesligados: true })
      .then((items) => {
        if (!cancelled) setBaseColaboradores(items)
      })
      .catch(() => {
        // silencioso
      })
    return () => {
      cancelled = true
    }
  }, [open, employees])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return baseColaboradores.slice(0, 30)
    return baseColaboradores
      .filter(
        (e) =>
          (e.name || '').toLowerCase().includes(q) ||
          (e.chapa || '').toLowerCase().includes(q) ||
          (e.registro || '').includes(q) ||
          (e.cpf || '').includes(q),
      )
      .slice(0, 30)
  }, [baseColaboradores, busca])

  /** Validação da etapa compacta de campos (Afastados INSS / PRAT). */
  const camposValidos = useMemo(() => {
    if (!exigeCampos) return true
    if (selecionadas.length === 0) return false
    if (modelo?.multiplicidade === 'single' && selecionadas.length !== 1) return false
    if (modeloId === 'inss_afastados') {
      return selecionadas.every((l) => !!l.dataAfastamento.trim())
    }
    if (modeloId === 'prat') {
      return !!prefixoVeiculo.trim() && !!dataSinistro.trim()
    }
    return true
  }, [exigeCampos, selecionadas, modelo, modeloId, prefixoVeiculo, dataSinistro])

  const podeGerar = !!modeloId && (!exigeCampos || camposValidos)

  function toggleColaborador(e: Employee) {
    const linha = employeeParaLinha(e)
    setSelecionadas((prev) => {
      const exists = prev.some((p) => p.registro === linha.registro && p.nome === linha.nome)
      if (exists) {
        return prev.filter((p) => !(p.registro === linha.registro && p.nome === linha.nome))
      }
      if (modelo?.multiplicidade === 'single') return [linha]
      return [...prev, linha]
    })
  }

  function atualizarLinha(registro: string, campo: 'dataAfastamento', valor: string) {
    setSelecionadas((prev) =>
      prev.map((l) => (l.registro === registro ? { ...l, [campo]: valor } : l)),
    )
  }

  function montarDados(): CartaGeradaDados {
    return {
      modelo: (modeloId ?? 'inss_retorno') as CartaModeloId,
      numeroCarta: numeroCarta.trim(),
      dataRetorno: dataRetorno,
      prefixoVeiculo: prefixoVeiculo,
      dataSinistro: dataSinistro,
      colaboradores: selecionadas.map((l) => ({
        employeeId: l.employeeId,
        nome: l.nome,
        registro: l.registro,
        funcao: l.funcao,
        cpf: l.cpf,
        grupo: l.filial,
        dataAfastamento: l.dataAfastamento,
      })),
    }
  }

  /** Gera (e registra) a carta: grava na coleção `cartas`, atualiza timelines
   *  e exibe a pré-visualização A4 com o botão de imprimir. */
  async function gerarCarta() {
    if (!modeloId || !podeGerar || saving) return
    setSaving(true)
    try {
      const dados = montarDados()
      setHtmlPreview(gerarCartaHtml(dados))

      const detalhe = await persistirCartaGerada({
        modelo: modeloId,
        numeroCarta: dados.numeroCarta,
        colaboradores: dados.colaboradores,
        dataRetorno: dataRetorno || undefined,
        prefixoVeiculo: prefixoVeiculo || undefined,
        dataSinistro: dataSinistro || undefined,
      })

      // Integração: registra a carta gerada na timeline dos processos do colaborador
      const tipoCartaLabel = labelTipoCartaParaModelo(modeloId)
      for (const l of selecionadas) {
        const proc = processos?.find((p) => p.matricula === l.registro || p.colaborador === l.nome)
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
      setEtapa('gerada')
    } catch (err) {
      console.error('Erro ao salvar carta gerada:', err)
      toast.error('Não foi possível registrar a carta. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  function imprimirCarta() {
    const html = htmlPreview || gerarCartaHtml(montarDados())
    const win = window.open('', '_blank', 'width=900,height=1000')
    if (!win) {
      toast.error('Permita pop-ups para visualizar e imprimir a carta.')
      return
    }
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
    }, 300)
  }

  const subtituloEtapa: Record<Etapa, string> = {
    tipo: 'Escolha o tipo de carta',
    campos: 'Dados da carta',
    gerada: 'Carta gerada',
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Gerar Carta{modelo ? ` — ${modelo.nome}` : ''}
          </DialogTitle>
          <DialogDescription>
            {subtituloEtapa[etapa]} · Gera as cartas oficiais da Via Sudeste enviadas à SPTrans com
            os dados reais do cadastro.
          </DialogDescription>
        </DialogHeader>

        {/* ETAPA 1 — Tipo de carta (único passo obrigatório) */}
        {etapa === 'tipo' && (
          <div className="grid gap-2 py-1">
            {CARTA_MODELOS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModeloId(m.id)}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/[0.04]',
                  modeloId === m.id && 'border-primary bg-primary/[0.06] ring-1 ring-primary',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{m.nome}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {m.multiplicidade === 'multi' ? 'vários colaboradores' : '1 colaborador'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{m.descricao}</p>
              </button>
            ))}
            <div className="mt-1 flex items-end justify-between gap-3">
              <div className="w-56 space-y-1.5">
                <Label htmlFor="numero-carta-gerada" className="text-xs font-semibold">
                  Número da carta
                </Label>
                <Input
                  id="numero-carta-gerada"
                  value={numeroCarta}
                  onChange={(e) => setNumeroCarta(e.target.value)}
                  placeholder="Ex.: 289/26 ou RH 276/22"
                  className="h-9"
                />
              </div>
              <p className="pb-1 text-[11px] text-muted-foreground">
                Numeração sequencial do sistema — pode ser editada (ex.: RH 276/22).
              </p>
            </div>
          </div>
        )}

        {/* ETAPA 2 — Campos específicos (apenas para Afastados INSS e PRAT) */}
        {etapa === 'campos' && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {/* Seleção compacta de colaboradores */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, registro, CPF…"
                className="pl-9"
              />
            </div>

            {selecionadas.length > 0 && (
              <div className="space-y-2 rounded-lg border p-2">
                {selecionadas.map((l) => (
                  <div
                    key={`${l.registro}-${l.nome}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {l.registro} — {l.nome}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {l.funcao || '—'} · CPF {l.cpf || '—'} · {l.filial || '—'}
                      </p>
                    </div>
                    {modeloId === 'inss_afastados' && (
                      <Input
                        type="date"
                        value={l.dataAfastamento}
                        onChange={(e) =>
                          atualizarLinha(l.registro, 'dataAfastamento', e.target.value)
                        }
                        className="h-8 w-36 flex-none"
                        aria-label={`Data de afastamento de ${l.nome}`}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setSelecionadas((prev) =>
                          prev.filter((p) => !(p.registro === l.registro && p.nome === l.nome)),
                        )
                      }
                      className="flex-none rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label={`Remover ${l.nome}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="max-h-56 flex-1 overflow-y-auto rounded-lg border">
              {filtrados.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Nenhum colaborador encontrado.
                </div>
              ) : (
                filtrados.map((e) => {
                  const isSel = selecionadas.some(
                    (p) => p.registro === (e.registro || e.chapa) && p.nome === (e.name || ''),
                  )
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => toggleColaborador(e)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-xs last:border-b-0 hover:bg-muted/60',
                        isSel && 'bg-primary/[0.07]',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{e.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          Reg. {e.registro || e.chapa} · {e.funcao || '—'} · {e.filial || '—'}
                        </p>
                      </div>
                      {isSel && (
                        <span className="flex-none text-[11px] font-semibold text-primary">
                          Selecionado
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {/* Campos do PRAT */}
            {modeloId === 'prat' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="prefixo-veiculo" className="text-xs font-semibold">
                    Prefixo do veículo
                  </Label>
                  <Input
                    id="prefixo-veiculo"
                    value={prefixoVeiculo}
                    onChange={(e) => setPrefixoVeiculo(e.target.value)}
                    placeholder="Ex.: 51042"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="data-sinistro" className="text-xs font-semibold">
                    Data do sinistro
                  </Label>
                  <Input
                    id="data-sinistro"
                    type="date"
                    value={dataSinistro}
                    onChange={(e) => setDataSinistro(e.target.value)}
                  />
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              {modeloId === 'inss_afastados' && (
                <>
                  Informe a data de afastamento de cada colaborador selecionado. Este modelo aceita
                  vários colaboradores na mesma carta.
                </>
              )}
              {modeloId === 'prat' && (
                <>Selecione 1 colaborador e informe o prefixo do veículo e a data do sinistro.</>
              )}
              {!exigeCampos && <>Preencha os dados e clique em Gerar Carta.</>}
            </p>
          </div>
        )}

        {/* ETAPA 3 — Pré-visualização A4 + imprimir (após gerar) */}
        {etapa === 'gerada' && (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div
              className="min-h-0 flex-1 overflow-auto rounded-lg border bg-white p-2"
              style={{ maxHeight: '46vh' }}
            >
              <iframe
                title="Pré-visualização da carta"
                srcDoc={htmlPreview}
                className="h-[46vh] w-full rounded border"
                sandbox="allow-same-origin"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              A impressão sai em formato A4, sem elementos extras de tela (use "Salvar como PDF" na
              janela de impressão do navegador).
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {etapa === 'tipo' && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Fechar
              </Button>
              <Button type="button" onClick={gerarCarta} disabled={!modeloId || saving}>
                {saving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-1.5 h-4 w-4" />
                )}
                Gerar Carta
              </Button>
            </>
          )}

          {etapa === 'campos' && (
            <>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEtapa('tipo')}
                  disabled={saving}
                >
                  Voltar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                >
                  Fechar
                </Button>
              </div>
              <Button type="button" onClick={gerarCarta} disabled={!podeGerar || saving}>
                {saving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-1.5 h-4 w-4" />
                )}
                Gerar Carta
              </Button>
            </>
          )}

          {etapa === 'gerada' && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEtapa('tipo')
                  setModeloId(null)
                  setSelecionadas([])
                  setHtmlPreview('')
                }}
                disabled={saving}
              >
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Gerar outra carta
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={imprimirCarta} disabled={saving}>
                  <Printer className="mr-1.5 h-4 w-4" />
                  Imprimir / Salvar PDF
                </Button>
                <Button type="button" onClick={() => onOpenChange(false)} disabled={saving}>
                  Fechar
                </Button>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
