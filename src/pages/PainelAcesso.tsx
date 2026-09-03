import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import type { UserRole } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Usuario {
  id: string
  name: string
  email: string
  role?: UserRole | string
}

const EMPTY_FORM: { name: string; email: string; password: string; role: UserRole } = {
  name: '',
  email: '',
  password: '',
  role: 'Tráfego',
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
    setSalvando(true)
    try {
      await pb.collection('users').create({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        passwordConfirm: form.password,
        role: form.role,
      })
      toast.success(`Usuário criado com sucesso com o perfil ${form.role}!`)
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

  async function excluir(id: string) {
    setExcluindoId(id)
    try {
      await pb.collection('users').delete(id)
      toast.success('Usuário excluído com sucesso!')
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Defina uma senha"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="perfil">Perfil de Acesso (Role)</Label>
            <Select
              value={form.role}
              onValueChange={(val) => setForm({ ...form, role: val as UserRole })}
            >
              <SelectTrigger id="perfil">
                <SelectValue placeholder="Selecione o perfil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Admin">Admin (Acesso Total)</SelectItem>
                <SelectItem value="RH">RH (Gestão e Recursos Humanos)</SelectItem>
                <SelectItem value="Tráfego">Tráfego (Exclusivo Processos Cadastrais)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              O perfil <strong>Tráfego</strong> acessa somente Processos Cadastrais para alterar
              situação para &quot;Foto Bloqueada&quot; ou &quot;Impossibilitado de Trabalhar&quot;.
            </p>
          </div>
        </div>
        <Button type="submit" disabled={salvando}>
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
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void excluir(usuario.id)}
                        disabled={excluindoId === usuario.id}
                      >
                        {excluindoId === usuario.id ? 'Excluindo…' : 'Excluir'}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
