/// <reference path="../../../pocketbase/migrations/0004_create_sync_runs.js" />

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { pb } from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

type Perfil = 'Admin' | 'RH'

interface Usuario {
  id: string
  nome: string
  email: string
  perfil: Perfil
  ativo: boolean
}

const EMPTY_FORM = { nome: '', email: '', senha: '', perfil: 'RH' as Perfil }

export default function PainelAcesso() {
  const navigate = useNavigate()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [salvando, setSalvando] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)

  useEffect(() => {
    void carregar()
  }, [])

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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <h1 className="text-2xl font-bold">Painel de Acesso</h1>
      <p className="text-muted-foreground">Gerencie os usuários que têm acesso ao sistema.</p>

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
              {PERFAIS.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
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
