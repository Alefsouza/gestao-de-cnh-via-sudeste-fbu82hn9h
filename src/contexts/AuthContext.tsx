import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthRecord } from 'pocketbase'

import pb from '@/lib/pocketbase/client'

interface AuthContextValue {
  user: AuthRecord | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<AuthRecord>
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthRecord | null>(
    pb.authStore.isValid ? pb.authStore.record : null,
  )
  const [loading, setLoading] = useState<boolean>(pb.authStore.isValid)

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange((token) => {
      const record = pb.authStore.record
      const isValid = Boolean(token) && record?.id
      setUser(isValid ? record : null)
    })
    return () => {
      unsubscribe()
    }
  }, [])

  // Revalida a sessão salva uma única vez ao montar o provider.
  useEffect(() => {
    if (!pb.authStore.isValid) {
      setLoading(false)
      return
    }
    pb.collection('users')
      .authRefresh()
      .catch(() => pb.authStore.clear())
      .finally(() => setLoading(false))
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const auth = await pb.collection('users').authWithPassword(email, password)
    return auth.record
  }, [])

  const signOut = useCallback(() => {
    pb.authStore.clear()
  }, [])

  const value = useMemo(
    () => ({ user, loading, signIn, signOut }),
    [user, loading, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  return context
}
