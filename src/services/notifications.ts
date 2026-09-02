import type { RecordSubscription } from 'pocketbase'

import pb from '@/lib/pocketbase/client'
import type { Notification } from '@/lib/types'

const COLLECTION = 'notifications'

export async function listNotifications(): Promise<Notification[]> {
  return pb.collection<Notification>(COLLECTION).getFullList({
    sort: '-created',
  })
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
