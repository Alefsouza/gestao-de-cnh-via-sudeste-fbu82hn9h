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
import { cn } from '@/lib/utils'

type Perfil = 'Admin' | 'RH'

interface Usuario {
  id: string
  nome: string
  email: string
  perfil: Perfil
  ativo: boolean
}

const EMPTY_FORM = { nome: '', email: '', senha: '', perfil: 'RH' as Perfil }

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
      const lista = await pb.collection('usuarios').getFullList<Usuario>()
      setUsuarios(lista)
    } catch (erro) {
      toast.error('Não foi possível carregar os usuários.')
      console.error(erro)
    } finally {
      setCarregando(false)
    }
  }

  async function salvar() {
    if (!form.nome.trim() || !form.email.trim()) {
      toast.error('Informe o nome e o e-mail do usuário.')
      return
    }
    setSalvando(true)
    try {
      await pb.collection('usuarios').create(form)
      toast.success('Usuário criado com sucesso!')
      setForm(EMPTY_FORM)
      await carregar()
    } catch (erro) {
      toast.error('Erro ao salvar o usuário.')
      console.error(erro)
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(id: string) {
    try {
      await pb.collection('usuarios').delete(id)
      toast.success('Usuário excluído com sucesso!')
      await carregar()
    } catch (erro) {
      toast.error('Erro ao excluir o usuário.')
      console.error(erro)
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
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
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
        <div className="space-y-2">
          <Label htmlFor="senha">Senha</Label>
          <Input
            id="senha"
            type="password"
            value={form.senha}
            onChange={(e) => setForm({ ...form, senha: e.target.value })}
            placeholder="Defina uma senha"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="perfil">Perfil</Label>
          <Select
            value={form.perfil}
            onValueChange={(value) => setForm({ ...form, perfil: value as Perfil })}
          >
            <SelectTrigger id="perfil">
              <SelectValue placeholder="Selecione o perfil" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Admin">Admin</SelectItem>
              <SelectItem value="RH">RH</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar usuário'}
        </Button>
      </form>

      <div className="rounded-lg border">
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
            {usuarios.map((usuario) => (
              <tr key={usuario.id} className="border-b transition-colors hover:bg-muted/40">
                <td className="px-4 py-2">{usuario.nome}</td>
                <td className="px-4 py-2">{usuario.email}</td>
                <td className="px-4 py-2">{usuario.perfil}</td>
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
