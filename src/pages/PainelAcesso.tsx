import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  Clock3,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { toast } from 'sonner'

import { useAuth } from '@/contexts/AuthContext'
import { formatDate, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Perfil = 'Admin' | 'RH'
type StatusUsuario = 'Ativo' | 'Inativo'
type StatusSincronizacao = 'Sucesso' | 'Em andamento' | 'Falha'

interface UserRow {
  id: string
  name: string
  email: string
  perfil: Perfil
  status: StatusUsuario
}

interface SyncRecord {
  id: string
  date: Date
  status: StatusSincronizacao
  registros: number
  origem: string
}

const PERFAIS: Perfil[] = ['Admin', 'RH']

function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3600000)
}

const SAMPLE_USERS: UserRow[] = [
  {
    id: 'u-1',
    name: 'Ana Beatriz Souza',
    email: 'ana.souza@viasudeste.com.br',
    perfil: 'Admin',
    status: 'Ativo',
  },
  {
    id: 'u-2',
    name: 'Carlos Eduardo Lima',
    email: 'carlos.lima@viasudeste.com.br',
    perfil: 'RH',
    status: 'Ativo',
  },
  {
    id: 'u-3',
    name: 'Fernanda Ribeiro',
    email: 'fernanda.ribeiro@viasudeste.com.br',
    perfil: 'RH',
    status: 'Ativo',
  },
  {
    id: 'u-4',
    name: 'João Pedro Martins',
    email: 'joao.martins@viasudeste.com.br',
    perfil: 'RH',
    status: 'Inativo',
  },
  {
    id: 'u-5',
    name: 'Patrícia Gomes',
    email: 'patricia.gomes@viasudeste.com.br',
    perfil: 'RH',
    status: 'Ativo',
  },
]

const SAMPLE_HISTORY: SyncRecord[] = [
  {
    id: newId(),
    date: hoursAgo(2),
    status: 'Sucesso',
    registros: 248,
    origem: 'Matriz · folha de pagamento',
  },
  {
    id: newId(),
    date: hoursAgo(6),
    status: 'Sucesso',
    registros: 246,
    origem: 'Matriz · folha de pagamento',
  },
  {
    id: newId(),
    date: hoursAgo(14),
    status: 'Falha',
    registros: 0,
    origem: 'Matriz · folha de pagamento',
  },
  {
    id: newId(),
    date: hoursAgo(26),
    status: 'Sucesso',
    registros: 243,
    origem: 'Matriz · folha de pagamento',
  },
  {
    id: newId(),
    date: hoursAgo(50),
    status: 'Sucesso',
    registros: 241,
    origem: 'Matriz · folha de pagamento',
  },
]

function StatusSincronizacaoBadge({ status }: { status: StatusSincronizacao }) {
  const styles: Record<StatusSincronizacao, string> = {
    Sucesso: 'bg-emerald-100 text-emerald-800',
    'Em andamento': 'bg-amber-100 text-amber-800',
    Falha: 'bg-red-100 text-red-700',
  }
  return (
    <span
      className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', styles[status])}
    >
      {status}
    </span>
  )
}

function PerfilBadge({ perfil }: { perfil: Perfil }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
        perfil === 'Admin' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800',
      )}
    >
      {perfil}
    </span>
  )
}

function StatusUsuarioBadge({ status }: { status: StatusUsuario }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
        status === 'Ativo' ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground',
      )}
    >
      {status}
    </span>
  )
}

function AcessoBloqueado() {
  const navigate = useNavigate()
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center rounded-xl border bg-white p-10 text-center shadow-sm">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
        <Lock className="h-7 w-7 text-red-600" />
      </div>
      <h1 className="mt-4 text-lg font-bold text-foreground">Acesso restrito</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        O Painel de acesso é exclusivo para usuários com perfil Admin. Seu perfil não possui
        permissão para visualizar esta tela.
      </p>
      <Button type="button" className="mt-6" onClick={() => navigate('/', { replace: true })}>
        Voltar para a visão geral
      </Button>
    </div>
  )
}

