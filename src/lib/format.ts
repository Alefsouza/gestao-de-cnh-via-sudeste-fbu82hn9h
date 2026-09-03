/** Utilidades de formatação de datas, números e intervalos de tempo (pt-BR). */

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  return `${formatDate(value)} às ${formatTime(value)}`
}

/** Dias restantes até a data (negativo quando já venceu). */
export function daysUntil(value?: string | null): number | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((date.getTime() - startOfToday.getTime()) / 86400000)
}

/** Tempo relativo: "agora", "há 5 min", "há 2 h", "há 3 d". */
export function relativeTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `há ${days} d`
  return formatDate(value)
}

export function greeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Bom dia'
  if (hour >= 12 && hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** Saúda pelo primeiro nome do usuário. */
export function greetingFor(name?: string | null): string {
  const firstName = (name ?? '').trim().split(/\s+/)[0]
  return `${greeting()}, ${firstName || 'Administrador'}`
}

/** "hoje às 06:00", "ontem às 18:32" ou data completa. */
export function relativeDayLabel(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const diffDays = Math.round(
    (startOfToday - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      86400000,
  )
  const time = formatTime(value)
  if (diffDays === 0) return `hoje às ${time}`
  if (diffDays === 1) return `ontem às ${time}`
  return `${formatDate(value)} às ${time}`
}

export function initials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'AV'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Formata a exibição da CNH no padrão "CATCNH - NUMERO DA CNH".
 * - Se tiver categoria e número: "D - 01234567890"
 * - Se tiver apenas número: "01234567890"
 * - Se não tiver número (ou vazio): fallback ("—" ou "Sem CNH", padrão "—")
 */
export function formatCnh(
  categoria?: string | null,
  numero?: string | null,
  fallback = '—',
): string {
  const cat = (categoria ?? '').trim().toUpperCase()
  const num = (numero ?? '').trim()

  if (num && cat) {
    return `${cat} - ${num}`
  }
  if (num) {
    return num
  }
  return fallback
}
