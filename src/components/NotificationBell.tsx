import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { toast } from 'sonner'

import { markAllNotificationsRead, markNotificationRead } from '@/services/notifications'
import { relativeTime } from '@/lib/format'
import type { Notification } from '@/lib/types'
import { cn } from '@/lib/utils'

interface NotificationBellProps {
  notifications: Notification[]
  onReload: () => void
}

const DOT_COLORS: Record<Notification['type'], string> = {
  info: 'bg-sky-500',
  alert: 'bg-red-500',
  success: 'bg-green-500',
}

export default function NotificationBell({ notifications, onReload }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const unread = notifications.filter((item) => !item.read).length

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleMarkAll = async () => {
    const ids = notifications.filter((item) => !item.read).map((item) => item.id)
    if (ids.length === 0) return
    try {
      await markAllNotificationsRead(ids)
      onReload()
    } catch {
      toast.error('Não foi possível marcar as notificações como lidas')
    }
  }

  const handleOpen = async (notification: Notification) => {
    setOpen(false)
    if (!notification.read) {
      try {
        await markNotificationRead(notification.id)
        onReload()
      } catch {
        // silencioso
      }
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label="Notificações"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border bg-white text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="animate-pulse-badge absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-xl border bg-white shadow-lg animate-fade-in sm:w-96">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">Notificações</p>
            <span className="text-xs text-muted-foreground">{unread} não lida(s)</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhuma notificação.
              </p>
            )}
            {notifications.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleOpen(item)}
                className={cn(
                  'flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/60',
                  !item.read && 'bg-accent/60',
                )}
              >
                <span
                  className={cn(
                    'mt-1.5 h-2 w-2 flex-none rounded-full',
                    DOT_COLORS[item.type] ?? 'bg-gray-400',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="line-clamp-2 block text-xs text-muted-foreground">
                    {item.message}
                  </span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {relativeTime(item.created)}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="border-t bg-muted/30 p-2">
            <button
              type="button"
              onClick={handleMarkAll}
              className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-accent"
            >
              <CheckCheck className="h-4 w-4" />
              Marcar todas como lidas
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
