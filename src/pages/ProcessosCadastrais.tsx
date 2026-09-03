import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  ClipboardList,
  FilePlus2,
  FileSearch,
  FileX2,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import NovaMovimentacaoModal from '@/components/NovaMovimentacaoModal'
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
import { useRealtime } from '@/hooks/use-realtime'
import { formatDate } from '@/lib/format'
import { listAllEmployees } from '@/services/employees'
import { createMovement } from '@/services/movements'
import type { Employee } from '@/lib/types'
import { cn } from '@/lib/utils'

// Categorias exibidas nos cards de resumo (ordem exata solicitada)
const CATEGORIAS = [
  'Inclusão',
  'Alteração',
  'Exclusão',
  'Atualização',
  'Atualização Fiscal',
] as const
type Categoria = (typeof CATEGORIAS)[number]

const CATEGORIAS_SPTRANS: Record<Categoria, string> = {
  Inclusão: 'Inclusão',
  Alteração: 'Alteração',
  Exclusão: 'Exclusão',
  Atualização: 'Atualização',
  'Atualização Fiscal': 'Atualização Fiscal',
}

const CARD_STYLES: Record<
  Categoria,
  { icon: typeof Plus; ring: string; bg: string; text: string }
> = {
  Inclusão: {
    icon: Plus,
    ring: 'border-emerald-200',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
  },
  Alteração: {
    icon: RefreshCcw,
    ring: 'border-amber-200',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
  },
  Exclusão: { icon: FileX2, ring: 'border-rose-200', bg: 'bg-rose-50', text: 'text-rose-700' },
  Atualização: { icon: RefreshCcw, ring: 'border-sky-200', bg: 'bg-sky-50', text: 'text-sky-700' },
  'Atualização Fiscal': {
    icon: FileSearch,
    ring: 'border-violet-200',
    bg: 'bg-violet-50',
    text: 'text-violet-700',
  },
}

const ETAPAS = [
  'Documentos solicitados',
  'Aguardando documentos',
  'Em conferência',
  'Concluído',
] as const
type Etapa = (typeof ETAPAS)[number]

const SITUACOES_VALIDAS = ['Pendente', 'Bloqueado', 'Regular'] as const
type Situacao = (typeof SITUACOES_VALIDAS)[number]

const SITUACAO_STYLES: Record<Situacao, string> = {
  Pendente: 'bg-orange-100 text-orange-700 border-orange-200',
  Bloqueado: 'bg-red-100 text-red-700 border-red-200',
  Regular: 'bg-green-100 text-green-700 border-green-200',
}

interface ProcessoCadastral {
  id: string
  matricula: string
  colaborador: string
  funcao: string
  processo: Categoria
  etapa: Etapa
  prazo: string
  situacao: Situacao
}

// Dados de exemplo (genéricos, realistas) — cobrem os 5 tipos e várias etapas/situações
const SEED: Omit<ProcessoCadastral, 'id'>[] = [
  {
    matricula: '10012',
    colaborador: 'Carlos Eduardo Ramos',
    funcao: 'Motorista',
    processo: 'Inclusão',
    etapa: 'Documentos solicitados',
    prazo: '2026-09-10',
    situacao: 'Pendente',
  },
  {
    matricula: '10015',
    colaborador: 'Ana Paula Ferreira',
    funcao: 'Fiscal de Viajem',
    processo: 'Alteração',
    etapa: 'Aguardando documentos',
    prazo: '2026-09-05',
    situacao: 'Pendente',
  },
  {
    matricula: '10018',
    colaborador: 'Marcos Vinícius Alves',
    funcao: 'Motorista',
    processo: 'Exclusão',
    etapa: 'Em conferência',
    prazo: '2026-08-28',
    situacao: 'Bloqueado',
  },
  {
    matricula: '10021',
    colaborador: 'Juliana Castro Lima',
    funcao: 'Auxiliar Administrativo',
    processo: 'Atualização',
    etapa: 'Documentos solicitados',
    prazo: '2026-09-12',
    situacao: 'Pendente',
  },
  {
    matricula: '10025',
    colaborador: 'Rafael Souza Gomes',
    funcao: 'Motorista',
    processo: 'Atualização Fiscal',
    etapa: 'Em conferência',
    prazo: '2026-09-01',
    situacao: 'Regular',
  },
  {
    matricula: '10028',
    colaborador: 'Patrícia Menezes Silva',
    funcao: 'Fiscal de Viajem',
    processo: 'Inclusão',
    etapa: 'Aguardando documentos',
    prazo: '2026-09-08',
    situacao: 'Bloqueado',
  },
  {
    matricula: '10032',
    colaborador: 'Diego Almeida Costa',
    funcao: 'Motorista',
    processo: 'Alteração',
    etapa: 'Concluído',
    prazo: '2026-08-20',
    situacao: 'Regular',
  },
  {
    matricula: '10035',
    colaborador: 'Fernanda Ribeiro Dias',
    funcao: 'Auxiliar Administrativo',
    processo: 'Exclusão',
    etapa: 'Concluído',
    prazo: '2026-08-15',
    situacao: 'Regular',
  },
  {
    matricula: '10038',
    colaborador: 'Rodrigo Martins Pires',
    funcao: 'Motorista',
    processo: 'Atualização',
    etapa: 'Em conferência',
    prazo: '2026-09-03',
    situacao: 'Regular',
  },
  {
    matricula: '10041',
    colaborador: 'Camila Nogueira Farias',
    funcao: 'Fiscal de Viajem',
    processo: 'Atualização Fiscal',
    etapa: 'Documentos solicitados',
    prazo: '2026-09-14',
    situacao: 'Pendente',
  },
]

