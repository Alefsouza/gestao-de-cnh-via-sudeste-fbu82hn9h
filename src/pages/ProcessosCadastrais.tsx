import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  ClipboardList,
  FileDown,
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
import * as XLSX from 'xlsx'

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
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { formatDate } from '@/lib/format'
import { listAllEmployees } from '@/services/employees'
import {
  listProcessosCadastrais,
  createProcessoCadastral,
  updateProcessoCadastral,
  updateProcessoSituacao,
  deleteProcessoCadastral,
} from '@/services/processosCadastrais'
import { createMovement } from '@/services/movements'
import type { Employee, ProcessoSituacao } from '@/lib/types'
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
  'Documentação',
  'Análise',
  'Aprovação',
  'Concluído',
  'Documentos solicitados',
  'Aguardando documentos',
  'Em conferência',
] as const
type Etapa = (typeof ETAPAS)[number]

const SITUACOES_VALIDAS = [
  'Pendente',
  'Bloqueado',
  'Regular',
  'Foto Bloqueada',
  'Impossibilitado de Trabalhar',
] as const
type Situacao = (typeof SITUACOES_VALIDAS)[number]

const SITUACAO_STYLES: Record<Situacao, string> = {
  Pendente: 'bg-orange-100 text-orange-700 border-orange-200',
  Bloqueado: 'bg-red-100 text-red-700 border-red-200',
  Regular: 'bg-green-100 text-green-700 border-green-200',
  'Foto Bloqueada': 'bg-rose-100 text-rose-800 border-rose-300 font-semibold',
  'Impossibilitado de Trabalhar': 'bg-amber-100 text-amber-900 border-amber-300 font-semibold',
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
  garagem: 'CURSINO' | 'SAPOPEMBA' | string
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
    garagem: 'CURSINO',
  },
  {
    matricula: '10015',
    colaborador: 'Ana Paula Ferreira',
    funcao: 'Fiscal de Viajem',
    processo: 'Alteração',
    etapa: 'Aguardando documentos',
    prazo: '2026-09-05',
    situacao: 'Pendente',
    garagem: 'SAPOPEMBA',
  },
  {
    matricula: '10018',
    colaborador: 'Marcos Vinícius Alves',
    funcao: 'Motorista',
    processo: 'Exclusão',
    etapa: 'Em conferência',
    prazo: '2026-08-28',
    situacao: 'Bloqueado',
    garagem: 'CURSINO',
  },
  {
    matricula: '10021',
    colaborador: 'Juliana Castro Lima',
    funcao: 'Auxiliar Administrativo',
    processo: 'Atualização',
    etapa: 'Documentos solicitados',
    prazo: '2026-09-12',
    situacao: 'Pendente',
    garagem: 'SAPOPEMBA',
  },
  {
    matricula: '10025',
    colaborador: 'Rafael Souza Gomes',
    funcao: 'Motorista',
    processo: 'Atualização Fiscal',
    etapa: 'Em conferência',
    prazo: '2026-09-01',
    situacao: 'Regular',
    garagem: 'CURSINO',
  },
  {
    matricula: '10028',
    colaborador: 'Patrícia Menezes Silva',
    funcao: 'Fiscal de Viajem',
    processo: 'Inclusão',
    etapa: 'Aguardando documentos',
    prazo: '2026-09-08',
    situacao: 'Bloqueado',
    garagem: 'SAPOPEMBA',
  },
  {
    matricula: '10032',
    colaborador: 'Diego Almeida Costa',
    funcao: 'Motorista',
    processo: 'Alteração',
    etapa: 'Concluído',
    prazo: '2026-08-20',
    situacao: 'Regular',
    garagem: 'CURSINO',
  },
  {
    matricula: '10035',
    colaborador: 'Fernanda Ribeiro Dias',
    funcao: 'Auxiliar Administrativo',
    processo: 'Exclusão',
    etapa: 'Concluído',
    prazo: '2026-08-15',
    situacao: 'Regular',
    garagem: 'SAPOPEMBA',
  },
  {
    matricula: '10038',
    colaborador: 'Rodrigo Martins Pires',
    funcao: 'Motorista',
    processo: 'Atualização',
    etapa: 'Em conferência',
    prazo: '2026-09-03',
    situacao: 'Regular',
    garagem: 'CURSINO',
  },
  {
    matricula: '10041',
    colaborador: 'Camila Nogueira Farias',
    funcao: 'Fiscal de Viajem',
    processo: 'Atualização Fiscal',
    etapa: 'Documentos solicitados',
    prazo: '2026-09-14',
    situacao: 'Pendente',
    garagem: 'SAPOPEMBA',
  },
]

