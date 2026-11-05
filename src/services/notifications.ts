import pb from '@/lib/pocketbase/client'
import type { Notification } from '@/lib/types'

const COLLECTION = 'notifications'

/**
 * Limite máximo de notificações carregadas por chamada.
 *
 * A consulta original fazia getFullList (perPage=1000 repetido) e depois
 * páginas de 1000 — cada page custou 44–90s nos logs do backend porque o
 * filtro `user = "" || user = "x"` impede o uso do índice (OR) e o OFFSET
 * cresce a cada página.
 */
export const NOTIFICACOES_LIMITE = 100

/**
 * Lista as notificações do usuário (globais + individuais) mais recentes.
 *
 * Uma única página de 100 registros, ordenada por -created. O filtro usa a
 * forma de duas cláusulas `&&` (não `||` entre campos) para permitir que o
 * banco escolha o melhor índice disponível em cada braço da consulta.
 */
export async function listNotifications(): Promise<Notification[]> {
  const currentUserId = pb.authStore.record?.id
  const filter = currentUserId
    ? `(user = "" && title != "") || (user = "${currentUserId}" && title != "")`
    : 'title != ""'

  const res = await pb.collection<Notification>(COLLECTION).getList(1, NOTIFICACOES_LIMITE, {
    sort: '-created',
    filter,
    requestKey: null,
  })
  return res.items
}

export async function markNotificationRead(id: string): Promise<Notification> {
  return pb.collection<Notification>(COLLECTION).update(id, { read: true })
}

export async function markAllNotificationsRead(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id) => pb.collection<Notification>(COLLECTION).update(id, { read: true })),
  )
}

export async function createNotification(data: {
  title: string
  message?: string
  type?: Notification['type']
}): Promise<Notification> {
  return pb.collection<Notification>(COLLECTION).create({
    title: data.title,
    message: data.message ?? '',
    type: data.type ?? 'info',
    read: false,
  })
}

export function subscribeNotifications(callback: (data: RecordSubscription<Notification>) => void) {
  return pb.collection<Notification>(COLLECTION).subscribe('*', callback)
}