const DRAFTS_KEY = 'processos-cadastrais:drafts'
const SEED_KEY = 'processos-cadastrais:seed-v1'

const ETAPA_INICIAL: Etapa = 'Documentos solicitados'

export default function ProcessosCadastrais() {
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProcesso, setEditingProcesso] = useState<ProcessoCadastral | null>(null)
  const [deletingProcesso, setDeletingProcesso] = useState<ProcessoCadastral | null>(null)
  const [processos, setProcessos] = useState<ProcessoCadastral[]>([])
  const [selectedCategoria, setSelectedCategoria] = useState<Categoria | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])

  // Carrega base local (seed + rascunhos) e a lista de colaboradores do banco
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [savedSeed, savedDrafts] = await Promise.all([
          localStorage.getItem(SEED_KEY),
          localStorage.getItem(DRAFTS_KEY),
        ])
        const base: ProcessoCadastral[] = savedSeed
          ? (JSON.parse(savedSeed) as ProcessoCadastral[])
          : SEED.map((item, index) => ({ ...item, id: `seed-${index + 1}` }))
        const drafts: ProcessoCadastral[] = savedDrafts
          ? (JSON.parse(savedDrafts) as ProcessoCadastral[])
          : []
        if (!cancelled) {
          setProcessos([...drafts, ...base])
          if (!savedSeed) localStorage.setItem(SEED_KEY, JSON.stringify(base))
        }
      } catch {
        if (!cancelled)
          setProcessos(SEED.map((item, index) => ({ ...item, id: `seed-${index + 1}` })))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Base de colaboradores do banco para o autocomplete do formulário
  useEffect(() => {
    let cancelled = false
    listAllEmployees()
      .then((items) => {
        if (!cancelled) setEmployees(items)
      })
      .catch(() => {
        // silencioso
      })
    return () => {
      cancelled = true
    }
  }, [])

  useRealtime('movements', () => {
    // mantém a base sincronizada caso outra tela crie movimentações
    listAllEmployees()
      .then((items) => setEmployees(items))
      .catch(() => {
        // silencioso
      })
  })

  const resumo = useMemo(() => {
    const counts = Object.fromEntries(CATEGORIAS.map((categoria) => [categoria, 0])) as Record<
      Categoria,
      number
    >
    processos.forEach((processo) => {
      if (processo.processo in counts) counts[processo.processo] += 1
    })
    return counts
  }, [processos])

  const handleCreate = useCallback(
    async (data: {
      processo: Categoria
      matricula: string
      nome: string
      funcao: string
      prazo: string
      employeeId?: string
    }) => {
      const novo: ProcessoCadastral = {
        id: `local-${Date.now()}`,
        matricula: data.matricula,
        colaborador: data.nome,
        funcao: data.funcao,
        processo: data.processo,
        etapa: ETAPA_INICIAL,
        prazo: data.prazo,
        situacao: 'Pendente',
      }

      setProcessos((prev) => {
        const next = [novo, ...prev]
        try {
          localStorage.setItem(SEED_KEY, JSON.stringify(next))
        } catch {
          // silencioso
        }
        return next
      })

      // Persiste também como movimentação no banco (quando há colaborador vinculado)
      if (data.employeeId) {
        try {
          await createMovement({
            employee: data.employeeId,
            type: data.processo as never,
            date: data.prazo
              ? new Date(`${data.prazo}T12:00:00`).toISOString()
              : new Date().toISOString(),
            notes: `Processo cadastral ${data.processo} — matrícula ${data.matricula}`,
          })
        } catch {
          // silencioso: processo local já registrado
        }
      }

      toast.success('Processo cadastrado com sucesso')
    },
    [],
  )

  const handleUpdate = useCallback(
    async (data: {
      id: string
      processo: Categoria
      matricula: string
      nome: string
      funcao: string
      prazo: string
      employeeId?: string
    }) => {
      setProcessos((prev) => {
        const next = prev.map((item) => {
          if (item.id === data.id) {
            return {
              ...item,
              matricula: data.matricula,
              colaborador: data.nome,
              funcao: data.funcao,
              processo: data.processo,
              prazo: data.prazo,
            }
          }
          return item
        })
        try {
          localStorage.setItem(SEED_KEY, JSON.stringify(next))
        } catch {
          // silencioso
        }
        return next
      })

      toast.success('Processo atualizado com sucesso')
    },
    [],
  )

  const handleDelete = useCallback((processo: ProcessoCadastral) => {
    setProcessos((prev) => {
      const next = prev.filter((p) => p.id !== processo.id)
      try {
        localStorage.setItem(SEED_KEY, JSON.stringify(next))
      } catch {
        // silencioso
      }
      return next
    })
    setDeletingProcesso(null)
    toast.success('Processo excluído com sucesso')
  }, [])

  const handleCategoryClick = (categoria: Categoria) => {
    if (selectedCategoria === categoria) {
      setSelectedCategoria(null)
    } else {
      setSelectedCategoria(categoria)
    }
  }

  const filteredProcessos = useMemo(() => {
    if (!selectedCategoria) return processos
    return processos.filter((p) => p.processo === selectedCategoria)
  }, [processos, selectedCategoria])

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Processos Cadastrais</h1>
            <p className="text-xs text-muted-foreground">
              {processos.length} processo(s) cadastrado(s)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Novo processo
        </button>
      </div>

      {/* Cards de resumo clicáveis */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {CATEGORIAS.map((categoria) => {
          const style = CARD_STYLES[categoria]
          const Icon = style.icon
          const isSelected = selectedCategoria === categoria
          return (
            <button
              key={categoria}
              type="button"
              onClick={() => handleCategoryClick(categoria)}
              className={cn(
                'group flex flex-col rounded-xl border bg-white p-4 text-left shadow-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:shadow-md cursor-pointer',
                style.ring,
                isSelected && 'ring-2 ring-primary border-primary bg-primary/[0.03]',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{categoria}</span>
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg transition-transform group-hover:scale-105',
                    style.bg,
                  )}
                >
                  <Icon className={cn('h-4 w-4', style.text)} />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{resumo[categoria]}</p>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">processos</p>
                {isSelected && (
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] font-semibold text-primary">
                    Filtrando
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Tabela de processos */}
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Processos cadastrados</h2>
            {selectedCategoria && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                Filtro: {selectedCategoria}
                <button
                  type="button"
                  onClick={() => setSelectedCategoria(null)}
                  className="hover:text-primary/70 font-bold ml-0.5"
                  title="Limpar filtro"
                >
                  ×
                </button>
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            Exibindo {filteredProcessos.length} de {processos.length} registro(s)
          </span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">REGISTRO</th>
                  <th className="px-4 py-3 font-semibold">Colaborador</th>
                  <th className="px-4 py-3 font-semibold">Função</th>
                  <th className="px-4 py-3 font-semibold">Processo</th>
                  <th className="px-4 py-3 font-semibold">Etapa</th>
                  <th className="px-4 py-3 font-semibold">Prazo</th>
                  <th className="px-4 py-3 font-semibold">Situação</th>
                  <th className="px-4 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredProcessos.map((processo) => (
                  <tr key={processo.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">{processo.matricula}</td>
                    <td className="px-4 py-3 text-foreground">{processo.colaborador}</td>
                    <td className="px-4 py-3 text-muted-foreground">{processo.funcao}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                        {processo.processo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <FilePlus2 className="h-3.5 w-3.5 text-muted-foreground/70" />
                        {processo.etapa}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/70" />
                        {formatDate(processo.prazo)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                          SITUACAO_STYLES[processo.situacao],
                        )}
                      >
                        {processo.situacao}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingProcesso(processo)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title="Editar processo"
                          aria-label={`Editar processo de ${processo.colaborador}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingProcesso(processo)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                          title="Excluir processo"
                          aria-label={`Excluir processo de ${processo.colaborador}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>{' '}
            </table>
          </div>
        )}
        {!loading && filteredProcessos.length === 0 && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhum processo cadastral encontrado.
            {selectedCategoria && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setSelectedCategoria(null)}
                  className="text-xs font-medium text-primary underline"
                >
                  Ver todos os processos
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Novo processo */}
      <ProcessoCadastralFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        employees={employees}
        onSubmit={async (data) => {
          await handleCreate(data)
        }}
      />

      {/* Modal Editar processo */}
      <ProcessoCadastralFormModal
        open={editingProcesso !== null}
        onOpenChange={(open) => {
          if (!open) setEditingProcesso(null)
        }}
        initialData={editingProcesso}
        employees={employees}
        onSubmit={async (data) => {
          if (editingProcesso) {
            await handleUpdate({
              id: editingProcesso.id,
              ...data,
            })
          }
        }}
      />

      {/* Confirmação de exclusão */}
      <AlertDialog
        open={deletingProcesso !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingProcesso(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir processo cadastral?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o processo{' '}
              <strong className="text-foreground">{deletingProcesso?.processo}</strong> do
              colaborador{' '}
              <strong className="text-foreground">{deletingProcesso?.colaborador}</strong> (Registro{' '}
              {deletingProcesso?.matricula})? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingProcesso) {
                  handleDelete(deletingProcesso)
                }
              }}
            >
              Excluir processo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------- Modal "Formulário de processo" (Criar / Editar) ----------

interface ProcessoCadastralFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: ProcessoCadastral | null
  employees: Employee[]
  onSubmit: (data: {
    processo: Categoria
    matricula: string
    nome: string
    funcao: string
    prazo: string
    employeeId?: string
  }) => Promise<void> | void
}

function ProcessoCadastralFormModal({
  open,
  onOpenChange,
  initialData,
  employees,
  onSubmit,
}: ProcessoCadastralFormModalProps) {
  const isEditing = Boolean(initialData)
  const [processo, setProcesso] = useState<Categoria>('Inclusão')
  const [matricula, setMatricula] = useState('')
  const [nome, setNome] = useState('')
  const [funcao, setFuncao] = useState('')
  const [prazo, setPrazo] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      if (initialData) {
        setProcesso(initialData.processo)
        setMatricula(initialData.matricula || '')
        setNome(initialData.colaborador || '')
        setFuncao(initialData.funcao || '')
        setPrazo(initialData.prazo || '')
      } else {
        setProcesso('Inclusão')
        setMatricula('')
        setNome('')
        setFuncao('')
        setPrazo('')
      }
    }
  }, [open, initialData])

  const selectedEmployee = useMemo(
    () =>
      employees.find(
        (employee) =>
          employee.chapa === matricula.trim() ||
          employee.name.toLowerCase() === nome.trim().toLowerCase(),
      ),
    [employees, matricula, nome],
  )

  const canSubmit = matricula.trim() !== '' && nome.trim() !== '' && processo !== null && !saving

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSaving(true)
    try {
      await onSubmit({
        processo,
        matricula: matricula.trim(),
        nome: nome.trim(),
        funcao: funcao.trim(),
        prazo,
        employeeId: selectedEmployee?.id,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Pencil className="h-5 w-5 text-primary" />
                Editar processo
              </>
            ) : (
              <>
                <Plus className="h-5 w-5 text-primary" />
                Novo processo
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Edite os dados cadastrais do processo selecionado.'
              : 'Cadastre manualmente uma movimentação de colaborador.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="modal-processo">Tipo de movimentação</Label>
            <Select value={processo} onValueChange={(value) => setProcesso(value as Categoria)}>
              <SelectTrigger id="modal-processo">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="modal-matricula">Registro</Label>
            <Input
              id="modal-matricula"
              placeholder="Número da matrícula / registro"
              value={matricula}
              onChange={(event) => setMatricula(event.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="modal-nome">Nome Completo</Label>
            <Input
              id="modal-nome"
              placeholder="Nome completo do colaborador"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="modal-funcao">Função</Label>
            <Input
              id="modal-funcao"
              placeholder="Função do colaborador"
              value={funcao}
              onChange={(event) => setFuncao(event.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="modal-prazo">Prazo</Label>
            <Input
              id="modal-prazo"
              type="date"
              value={prazo}
              onChange={(event) => setPrazo(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
              {saving ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Registrar processo'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
