import type { RecordSubscription } from 'pocketbase'

import pb from '@/lib/pocketbase/client'
import type { Notification } from '@/lib/types'

const COLLECTION = 'notifications'

export async function listNotifications(): Promise<Notification[]> {
  const currentUserId = pb.authStore.record?.id
  const filter = currentUserId ? `user = "" || user = "${currentUserId}"` : ''
  // Paginado (3 x 200): evita o getFullList com perPage=1000 repetido em rajada,
  // que provocava 429 e lentidão no carregamento das telas.
  const pages: Notification[] = []
  const first = await pb.collection<Notification>(COLLECTION).getList(1, 200, {
    sort: '-created',
    ...(filter ? { filter } : {}),
    requestKey: null,
  })
  pages.push(...first.items)
  const totalPages = Math.min(first.totalPages, 3)
  for (let page = 2; page <= totalPages; page++) {
    const res = await pb.collection<Notification>(COLLECTION).getList(page, 200, {
      sort: '-created',
      ...(filter ? { filter } : {}),
      requestKey: null,
    })
    pages.push(...res.items)
  }
  return pages
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