interface UserFormState {
  name: string
  email: string
  senha: string
  perfil: Perfil
}

const EMPTY_FORM: UserFormState = { name: '', email: '', senha: '', perfil: 'RH' }

export default function PainelAcesso() {
  const { user } = useAuth()
  const isAdmin = user?.role !== 'RH'

  const [users, setUsers] = useState<UserRow[]>(SAMPLE_USERS)
  const [history, setHistory] = useState<SyncRecord[]>(SAMPLE_HISTORY)
  const [syncing, setSyncing] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM)

  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Bloqueia o acesso caso o perfil do usuário logado não seja Admin.
  useEffect(() => {
    if (user && user.role === 'RH') {
      toast.error('Acesso restrito ao perfil Admin.')
    }
  }, [user])

  const lastSync = useMemo(
    () => history.find((item) => item.status !== 'Em andamento') ?? null,
    [history],
  )

  if (!isAdmin) return <AcessoBloqueado />

  const openNewUser = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  const openEditUser = (row: UserRow) => {
    setEditingId(row.id)
    setForm({ name: row.name, email: row.email, senha: '', perfil: row.perfil })
    setFormOpen(true)
  }

  const handleSaveUser = () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Informe nome e e-mail do usuário.')
      return
    }
    if (!editingId && !form.senha.trim()) {
      toast.error('Defina uma senha para o novo usuário.')
      return
    }
    if (editingId) {
      setUsers((current) =>
        current.map((row) =>
          row.id === editingId
            ? { ...row, name: form.name.trim(), email: form.email.trim(), perfil: form.perfil }
            : row,
        ),
      )
      toast.success('Usuário atualizado com sucesso')
    } else {
      setUsers((current) => [
        ...current,
        {
          id: newId(),
          name: form.name.trim(),
          email: form.email.trim(),
          perfil: form.perfil,
          status: 'Ativo',
        },
      ])
      toast.success('Usuário criado com sucesso')
    }
    setFormOpen(false)
  }

  const handleToggleStatus = (row: UserRow) => {
    setUsers((current) =>
      current.map((item) =>
        item.id === row.id
          ? { ...item, status: item.status === 'Ativo' ? 'Inativo' : 'Ativo' }
          : item,
      ),
    )
  }

  const handleConfirmDelete = () => {
    if (!deleteId) return
    setUsers((current) => current.filter((row) => row.id !== deleteId))
    setDeleteId(null)
    toast.success('Usuário excluído com sucesso')
  }

  const handleSyncNow = () => {
    if (syncing) return
    setSyncing(true)
    const inProgress: SyncRecord = {
      id: newId(),
      date: new Date(),
      status: 'Em andamento',
      registros: 0,
      origem: 'Matriz · folha de pagamento',
    }
    setHistory((current) => [inProgress, ...current])
    setTimeout(() => {
      const registros = 180 + Math.floor(Math.random() * 160)
      setHistory((current) =>
        current.map((item) =>
          item.id === inProgress.id ? { ...item, status: 'Sucesso', registros } : item,
        ),
      )
      setSyncing(false)
      toast.success(`Sincronização concluída · ${registros} registros atualizados`)
    }, 2000)
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Painel de acesso</h1>
            <p className="text-xs text-muted-foreground">
              Gerenciamento de usuários e acompanhamento de sincronizações
            </p>
          </div>
        </div>
        <Button type="button" className="h-10 gap-2" onClick={openNewUser}>
          <UserPlus className="h-4 w-4" />
          Novo usuário
        </Button>
      </div>

      {/* Seção: Gerenciamento de Usuários */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-bold text-foreground">Gerenciamento de Usuários</h2>
          <p className="text-xs text-muted-foreground">
            Contas com acesso ao portal · perfis Admin e RH
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-semibold">Nome</th>
                <th className="px-5 py-3 font-semibold">E-mail</th>
                <th className="px-5 py-3 font-semibold">Perfil</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr
                  key={row.id}
                  className="border-b transition-colors last:border-b-0 hover:bg-muted/40"
                >
                  <td className="px-5 py-3 font-medium">{row.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{row.email}</td>
                  <td className="px-5 py-3">
                    <PerfilBadge perfil={row.perfil} />
                  </td>
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(row)}
                      title="Alternar status"
                    >
                      <StatusUsuarioBadge status={row.status} />
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        aria-label={`Editar ${row.name}`}
                        title="Editar"
                        onClick={() => openEditUser(row)}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Excluir ${row.name}`}
                        title="Excluir"
                        onClick={() => setDeleteId(row.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Seção: Acompanhamento de Sincronizações */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-foreground">
              Acompanhamento de Sincronizações
            </h2>
            <p className="text-xs text-muted-foreground">
              Integração da base de colaboradores com a matriz
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 gap-2"
            onClick={handleSyncNow}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sincronizar agora
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Clock3 className="h-4 w-4" />
              Última sincronização
            </div>
            <p className="mt-2 text-lg font-bold text-foreground">
              {lastSync ? formatDate(lastSync.date.toISOString()) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              {lastSync
                ? `às ${formatTime(lastSync.date.toISOString())}`
                : 'Nenhuma sincronização registrada'}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              Status
            </div>
            <p className="mt-3">
              {syncing ? (
                <StatusSincronizacaoBadge status="Em andamento" />
              ) : lastSync ? (
                <StatusSincronizacaoBadge status={lastSync.status} />
              ) : (
                '—'
              )}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {syncing ? 'Atualizando registros…' : 'Situação da última execução'}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              Registros atualizados
            </div>
            <p className="mt-2 tabular-nums text-lg font-bold text-foreground">
              {syncing ? '—' : (lastSync?.registros ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">Colaboradores na última execução</p>
          </div>
        </div>

        <div className="border-t">
          <div className="px-5 pt-4">
            <h3 className="text-sm font-bold text-foreground">
              Histórico das últimas sincronizações
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-semibold">Data</th>
                  <th className="px-5 py-3 font-semibold">Hora</th>
                  <th className="px-5 py-3 font-semibold">Origem</th>
                  <th className="px-5 py-3 font-semibold">Registros</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 8).map((item) => (
                  <tr
                    key={item.id}
                    className="border-b transition-colors last:border-b-0 hover:bg-muted/40"
                  >
                    <td className="px-5 py-3 font-medium">{formatDate(item.date.toISOString())}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatTime(item.date.toISOString())}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{item.origem}</td>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">
                      {item.status === 'Em andamento' ? '—' : item.registros}
                    </td>
                    <td className="px-5 py-3">
                      <StatusSincronizacaoBadge status={item.status} />
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                      Nenhuma sincronização registrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Formulário de usuário (novo / edição) */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              {editingId ? 'Editar usuário' : 'Novo usuário'}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Atualize os dados de acesso do usuário.'
                : 'Preencha os dados para criar um novo acesso ao portal.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="usuario-nome">Nome</Label>
              <Input
                id="usuario-nome"
                placeholder="Nome completo"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="usuario-email">E-mail</Label>
              <Input
                id="usuario-email"
                type="email"
                placeholder="nome@viasudeste.com.br"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="usuario-senha">Senha</Label>
              <Input
                id="usuario-senha"
                type="password"
                placeholder={
                  editingId
                    ? 'Deixe em branco para manter a senha atual'
                    : 'Defina uma senha de acesso'
                }
                value={form.senha}
                onChange={(event) =>
                  setForm((current) => ({ ...current, senha: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="usuario-perfil">Perfil</Label>
              <Select
                value={form.perfil}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, perfil: value as Perfil }))
                }
              >
                <SelectTrigger id="usuario-perfil">
                  <SelectValue placeholder="Selecione o perfil" />
                </SelectTrigger>
                <SelectContent>
                  {PERFAIS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSaveUser}>
              {editingId ? 'Salvar alterações' : 'Criar usuário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá o acesso do usuário ao portal. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleConfirmDelete}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
