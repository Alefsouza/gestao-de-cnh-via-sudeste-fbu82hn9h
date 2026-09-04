import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Loader2,
  Mail,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  deleteCartaCompleta,
  deleteColaboradorCarta,
  getCartaFileUrl,
  listCartas,
  type CartaRecord,
} from '@/services/cartas'

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
  const { user } = useAuth()
  const userRole = ((user?.role as string) || 'Admin').toLowerCase()
  const isTrafego = userRole === 'tráfego' || userRole === 'trafego'
  const canDelete = !isTrafego

  const [cartas, setCartas] = useState<CartaRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedNumeroCarta, setSelectedNumeroCarta] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({})

  // Estados de confirmação e exclusão
  const [deletingCarta, setDeletingCarta] = useState<string | null>(null)
  const [deletingColaborador, setDeletingColaborador] = useState<CartaRecord | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Carrega as cartas sempre que o modal abrir e reseta estados ao abrir/fechar
  useEffect(() => {
    if (!open) {
      setExpandedIds({})
      return
    }
    // Ao abrir, limpa expansões anteriores para que todos venham recolhidos por padrão
    setExpandedIds({})
    let active = true
    setLoading(true)
    listCartas()
      .then((records) => {
        if (!active) return
        setCartas(records)
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
  }, [open])

  // Lista ordenada de todos os números únicos de cartas cadastrados
  const allNumerosCarta = useMemo(() => {
    const set = new Set<string>()
    cartas.forEach((c) => {
      const num = (c.numero_carta || '').trim()
      if (num) set.add(num)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [cartas])

  // Normalizador simples para pesquisa insensível a maiúsculas e acentos
  const normalize = (val: string) =>
    val
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()

  const normalizedQuery = useMemo(() => normalize(searchQuery), [searchQuery])

  // Filtragem combinada das cartas com base na busca por texto
  // (número da carta, nome do colaborador ou registro/matrícula)
  const matchingCartas = useMemo(() => {
    if (!normalizedQuery) return cartas
    return cartas.filter((c) => {
      const numNorm = normalize(c.numero_carta || '')
      const colabNorm = normalize(c.colaborador || '')
      const matNorm = normalize(c.matricula || '')
      const unpaddedMat = normalize((c.matricula || '').replace(/^0+/, ''))
      return (
        numNorm.includes(normalizedQuery) ||
        colabNorm.includes(normalizedQuery) ||
        matNorm.includes(normalizedQuery) ||
        (unpaddedMat && unpaddedMat.includes(normalizedQuery))
      )
    })
  }, [cartas, normalizedQuery])

  // Números de carta disponíveis após aplicar o filtro de pesquisa
  const filteredNumerosCarta = useMemo(() => {
    const set = new Set<string>()
    matchingCartas.forEach((c) => {
      const num = (c.numero_carta || '').trim()
      if (num) set.add(num)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [matchingCartas])

  // Efeito para sincronizar e auto-selecionar o número da carta
  useEffect(() => {
    if (filteredNumerosCarta.length === 0) {
      if (selectedNumeroCarta !== '') {
        setSelectedNumeroCarta('')
      }
      return
    }

    // Se o número atualmente selecionado ainda está presente na lista filtrada, mantém
    if (selectedNumeroCarta && filteredNumerosCarta.includes(selectedNumeroCarta)) {
      return
    }

    // Caso contrário, seleciona o primeiro número da lista filtrada
    setSelectedNumeroCarta(filteredNumerosCarta[0])
  }, [filteredNumerosCarta, selectedNumeroCarta])

  // Colaboradores vinculados à carta selecionada
  const colaboradoresDaCarta = useMemo(() => {
    if (!selectedNumeroCarta) return []
    const list = cartas.filter((c) => (c.numero_carta || '').trim() === selectedNumeroCarta)

    // Se houver busca por texto ativa, destaca e prioriza quem deu match no texto
    if (!normalizedQuery) return list

    return list.filter((c) => {
      const numNorm = normalize(c.numero_carta || '')
      const colabNorm = normalize(c.colaborador || '')
      const matNorm = normalize(c.matricula || '')
      const unpaddedMat = normalize((c.matricula || '').replace(/^0+/, ''))
      // Se a busca deu match no número da carta em si, exibe todos os colaboradores vinculados
      if (numNorm.includes(normalizedQuery)) return true
      return (
        colabNorm.includes(normalizedQuery) ||
        matNorm.includes(normalizedQuery) ||
        (unpaddedMat && unpaddedMat.includes(normalizedQuery))
      )
    })
  }, [cartas, selectedNumeroCarta, normalizedQuery])

  // Reseta os itens expandidos sempre que o número da carta selecionada mudar,
  // garantindo que todos os colaboradores venham recolhidos (collapsed) por padrão
  useEffect(() => {
    setExpandedIds({})
  }, [selectedNumeroCarta])

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const handleOpenDoc = (carta: CartaRecord, filename: string) => {
    if (!carta || !filename) return
    const url = getCartaFileUrl(carta, filename)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleDownloadDoc = (carta: CartaRecord, filename: string) => {
    if (!carta || !filename) return
    const url = getCartaFileUrl(carta, filename, { download: true })
    const win = window.open(url, '_blank')
    if (!win) {
      window.location.href = url
    }
  }

  const handleResetSearch = () => {
    setSearchQuery('')
  }

  // Recarrega as cartas do banco
  const refreshCartas = async () => {
    try {
      const records = await listCartas()
      setCartas(records)
      return records
    } catch (err) {
      console.error('Erro ao atualizar lista de cartas:', err)
      return []
    }
  }

  // Confirmar exclusão da carta inteira
  const handleConfirmDeleteCarta = async () => {
    if (!deletingCarta) return
    setIsDeleting(true)
    const numero = deletingCarta
    try {
      await deleteCartaCompleta(numero)
      toast.success(`Carta N.º ${numero} e seus vínculos foram excluídos com sucesso.`)
      setDeletingCarta(null)
      // Atualiza a lista
      const updated = await refreshCartas()
      // Se não houver mais essa carta, limpa ou seleciona a próxima
      const remainingNumeros = Array.from(
        new Set(updated.map((c) => (c.numero_carta || '').trim()).filter(Boolean)),
      )
      if (selectedNumeroCarta === numero) {
        setSelectedNumeroCarta(remainingNumeros[0] || '')
      }
    } catch (err) {
      console.error('Erro ao excluir carta inteira:', err)
      toast.error('Erro ao excluir a carta. Tente novamente.')
    } finally {
      setIsDeleting(false)
    }
  }

  // Confirmar exclusão de um colaborador da carta
  const handleConfirmDeleteColaborador = async () => {
    if (!deletingColaborador) return
    setIsDeleting(true)
    const colab = deletingColaborador
    try {
      await deleteColaboradorCarta(colab)
      toast.success(
        `Colaborador ${colab.colaborador} (${colab.matricula || 'Sem registro'}) removido da carta com sucesso.`,
      )
      setDeletingColaborador(null)
      // Atualiza a lista
      const updated = await refreshCartas()
      // Verifica se a carta ainda tem outros colaboradores
      const aindaTemNaCarta = updated.some(
        (c) => (c.numero_carta || '').trim() === (colab.numero_carta || '').trim(),
      )
      if (!aindaTemNaCarta) {
        // Se foi o último colaborador da carta, a carta deixou de existir
        const remainingNumeros = Array.from(
          new Set(updated.map((c) => (c.numero_carta || '').trim()).filter(Boolean)),
        )
        setSelectedNumeroCarta(remainingNumeros[0] || '')
      }
    } catch (err) {
      console.error('Erro ao remover colaborador da carta:', err)
      toast.error('Erro ao remover colaborador da carta. Tente novamente.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Cartas Emitidas
          </DialogTitle>
          <DialogDescription>
            Consulte as cartas emitidas no sistema, os colaboradores vinculados e visualize os
            documentos comprobatórios anexados de cada colaborador.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Carregando cartas…
          </div>
        ) : cartas.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma carta cadastrada até o momento.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Campo de pesquisa no topo: filtra por nº da carta, colaborador ou matrícula */}
            <div className="space-y-1.5">
              <Label htmlFor="busca-carta" className="text-xs font-semibold">
                Buscar Carta ou Colaborador
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="busca-carta"
                  type="text"
                  placeholder="Pesquisar por número da carta, nome do colaborador ou registro (matrícula)…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9 text-xs sm:text-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={handleResetSearch}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    title="Limpar pesquisa"
                    aria-label="Limpar pesquisa"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {searchQuery && (
                <p className="text-[11px] text-muted-foreground">
                  Encontrado(s) {filteredNumerosCarta.length} número(s) de carta com{' '}
                  {matchingCartas.length} registro(s) correspondente(s).
                </p>
              )}
            </div>

            {/* Dropdown de Número da Carta: mostra SOMENTE o número da carta + Botão de Excluir Carta Inteira */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="select-carta" className="text-xs font-semibold">
                  Número da Carta
                </Label>
                {selectedNumeroCarta && (
                  <span className="text-[11px] text-muted-foreground">
                    {colaboradoresDaCarta.length} colaborador(es) vinculado(s)
                  </span>
                )}
              </div>

              {filteredNumerosCarta.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                  Nenhuma carta encontrada para a busca &quot;{searchQuery}&quot;.
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <Select
                      value={selectedNumeroCarta}
                      onValueChange={(val) => {
                        setSelectedNumeroCarta(val)
                      }}
                    >
                      <SelectTrigger id="select-carta" className="font-medium">
                        <SelectValue placeholder="Selecione o número da carta" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {filteredNumerosCarta.map((numero) => (
                          <SelectItem key={numero} value={numero} className="font-mono">
                            {numero}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedNumeroCarta && canDelete && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setDeletingCarta(selectedNumeroCarta)}
                      disabled={isDeleting}
                      className="h-10 gap-1.5 px-3 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive flex-none"
                      title={`Excluir a carta nº ${selectedNumeroCarta} inteira e todos os vínculos`}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Excluir Carta Inteira</span>
                      <span className="sm:hidden">Excluir Carta</span>
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Lista de colaboradores vinculados à carta selecionada */}
            {selectedNumeroCarta && colaboradoresDaCarta.length > 0 && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-foreground">
                      Colaboradores Vinculados à Carta Nº {selectedNumeroCarta}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[11px] font-normal">
                    {colaboradoresDaCarta.length}{' '}
                    {colaboradoresDaCarta.length === 1 ? 'colaborador' : 'colaboradores'}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {colaboradoresDaCarta.map((item) => {
                    const isExpanded = !!expandedIds[item.id]
                    const registroTexto = item.matricula || 'Sem registro'
                    const labelPrincipal = `${registroTexto} - ${item.colaborador}`

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'rounded-lg border transition-all duration-150',
                          isExpanded
                            ? 'border-primary/40 bg-card shadow-sm'
                            : 'bg-muted/30 hover:bg-muted/50',
                        )}
                      >
                        {/* Cabeçalho do item clicável para colapsar/expandir */}
                        <button
                          type="button"
                          onClick={() => toggleExpand(item.id)}
                          aria-expanded={isExpanded}
                          className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary/10 text-primary">
                              <UserCheck className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="font-semibold text-xs sm:text-sm text-foreground truncate">
                                {labelPrincipal}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {item.funcao_carta || 'Função não informada'} · Tipo:{' '}
                                {item.tipo_carta || '—'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-none">
                            <span className="text-[11px] text-muted-foreground hidden sm:inline">
                              {isExpanded ? 'Ocultar detalhes' : 'Ver detalhes'}
                            </span>
                            {/* Botão para remover este colaborador da carta */}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDeletingColaborador(item)
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-destructive/20 text-destructive/80 transition-colors hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
                                title={`Remover ${item.colaborador} da carta`}
                                aria-label={`Remover ${item.colaborador} da carta`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </button>

                        {/* Conteúdo expandido: dados da carta + 5 documentos anexados */}
                        {isExpanded && (
                          <div className="border-t p-3.5 space-y-4 bg-muted/10">
                            {/* Informações detalhadas */}
                            <div className="rounded-lg border bg-background/80 p-3 text-xs">
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                <div>
                                  <span className="text-muted-foreground">Nome:</span>
                                  <p className="font-semibold text-foreground">
                                    {item.colaborador}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">
                                    Registro / Matrícula:
                                  </span>
                                  <p className="font-semibold text-foreground">
                                    {item.matricula || '—'}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Função - Carta:</span>
                                  <p className="font-semibold text-foreground">
                                    {item.funcao_carta || '—'}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Tipo de Carta:</span>
                                  <p className="font-semibold text-primary">
                                    {item.tipo_carta || '—'}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Nº da Carta:</span>
                                  <p className="font-semibold text-foreground">
                                    {item.numero_carta}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Data de Emissão:</span>
                                  <p className="text-foreground">{formatDate(item.created)}</p>
                                </div>
                              </div>
                            </div>
                            {/* Lista dos 5 documentos anexados */}
                            <div className="space-y-2 rounded-lg border bg-background/80 p-3">
                              <div className="flex items-center gap-2 border-b pb-2 text-xs font-bold text-foreground">
                                <FileCheck2 className="h-4 w-4 text-primary" />
                                <span>Documentos Anexados</span>
                              </div>

                              <div className="space-y-2 pt-1">
                                {DOCUMENT_FIELDS.map(({ key, label }) => {
                                  const filename = String(item[key] || '')
                                  return (
                                    <div
                                      key={key}
                                      className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between rounded-md bg-muted/20 p-2.5 text-xs border"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <FileText className="h-4 w-4 flex-none text-muted-foreground" />
                                        <div className="min-w-0">
                                          <span className="font-semibold text-foreground">
                                            {label}
                                          </span>
                                          {filename ? (
                                            <p className="text-[11px] text-muted-foreground truncate max-w-xs sm:max-w-sm">
                                              {filename}
                                            </p>
                                          ) : (
                                            <p className="text-[11px] text-rose-500 italic">
                                              Arquivo não localizado
                                            </p>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1.5 self-end sm:self-auto flex-none">
                                        {filename ? (
                                          <>
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              onClick={() => handleOpenDoc(item, filename)}
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
                                              onClick={() => handleDownloadDoc(item, filename)}
                                              className="h-7 gap-1 px-2 text-xs"
                                              title="Baixar arquivo"
                                            >
                                              <Download className="h-3 w-3" />
                                              Baixar
                                            </Button>
                                          </>
                                        ) : (
                                          <span className="text-[11px] text-muted-foreground italic">
                                            —
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                            {/* Botão de rodapé do card expandido para remover este colaborador */}
                            {canDelete && (
                              <div className="flex justify-end pt-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setDeletingColaborador(item)}
                                  disabled={isDeleting}
                                  className="h-8 gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Remover colaborador da carta
                                </Button>
                              </div>
                            )}{' '}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {selectedNumeroCarta && colaboradoresDaCarta.length === 0 && (
              <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                Nenhum colaborador encontrado para a carta nº {selectedNumeroCarta} com os filtros
                aplicados.
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

      {/* Confirmação de exclusão da CARTA INTEIRA */}
      <AlertDialog
        open={deletingCarta !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && !isDeleting) setDeletingCarta(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a carta inteira?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Deseja realmente excluir a carta <strong>N.º {deletingCarta}</strong> e todos os{' '}
                <strong>{colaboradoresDaCarta.length}</strong> colaborador(es) vinculado(s),
                juntamente com seus anexos?
              </p>
              <p className="text-xs text-muted-foreground">
                Os processos cadastrais correspondentes voltarão à situação anterior à emissão da
                carta para regularização na listagem principal. Esta ação não pode ser desfeita.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void handleConfirmDeleteCarta()
              }}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo…
                </>
              ) : (
                'Excluir Carta Inteira'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de exclusão de UM COLABORADOR da carta */}
      <AlertDialog
        open={deletingColaborador !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && !isDeleting) setDeletingColaborador(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover colaborador da carta?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Remover o colaborador{' '}
                <strong className="text-foreground">{deletingColaborador?.colaborador}</strong>{' '}
                (Registro {deletingColaborador?.matricula || 'Sem registro'}) da carta{' '}
                <strong>N.º {deletingColaborador?.numero_carta}</strong>?
              </p>
              <p className="text-xs text-muted-foreground">
                A carta e os demais colaboradores vinculados permanecem. O processo cadastral deste
                colaborador voltará à situação anterior à emissão da carta para regularização.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void handleConfirmDeleteColaborador()
              }}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removendo…
                </>
              ) : (
                'Remover Colaborador'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
