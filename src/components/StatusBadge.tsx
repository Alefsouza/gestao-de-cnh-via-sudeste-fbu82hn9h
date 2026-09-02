import { cn } from '@/lib/utils'

type BadgeTone = 'green' | 'red' | 'amber' | 'gray'

const TONES: Record<BadgeTone, string> = {
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  amber: 'bg-amber-100 text-amber-800',
  gray: 'bg-gray-100 text-gray-700',
}

const DOTS: Record<BadgeTone, string> = {
  green: 'bg-green-600',
  red: 'bg-red-600',
  amber: 'bg-amber-600',
  gray: 'bg-gray-500',
}

/** Converte o texto de situação para um tom de badge. */
export function toneForStatus(value?: string | null): BadgeTone {
  switch (value) {
    case 'Válida':
    case 'Ativo':
    case 'Em dia':
      return 'green'
    case 'Vencida':
    case 'Vencido':
    case 'Desligado':
      return 'red'
    case 'A vencer':
      return 'amber'
    default:
      return 'gray'
  }
}

export default function StatusBadge({
  value,
  className,
}: {
  value?: string | null
  className?: string
}) {
  const tone = toneForStatus(value)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        TONES[tone],
        className,
      )}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[tone]}`} />
      {value || '—'}
    </span>
  )
}
