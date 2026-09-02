import { useEffect, useMemo, useState } from 'react'
import { KeyRound, Loader2, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'

import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/format'
import { listAllEmployees } from '@/services/employees'
import type { Employee } from '@/lib/types'

interface UserRow {
  id: string
  email: string
  name: string
  created: string
}

export default function PainelAcesso() {
  const { user } = useAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<Employee[]>([])

  useEffect(() => {
    Promise.all([
      fetch(`${import.meta.env.VITE_POCKETBASE_URL}/api/collections/users/records`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('pocketbase_auth') ?? ''}` },
      })
        .then((response) => (response.ok ? response.json() : { items: [] }))
        .catch(() => ({ items: [] })),
      listAllEmployees()
        .then(setEmployees)
        .catch(() => setEmployees([])),
    ]).then(([usersResult]) => {
      setUsers((usersResult.items ?? []) as UserRow[])
      setLoading(false)
    })
  }, [])

  const ativos = useMemo(
    () => employees.filter((employee) => employee.situacao === 'Ativo').length,
    [employees],
  )

  const handleInvite = () => {
    toast.info('Convites de acesso serão liberados em uma próxima fase do painel.')
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
            <p className="text-xs text-muted-foreground">Usuários e permissões do portal</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleInvite}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          <UserPlus className="h-4 w-4" />
          Convidar usuário
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
            <Users className="h-5 w-5 text-green-700" />
          </div>
          <p className="mt-3 text-[13px] text-muted-foreground">
            Colaboradores com acesso ao portal
          </p>
          <p className="tabular-nums text-3xl font-bold text-foreground">
            {loading ? '—' : users.length}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
            <KeyRound className="h-5 w-5 text-amber-700" />
          </div>
          <p className="mt-3 text-[13px] text-muted-foreground">Perfis planejados</p>
          <p className="text-3xl font-bold text-foreground">2</p>
          <p className="mt-1 text-xs text-muted-foreground">Admin (ativo) · RH (em breve)</p>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100">
            <ShieldCheck className="h-5 w-5 text-teal-700" />
          </div>
          <p className="mt-3 text-[13px] text-muted-foreground">Colaboradores ativos na base</p>
          <p className="tabular-nums text-3xl font-bold text-foreground">{ativos}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-bold text-foreground">Usuários com acesso</h2>
          <p className="text-xs text-muted-foreground">Contas autenticadas neste portal</p>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando…
            </div>
          ) : (
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-semibold">Nome</th>
                  <th className="px-5 py-3 font-semibold">E-mail</th>
                  <th className="px-5 py-3 font-semibold">Perfil</th>
                  <th className="px-5 py-3 font-semibold">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {users.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b transition-colors last:border-b-0 hover:bg-muted/40"
                  >
                    <td className="px-5 py-3 font-medium">{row.name || '—'}</td>
                    <td className="px-5 py-3 text-muted-foreground">{row.email}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        {row.id === user?.id ? 'Admin (você)' : 'Admin'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{formatDate(row.created)}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
