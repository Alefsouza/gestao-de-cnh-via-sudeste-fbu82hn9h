import { useEffect, useMemo, useState } from 'react'
import {
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Loader2,
  Mail,
  UserCheck,
} from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDate } from '@/lib/format'
import { getCartaFileUrl, listCartas, type CartaRecord } from '@/services/cartas'

interface VisualizarCartasModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DOCUMENT_FIELDS: { key: keyof CartaRecord; label: string }[] = [
  { key: 'cnh', label: 'CNH' },
  { key: 'prontuario', label: 'Prontuário' },
  { key: 'comprovante_residencia', label: 'Comprovante de Residência' },
  { key: 'atestado', label: 'Atestado' },
  { key: 'doc_assinado_gestora', label: 'Doc. Assinado pela Gestora' },
]

export default function VisualizarCartasModal({ open, onOpenChange }: VisualizarCartasModalProps) {
  const [cartas, setCartas] = useState<CartaRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedCartaId, setSelectedCartaId] = useState<string>('')

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    listCartas()
      .then((records) => {
        if (!active) return
        setCartas(records)
        if (records.length > 0 && !selectedCartaId) {
          setSelectedCartaId(records[0].id)
        }
      })
      .catch((err) => {
        console.error('Erro ao listar cartas:', err)
        toast.error('Não foi possível carregar a lista de cartas.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [open, selectedCartaId])

  const selectedCarta = useMemo(
    () => cartas.find((c) => c.id === selectedCartaId) || null,
    [cartas, selectedCartaId],
  )

  const handleOpenDoc = (filename: string) => {
    if (!selectedCarta || !filename) return
    const url = getCartaFileUrl(selectedCarta, filename)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleDownloadDoc = (filename: string) => {
    if (!selectedCarta || !filename) return
    const url = getCartaFileUrl(selectedCarta, filename, { download: true })
    // Abre a URL em nova aba com o parâmetro de download para que o navegador lide com o download sem tocar no DOM
    const win = window.open(url, '_blank')
    if (!win) {
      window.location.href = url
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Cartas Emitidas
          </DialogTitle>
          <DialogDescription>
            Consulte as cartas emitidas no sistema, o colaborador vinculado e visualize os
            documentos comprobatórios anexados.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Carregando cartas…
          </div>
        ) : cartas.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma carta cadastrada até o momento.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Seletor de Carta */}
            <div className="space-y-2">
              <Label htmlFor="select-carta" className="text-xs font-semibold">
                Número da Carta
              </Label>
              <Select value={selectedCartaId} onValueChange={(val) => setSelectedCartaId(val)}>
                <SelectTrigger id="select-carta">
                  <SelectValue placeholder="Selecione o número da carta" />
                </SelectTrigger>
                <SelectContent>
                  {cartas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      Nº {c.numero_carta} — {c.colaborador} {c.matricula ? `(${c.matricula})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedCarta && (
              <div className="space-y-4">
                {/* Dados do Colaborador vinculado */}
                <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-foreground border-b pb-1.5">
                    <UserCheck className="h-4 w-4 text-emerald-600" />
                    <span>Colaborador Vinculado à Carta</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <div>
                      <span className="text-muted-foreground">Nome:</span>
                      <p className="font-semibold text-foreground">{selectedCarta.colaborador}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Registro / Matrícula:</span>
                      <p className="font-semibold text-foreground">
                        {selectedCarta.matricula || '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Função - Carta:</span>
                      <p className="font-semibold text-foreground">
                        {selectedCarta.funcao_carta || '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Tipo de Carta:</span>
                      <p className="font-semibold text-primary">
                        {selectedCarta.tipo_carta || '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Nº da Carta:</span>
                      <p className="font-semibold text-foreground">{selectedCarta.numero_carta}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Data de Emissão:</span>
                      <p className="text-foreground">{formatDate(selectedCarta.created)}</p>
                    </div>
                  </div>
                </div>

                {/* Lista dos 5 documentos anexados */}
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2 border-b pb-2 text-xs font-bold text-foreground">
                    <FileCheck2 className="h-4 w-4 text-primary" />
                    <span>Documentos Anexados</span>
                  </div>

                  <div className="space-y-2 pt-1">
                    {DOCUMENT_FIELDS.map(({ key, label }) => {
                      const filename = String(selectedCarta[key] || '')
                      return (
                        <div
                          key={key}
                          className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between rounded-md bg-muted/20 p-2.5 text-xs border"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 flex-none text-muted-foreground" />
                            <div>
                              <span className="font-semibold text-foreground">{label}</span>
                              {filename ? (
                                <p className="text-[11px] text-muted-foreground truncate max-w-xs">
                                  {filename}
                                </p>
                              ) : (
                                <p className="text-[11px] text-rose-500 italic">
                                  Arquivo não localizado
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 self-end sm:self-auto">
                            {filename ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenDoc(filename)}
                                  className="h-7 gap-1 px-2 text-xs"
                                  title="Abrir / Visualizar em nova aba"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Visualizar
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDownloadDoc(filename)}
                                  className="h-7 gap-1 px-2 text-xs"
                                  title="Baixar arquivo"
                                >
                                  <Download className="h-3 w-3" />
                                  Baixar
                                </Button>
                              </>
                            ) : (
                              <span className="text-[11px] text-muted-foreground italic">—</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