const DRAFTS_KEY = 'processos-cadastrais:drafts'
const SEED_KEY = 'processos-cadastrais:seed-v1'

const ETAPA_INICIAL: Etapa = 'Documentos solicitados'

export default function ProcessosCadastrais() {
  const { user } = useAuth()
  const userRole = ((user?.role as string) || 'Admin').toLowerCase()
  const isTrafego = userRole === 'tráfego' || userRole === 'trafego'
  // Garagem do usuário (para Tráfego: 'CURSINO' ou 'SAPOPEMBA')
  const userGaragem = (user?.garagem as string) || (isTrafego ? 'CURSINO' : 'Todas')

  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProcesso, setEditingProcesso] = useState<ProcessoCadastral | null>(null)
  const [deletingProcesso, setDeletingProcesso] = useState<ProcessoCadastral | null>(null)
  const [processoAlterarSituacao, setProcessoAlterarSituacao] = useState<ProcessoCadastral | null>(
    null,
  )
  const [novaSituacaoTrafego, setNovaSituacaoTrafego] = useState<ProcessoSituacao>('Foto Bloqueada')
  const [salvandoSituacaoTrafego, setSalvandoSituacaoTrafego] = useState(false)
  const [processos, setProcessos] = useState<ProcessoCadastral[]>([])
  const [selectedCategoria, setSelectedCategoria] = useState<Categoria | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])

  const carregarProcessos = useCallback(async () => {
    try {
      const records = await listProcessosCadastrais()
      if (records.length > 0) {
        setProcessos(
          records.map((r) => ({
            id: r.id,
            matricula: r.matricula,
            colaborador: r.colaborador,
            funcao: r.funcao,
            processo: r.processo,
            etapa: r.etapa,
            prazo: r.prazo,
            situacao: r.situacao,
            garagem: r.garagem || 'CURSINO',
          })),
        )
      } else {
        // Fallback local caso a tabela esteja limpa
        setProcessos(SEED.map((item, index) => ({ ...item, id: `seed-${index + 1}` })))
      }
    } catch (err) {
      console.error('Erro ao carregar processos:', err)
      setProcessos(SEED.map((item, index) => ({ ...item, id: `seed-${index + 1}` })))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void carregarProcessos()
  }, [carregarProcessos])

  useRealtime('processos_cadastrais', () => {
    void carregarProcessos()
  })

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

  // Processos visíveis para o usuário:
  // Se for perfil Tráfego, filtrar exclusivamente pela garagem do usuário (CURSINO ou SAPOPEMBA).
  // Admin e RH veem todos os processos.
  const visibleProcessos = useMemo(() => {
    if (!isTrafego) return processos
    const userGaragemUpper = userGaragem.toUpperCase()
    return processos.filter((p) => {
      const g = (p.garagem || '').toUpperCase()
      return g === userGaragemUpper
    })
  }, [processos, isTrafego, userGaragem])

  const resumo = useMemo(() => {
    const counts = Object.fromEntries(CATEGORIAS.map((categoria) => [categoria, 0])) as Record<
      Categoria,
      number
    >
    visibleProcessos.forEach((processo) => {
      if (processo.processo in counts) counts[processo.processo] += 1
    })
    return counts
  }, [visibleProcessos])

  const handleCreate = useCallback(
    async (data: {
      processo: Categoria
      matricula: string
      nome: string
      funcao: string
      etapa: Etapa
      prazo: string
      situacao: Situacao
      garagem?: string
      employeeId?: string
    }) => {
      try {
        const created = await createProcessoCadastral({
          matricula: data.matricula,
          colaborador: data.nome,
          funcao: data.funcao,
          processo: data.processo,
          etapa: data.etapa,
          prazo: data.prazo ? new Date(`${data.prazo}T12:00:00Z`).toISOString() : '',
          situacao: data.situacao,
          garagem: data.garagem || 'CURSINO',
        })

        setProcessos((prev) => [
          {
            id: created.id,
            matricula: created.matricula,
            colaborador: created.colaborador,
            funcao: created.funcao,
            processo: created.processo,
            etapa: created.etapa,
            prazo: created.prazo,
            situacao: created.situacao,
            garagem: created.garagem || data.garagem || 'CURSINO',
          },
          ...prev,
        ])

        // Persiste também como movimentação no banco se houver colaborador vinculado
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
            // silencioso
          }
        }

        toast.success('Processo cadastrado com sucesso')
      } catch (err) {
        console.error(err)
        toast.error('Erro ao salvar processo no backend')
      }
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
      etapa: Etapa
      prazo: string
      situacao: Situacao
      garagem?: string
      employeeId?: string
    }) => {
      try {
        await updateProcessoCadastral(data.id, {
          matricula: data.matricula,
          colaborador: data.nome,
          funcao: data.funcao,
          processo: data.processo,
          etapa: data.etapa,
          prazo: data.prazo ? new Date(`${data.prazo}T12:00:00Z`).toISOString() : '',
          situacao: data.situacao,
          garagem: data.garagem,
        })

        setProcessos((prev) =>
          prev.map((item) => {
            if (item.id === data.id) {
              return {
                ...item,
                matricula: data.matricula,
                colaborador: data.nome,
                funcao: data.funcao,
                processo: data.processo,
                etapa: data.etapa,
                prazo: data.prazo,
                situacao: data.situacao,
                garagem: data.garagem || item.garagem,
              }
            }
            return item
          }),
        )

        toast.success('Processo atualizado com sucesso')
      } catch (err) {
        console.error(err)
        toast.error('Erro ao atualizar processo no servidor')
      }
    },
    [],
  )

  const handleUpdateSituacaoTrafego = useCallback(async () => {
    if (!processoAlterarSituacao) return

    // Validação extra: o usuário do Tráfego só pode alterar processos da sua própria garagem
    if (
      isTrafego &&
      processoAlterarSituacao.garagem &&
      processoAlterarSituacao.garagem.toUpperCase() !== userGaragem.toUpperCase()
    ) {
      toast.error('Permissão negada: você só pode alterar processos da sua própria garagem.')
      setProcessoAlterarSituacao(null)
      return
    }

    setSalvandoSituacaoTrafego(true)
    try {
      await updateProcessoSituacao(processoAlterarSituacao.id, novaSituacaoTrafego)
      setProcessos((prev) =>
        prev.map((item) =>
          item.id === processoAlterarSituacao.id
            ? { ...item, situacao: novaSituacaoTrafego }
            : item,
        ),
      )
      toast.success(`Situação alterada para "${novaSituacaoTrafego}" com sucesso!`)
      setProcessoAlterarSituacao(null)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao atualizar a situação do processo no servidor.')
    } finally {
      setSalvandoSituacaoTrafego(false)
    }
  }, [processoAlterarSituacao, novaSituacaoTrafego, isTrafego, userGaragem])

  const handleDelete = useCallback(async (processo: ProcessoCadastral) => {
    try {
      await deleteProcessoCadastral(processo.id)
      setProcessos((prev) => prev.filter((p) => p.id !== processo.id))
      setDeletingProcesso(null)
      toast.success('Processo excluído com sucesso')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao excluir processo no servidor')
    }
  }, [])

  const handleCategoryClick = (categoria: Categoria) => {
    if (selectedCategoria === categoria) {
      setSelectedCategoria(null)
    } else {
      setSelectedCategoria(categoria)
    }
  }

  const filteredProcessos = useMemo(() => {
    if (!selectedCategoria) return visibleProcessos
    return visibleProcessos.filter((p) => p.processo === selectedCategoria)
  }, [visibleProcessos, selectedCategoria])

  const handleExportXlsx = useCallback(() => {
    if (filteredProcessos.length === 0) {
      toast.error('Nenhum processo disponível para exportação.')
      return
    }

    try {
      // Mapeamento exato das colunas atuais da tabela
      const rows = filteredProcessos.map((item) => ({
        Matrícula: item.matricula,
        Colaborador: item.colaborador,
        Garagem: item.garagem,
        Função: item.funcao,
        Processo: item.processo,
        Etapa: item.etapa,
        Prazo: formatDate(item.prazo),
        Situação: item.situacao,
      }))

      const worksheet = XLSX.utils.json_to_sheet(rows)

      // Ajuste de largura das colunas para visualização adequada no Excel
      const columnWidths = [
        { wch: 14 }, // Matrícula
        { wch: 32 }, // Colaborador
        { wch: 16 }, // Garagem
        { wch: 26 }, // Função
        { wch: 22 }, // Processo
        { wch: 26 }, // Etapa
        { wch: 14 }, // Prazo
        { wch: 14 }, // Situação
      ]
      worksheet['!cols'] = columnWidths

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Processos Cadastrais')

      XLSX.writeFile(workbook, 'processos-cadastrais.xlsx')
      toast.success(`Exportação concluída (${filteredProcessos.length} registro(s))`)
    } catch (error) {
      console.error('Erro ao exportar processos para XLSX:', error)
      toast.error('Ocorreu um erro ao gerar o arquivo Excel.')
    }
  }, [filteredProcessos])

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
              {isTrafego ? (
                <>
                  Garagem <strong>{userGaragem}</strong> · {visibleProcessos.length} processo(s)
                </>
              ) : (
                <>{visibleProcessos.length} processo(s) cadastrado(s)</>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="default"
            onClick={handleExportXlsx}
            disabled={filteredProcessos.length === 0}
            className="inline-flex h-10 items-center gap-2"
          >
            <FileDown className="h-4 w-4" />
            Exportar .xlsx
          </Button>
          {!isTrafego && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Novo processo
            </button>
          )}
        </div>
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
            Exibindo {filteredProcessos.length} de {visibleProcessos.length} registro(s)
            {isTrafego && ` (Garagem ${userGaragem})`}
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
                  <th className="px-4 py-3 font-semibold">Garagem</th>
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
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                          processo.garagem === 'CURSINO'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-sky-50 text-sky-700 border border-sky-200',
                        )}
                      >
                        {processo.garagem || 'CURSINO'}
                      </span>
                    </td>
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
                      {isTrafego ? (
                        <div className="flex items-center justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setProcessoAlterarSituacao(processo)
                              setNovaSituacaoTrafego(
                                processo.situacao === 'Impossibilitado de Trabalhar'
                                  ? 'Impossibilitado de Trabalhar'
                                  : 'Foto Bloqueada',
                              )
                            }}
                            className="h-8 gap-1.5 border-emerald-600/40 text-xs font-medium text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900"
                          >
                            <RefreshCcw className="h-3.5 w-3.5" />
                            Alterar situação
                          </Button>
                        </div>
                      ) : (
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
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
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
        open={editingProcesso !== null && !isTrafego}
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

      {/* Modal Restrito do perfil Tráfego: Apenas Alterar Situação */}
      <Dialog
        open={processoAlterarSituacao !== null}
        onOpenChange={(open) => {
          if (!open) setProcessoAlterarSituacao(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCcw className="h-5 w-5 text-primary" />
              Alterar Situação do Processo
            </DialogTitle>
            <DialogDescription>
              Perfil Tráfego: selecione a nova situação para o colaborador{' '}
              <strong className="text-foreground">{processoAlterarSituacao?.colaborador}</strong>{' '}
              (Registro {processoAlterarSituacao?.matricula}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
              <p>
                <span className="font-semibold text-foreground">Processo:</span>{' '}
                {processoAlterarSituacao?.processo}
              </p>
              <p>
                <span className="font-semibold text-foreground">Garagem:</span>{' '}
                <span className="font-semibold text-emerald-800">
                  {processoAlterarSituacao?.garagem || 'CURSINO'}
                </span>
              </p>
              <p>
                <span className="font-semibold text-foreground">Situação atual:</span>{' '}
                <span
                  className={cn(
                    'inline-flex rounded-full border px-2 py-0.2 text-[11px]',
                    processoAlterarSituacao?.situacao
                      ? SITUACAO_STYLES[processoAlterarSituacao.situacao]
                      : '',
                  )}
                >
                  {processoAlterarSituacao?.situacao}
                </span>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="situacao-trafego">Nova Situação</Label>
              <Select
                value={novaSituacaoTrafego}
                onValueChange={(val) => setNovaSituacaoTrafego(val as ProcessoSituacao)}
              >
                <SelectTrigger id="situacao-trafego">
                  <SelectValue placeholder="Selecione a situação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Foto Bloqueada">Foto Bloqueada</SelectItem>
                  <SelectItem value="Impossibilitado de Trabalhar">
                    Impossibilitado de Trabalhar
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Permissão exclusiva: Foto Bloqueada ou Impossibilitado de Trabalhar.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setProcessoAlterarSituacao(null)}
              disabled={salvandoSituacaoTrafego}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleUpdateSituacaoTrafego()}
              disabled={salvandoSituacaoTrafego}
            >
              {salvandoSituacaoTrafego ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                'Salvar Situação'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    etapa: Etapa
    prazo: string
    situacao: Situacao
    garagem?: string
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
  const [etapa, setEtapa] = useState<Etapa>('Documentação' as Etapa)
  const [prazo, setPrazo] = useState('')
  const [situacao, setSituacao] = useState<Situacao>('Pendente')
  const [garagem, setGaragem] = useState<'CURSINO' | 'SAPOPEMBA'>('CURSINO')
  const [searchingEmployee, setSearchingEmployee] = useState(false)
  const [resolvedEmployeeId, setResolvedEmployeeId] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      if (initialData) {
        setProcesso(initialData.processo)
        setMatricula(initialData.matricula || '')
        setNome(initialData.colaborador || '')
        setFuncao(initialData.funcao || '')
        setEtapa(initialData.etapa || 'Documentação')
        setPrazo(initialData.prazo || '')
        setSituacao(initialData.situacao || 'Pendente')
        setGaragem(initialData.garagem === 'SAPOPEMBA' ? 'SAPOPEMBA' : 'CURSINO')
        setResolvedEmployeeId(undefined)
      } else {
        setProcesso('Inclusão')
        setMatricula('')
        setNome('')
        setFuncao('')
        setEtapa('Documentação')
        setPrazo('')
        setSituacao('Pendente')
        setGaragem('CURSINO')
        setResolvedEmployeeId(undefined)
      }
    }
  }, [open, initialData])

  // Auto-preenchimento ao digitar o registro/chapa
  useEffect(() => {
    if (!open) return
    const term = matricula.trim()
    if (!term) return

    let isMounted = true
    const timer = setTimeout(async () => {
      // 1. Tenta encontrar na lista em memória (se já carregada)
      const localMatch = employees.find((emp) => {
        const chapa = (emp.chapa || '').trim().toLowerCase()
        const reg = (emp.registro || '').trim().toLowerCase()
        const target = term.toLowerCase()
        return chapa === target || reg === target
      })

      if (localMatch) {
        if (!isMounted) return
        if (localMatch.name) setNome(localMatch.name)
        if (localMatch.funcao) setFuncao(localMatch.funcao)
        if (localMatch.filial) {
          const f = localMatch.filial.toUpperCase()
          if (f.includes('SAPOPEMBA')) setGaragem('SAPOPEMBA')
          else if (f.includes('CURSINO')) setGaragem('CURSINO')
        }
        setResolvedEmployeeId(localMatch.id)
        return
      }
      // 2. Se não encontrou em memória, busca na coleção employees do PocketBase
      setSearchingEmployee(true)
      try {
        const safe = term.replace(/"/g, '\\"')
        // Consulta exata ou prefixo com zeros comuns em chapas (ex: 13 -> 000013)
        const padded6 = /^\d+$/.test(term) ? term.padStart(6, '0') : term
        const safePadded = padded6.replace(/"/g, '\\"')
        const records = await pb.collection<Employee>('employees').getList(1, 1, {
          filter: `chapa = "${safe}" || chapa = "${safePadded}" || registro = "${safe}" || registro = "${safePadded}" || chapa ~ "${safe}"`,
        })

        if (!isMounted) return
        if (records.items.length > 0) {
          const emp = records.items[0]
          if (emp.name) setNome(emp.name)
          if (emp.funcao) setFuncao(emp.funcao)
          if (emp.filial) {
            const f = emp.filial.toUpperCase()
            if (f.includes('SAPOPEMBA')) setGaragem('SAPOPEMBA')
            else if (f.includes('CURSINO')) setGaragem('CURSINO')
          }
          setResolvedEmployeeId(emp.id)
        }
      } catch (error) {
        console.error('Erro ao buscar colaborador por registro:', error)
      } finally {
        if (isMounted) setSearchingEmployee(false)
      }
    }, 300)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [matricula, open, employees])

  const selectedEmployee = useMemo(
    () =>
      employees.find(
        (employee) =>
          employee.id === resolvedEmployeeId ||
          employee.chapa === matricula.trim() ||
          employee.registro === matricula.trim() ||
          employee.name.toLowerCase() === nome.trim().toLowerCase(),
      ),
    [employees, matricula, nome, resolvedEmployeeId],
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
        etapa,
        prazo,
        // Em novo processo a situação é sempre gravada automaticamente como "Pendente"
        situacao: isEditing ? situacao : 'Pendente',
        garagem,
        employeeId: resolvedEmployeeId || selectedEmployee?.id,
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <Label htmlFor="modal-garagem">Garagem</Label>
              <Select
                value={garagem}
                onValueChange={(val) => setGaragem(val as 'CURSINO' | 'SAPOPEMBA')}
              >
                <SelectTrigger id="modal-garagem">
                  <SelectValue placeholder="Selecione a garagem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CURSINO">CURSINO</SelectItem>
                  <SelectItem value="SAPOPEMBA">SAPOPEMBA</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="modal-matricula">Registro / Chapa</Label>
              {searchingEmployee && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  Buscando colaborador…
                </span>
              )}
            </div>
            <Input
              id="modal-matricula"
              placeholder="Digite o registro ou chapa (ex: 000055)"
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

          {isEditing ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="modal-etapa">Etapa</Label>
                <Select value={etapa} onValueChange={(value) => setEtapa(value as Etapa)}>
                  <SelectTrigger id="modal-etapa">
                    <SelectValue placeholder="Selecione a etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    {ETAPAS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="modal-situacao">Situação</Label>
                <Select value={situacao} onValueChange={(value) => setSituacao(value as Situacao)}>
                  <SelectTrigger id="modal-situacao">
                    <SelectValue placeholder="Selecione a situação" />
                  </SelectTrigger>
                  <SelectContent>
                    {SITUACOES_VALIDAS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="modal-etapa">Etapa</Label>
              <Select value={etapa} onValueChange={(value) => setEtapa(value as Etapa)}>
                <SelectTrigger id="modal-etapa">
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {ETAPAS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
