import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Pencil, RefreshCw, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { triggerSync, listRuns } from '@/lib/sync'
import type { SyncRun } from '@/lib/sync'
import { formatDateTime, relativeDayLabel } from '@/lib/format'
import type { UserRole, GaragemOption } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Usuario {
  id: string
  name: string
  email: string
  role?: UserRole | string
  garagem?: GaragemOption | string
}

const EMPTY_FORM: {
  name: string
  email: string
  password: string
  role: UserRole
  garagem: GaragemOption
} = {
  name: '',
  email: '',
  password: '',
  role: 'Tráfego',
  garagem: 'CURSINO',
}

function statusTone(status: string) {
  if (status === 'Sucesso') return 'bg-green-100 text-green-800'
  if (status === 'Falha') return 'bg-red-100 text-red-800'
  return 'bg-amber-100 text-amber-800'
}

export default function PainelAcesso() {
  const navigate = useNavigate()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)

  const [form, setForm] = useState(EMPTY_FORM)
  const [salvando, setSalvando] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [usuarioExcluir, setUsuarioExcluir] = useState<Usuario | null>(null)

  // Edição de usuário
  const [editingUser, setEditingUser] = useState<Usuario | null>(null)
  const [editForm, setEditForm] = useState<{
    name: string
    email: string
    role: UserRole
    garagem: GaragemOption
    password?: string
  }>({
    name: '',
    email: '',
    role: 'Tráfego',
    garagem: 'CURSINO',
    password: '',
  })
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)

  const [runs, setRuns] = useState<SyncRun[]>([])
  const [carregandoRuns, setCarregandoRuns] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)

  const carregarRuns = useCallback(async () => {
    try {
      setRuns(await listRuns(8))
    } catch {
      toast.error('Não foi possível carregar o histórico de sincronizações.')
    } finally {
      setCarregandoRuns(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [])

  useEffect(() => {
    void carregarRuns()
  }, [carregarRuns])

  async function carregar() {
    setCarregando(true)
    try {
      const lista = await pb.collection('users').getFullList<Usuario>()
      setUsuarios(lista)
    } catch (erro) {
      toast.error('Não foi possível carregar os usuários.')
      console.error(erro)
    } finally {
      setCarregando(false)
    }
  }

  async function salvar() {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Informe o nome e o e-mail do usuário.')
      return
    }
    if (!form.password) {
      toast.error('Informe uma senha para o usuário.')
      return
    }
    if (form.role === 'Tráfego' && (!form.garagem || form.garagem === 'Todas')) {
      toast.error(
        'Para o perfil Tráfego, é obrigatório selecionar a Garagem (CURSINO ou SAPOPEMBA).',
      )
      return
    }

    setSalvando(true)
    try {
      await pb.collection('users').create({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        passwordConfirm: form.password,
        role: form.role,
        garagem: form.garagem,
      })
      toast.success(
        `Usuário criado com sucesso com o perfil ${form.role}${
          form.role === 'Tráfego' ? ` na garagem ${form.garagem}` : ''
        }!`,
      )
      setForm(EMPTY_FORM)
      await carregar()
    } catch (erro: any) {
      const data = erro?.response?.data || erro?.data
      const emailErr = data?.email

      if (
        emailErr?.code === 'validation_not_unique' ||
        emailErr?.message?.toLowerCase?.()?.includes('unique') ||
        emailErr?.message?.toLowerCase?.()?.includes('já')
      ) {
        toast.error('Este e-mail já está cadastrado.')
      } else if (data && typeof data === 'object') {
        const fieldMessages = Object.entries(data)
          .map(([field, err]: [string, any]) => {
            const msg = typeof err === 'string' ? err : err?.message
            return msg ? `${field}: ${msg}` : null
          })
          .filter(Boolean)

        if (fieldMessages.length > 0) {
          toast.error(`Erro de validação: ${fieldMessages.join(', ')}`)
        } else {
          toast.error(erro?.response?.message || erro?.message || 'Erro ao salvar o usuário.')
        }
      } else {
        toast.error(erro?.response?.message || erro?.message || 'Erro ao salvar o usuário.')
      }
      console.error(erro)
    } finally {
      setSalvando(false)
    }
  }

  function abrirEdicao(usuario: Usuario) {
    setEditingUser(usuario)
    const role = (usuario.role as UserRole) || 'Tráfego'
    let garagem = (usuario.garagem as GaragemOption) || 'Todas'
    if (role === 'Tráfego' && (garagem === 'Todas' || !garagem)) {
      garagem = 'CURSINO'
    }
    setEditForm({
      name: usuario.name || '',
      email: usuario.email || '',
      role,
      garagem,
      password: '',
    })
  }

  async function salvarEdicao() {
    if (!editingUser) return
    if (!editForm.name.trim() || !editForm.email.trim()) {
      toast.error('Informe o nome e o e-mail do usuário.')
      return
    }
    if (editForm.role === 'Tráfego' && (!editForm.garagem || editForm.garagem === 'Todas')) {
      toast.error(
        'Para o perfil Tráfego, é obrigatório selecionar a Garagem (CURSINO ou SAPOPEMBA).',
      )
      return
    }

    setSalvandoEdicao(true)
    try {
      const updatePayload: Record<string, any> = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        role: editForm.role,
        garagem: editForm.garagem,
      }
      if (editForm.password && editForm.password.trim().length >= 8) {
        updatePayload.password = editForm.password.trim()
        updatePayload.passwordConfirm = editForm.password.trim()
      }

      await pb.collection('users').update(editingUser.id, updatePayload)
      toast.success('Usuário atualizado com sucesso!')
      setEditingUser(null)
      await carregar()
    } catch (erro: any) {
      console.error(erro)
      toast.error(erro?.response?.message || erro?.message || 'Erro ao atualizar usuário.')
    } finally {
      setSalvandoEdicao(false)
    }
  }

  async function confirmarExclusao() {
    if (!usuarioExcluir) return
    const id = usuarioExcluir.id
    setExcluindoId(id)
    try {
      await pb.collection('users').delete(id)
      toast.success('Usuário excluído com sucesso!')
      setUsuarioExcluir(null)
      await carregar()
    } catch (erro) {
      toast.error('Erro ao excluir o usuário.')
      console.error(erro)
    } finally {
      setExcluindoId(null)
    }
  }

  async function sincronizar() {
    if (sincronizando) return
    setSincronizando(true)
    try {
      const result = await triggerSync()
      if (result.status === 'Sucesso') {
        toast.success(`Sincronização concluída: ${result.records_updated} registros`)
      } else {
        toast.error(result.error || 'A sincronização falhou — verifique a conexão com a matriz')
      }
      await carregarRuns()
    } catch {
      toast.error('Não foi possível disparar a sincronização.')
    } finally {
      setSincronizando(false)
    }
  }

  const ultimaRun = runs[0]

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <h1 className="text-2xl font-bold">Painel de Acesso</h1>
      <p className="text-muted-foreground">Gerencie os usuários que têm acesso ao sistema.</p>

      {/* Acompanhamento de Sincronizações */}
      <section className="rounded-lg border">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">Acompanhamento de Sincronizações</h2>
            <p className="text-xs text-muted-foreground">
              Execuções da rotina de matriz (cron a cada 5 minutos + disparos manuais)
              {ultimaRun && ` · última: ${relativeDayLabel(ultimaRun.started_at)}`}
            </p>
          </div>
          <Button size="sm" onClick={() => void sincronizar()} disabled={sincronizando}>
            {sincronizando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sincronizando…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Sincronizar agora
              </>
            )}
          </Button>
        </header>
        <div className="overflow-x-auto">
          {carregandoRuns ? (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando…
            </div>
          ) : runs.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma sincronização registrada ainda — dispare uma com “Sincronizar agora”.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">Início</th>
                  <th className="px-4 py-2 font-semibold">Término</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Registros</th>
                  <th className="px-4 py-2 font-semibold">Erro</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className="border-b transition-colors last:border-b-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-2 whitespace-nowrap">
                      {formatDateTime(run.started_at)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {run.finished_at ? formatDateTime(run.finished_at) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                          statusTone(run.status),
                        )}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="tabular-nums px-4 py-2">{run.records_updated}</td>
                    <td
                      className="max-w-[220px] truncate px-4 py-2 text-xs text-muted-foreground"
                      title={run.error ?? ''}
                    >
                      {run.error || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void salvar()
        }}
        className="space-y-4 rounded-lg border p-4"
      >
        <div className="space-y-2">
          <Label htmlFor="nome">Nome</Label>
          <Input
            id="nome"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nome do usuário"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="email@exemplo.com"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="perfil">Perfil de Acesso (Role)</Label>
            <Select
              value={form.role}
              onValueChange={(val) => {
                const newRole = val as UserRole
                setForm((prev) => ({
                  ...prev,
                  role: newRole,
                  garagem:
                    newRole === 'Tráfego'
                      ? prev.garagem === 'Todas'
                        ? 'CURSINO'
                        : prev.garagem
                      : prev.garagem || 'Todas',
                }))
              }}
            >
              <SelectTrigger id="perfil">
                <SelectValue placeholder="Selecione o perfil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Admin">Admin (Acesso Total)</SelectItem>
                <SelectItem value="RH">RH (Gestão e RH)</SelectItem>
                <SelectItem value="Tráfego">Tráfego (Exclusivo Processos Cadastrais)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="garagem">
              Garagem{' '}
              {form.role === 'Tráfego' ? (
                <span className="text-rose-500 font-bold">*</span>
              ) : (
                <span className="text-muted-foreground font-normal">(opcional)</span>
              )}
            </Label>
            <Select
              value={form.garagem}
              onValueChange={(val) => setForm({ ...form, garagem: val as GaragemOption })}
            >
              <SelectTrigger id="garagem">
                <SelectValue placeholder="Selecione a garagem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CURSINO">CURSINO</SelectItem>
                <SelectItem value="SAPOPEMBA">SAPOPEMBA</SelectItem>
                {form.role !== 'Tráfego' && (
                  <SelectItem value="Todas">Todas (Todas as garagens)</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {form.role === 'Tráfego' ? (
            <>
              Usuários do <strong>Tráfego</strong> visualizam <strong>apenas</strong> os processos
              da sua garagem (<strong>{form.garagem || 'CURSINO'}</strong>) e só têm permissão para
              alterar a situação para &quot;Foto Bloqueada&quot; ou &quot;Impossibilitado de
              Trabalhar&quot;.
            </>
          ) : (
            <>
              Perfis <strong>Admin</strong> e <strong>RH</strong> têm acesso irrestrito e visualizam
              processos de todas as garagens.
            </>
          )}
        </p>

        <Button type="submit" disabled={salvando} className="gap-2">
          <UserPlus className="h-4 w-4" />
          {salvando ? 'Salvando…' : 'Salvar usuário'}
        </Button>
      </form>

      <div className="rounded-lg border">
        {carregando ? (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando usuários…
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-semibold">Nome</th>
                <th className="px-4 py-2 font-semibold">E-mail</th>
                <th className="px-4 py-2 font-semibold">Perfil</th>
                <th className="px-4 py-2 font-semibold">Garagem</th>
                <th className="px-4 py-2 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((usuario) => {
                const role = usuario.role || 'Admin'
                const isTrafego =
                  role.toLowerCase() === 'tráfego' || role.toLowerCase() === 'trafego'
                return (
                  <tr key={usuario.id} className="border-b transition-colors hover:bg-muted/40">
                    <td className="px-4 py-2 font-medium">{usuario.name || '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{usuario.email}</td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                          isTrafego
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : role === 'RH'
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-300',
                        )}
                      >
                        {role}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                          usuario.garagem === 'CURSINO'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : usuario.garagem === 'SAPOPEMBA'
                              ? 'bg-sky-50 text-sky-700 border border-sky-200'
                              : 'bg-gray-100 text-gray-700 border border-gray-200',
                        )}
                      >
                        {usuario.garagem || (isTrafego ? 'CURSINO' : 'Todas')}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => abrirEdicao(usuario)}
                          title="Editar usuário"
                          className="h-8 w-8 p-0"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setUsuarioExcluir(usuario)}
                          disabled={excluindoId === usuario.id}
                          title="Excluir usuário"
                          className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de Edição de Usuário */}
      <Dialog
        open={editingUser !== null}
        onOpenChange={(open) => {
          if (!open) setEditingUser(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Editar Usuário
            </DialogTitle>
            <DialogDescription>
              Atualize as informações, o perfil e a garagem de acesso do usuário.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void salvarEdicao()
            }}
            className="space-y-4 py-2"
          >
            <div className="space-y-2">
              <Label htmlFor="edit-nome">Nome</Label>
              <Input
                id="edit-nome"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Nome do usuário"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-email">E-mail</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="email@exemplo.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-senha">Nova Senha (opcional)</Label>
              <Input
                id="edit-senha"
                type="password"
                value={editForm.password || ''}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                placeholder="Deixe em branco para não alterar"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-role">Perfil (Role)</Label>
                <Select
                  value={editForm.role}
                  onValueChange={(val) => {
                    const newRole = val as UserRole
                    setEditForm((prev) => ({
                      ...prev,
                      role: newRole,
                      garagem:
                        newRole === 'Tráfego'
                          ? prev.garagem === 'Todas'
                            ? 'CURSINO'
                            : prev.garagem
                          : prev.garagem || 'Todas',
                    }))
                  }}
                >
                  <SelectTrigger id="edit-role">
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="RH">RH</SelectItem>
                    <SelectItem value="Tráfego">Tráfego</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-garagem">
                  Garagem{' '}
                  {editForm.role === 'Tráfego' ? (
                    <span className="text-rose-500 font-bold">*</span>
                  ) : null}
                </Label>
                <Select
                  value={editForm.garagem}
                  onValueChange={(val) =>
                    setEditForm({ ...editForm, garagem: val as GaragemOption })
                  }
                >
                  <SelectTrigger id="edit-garagem">
                    <SelectValue placeholder="Selecione a garagem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CURSINO">CURSINO</SelectItem>
                    <SelectItem value="SAPOPEMBA">SAPOPEMBA</SelectItem>
                    {editForm.role !== 'Tráfego' && <SelectItem value="Todas">Todas</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingUser(null)}
                disabled={salvandoEdicao}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={salvandoEdicao}>
                {salvandoEdicao ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando…
                  </>
                ) : (
                  'Salvar alterações'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmação de Exclusão */}
      <AlertDialog
        open={usuarioExcluir !== null}
        onOpenChange={(open) => {
          if (!open) setUsuarioExcluir(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o acesso de{' '}
              <strong className="text-foreground">{usuarioExcluir?.name}</strong> (
              {usuarioExcluir?.email})? Ele perderá imediatamente o acesso ao sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmarExclusao()}
            >
              Excluir usuário
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
