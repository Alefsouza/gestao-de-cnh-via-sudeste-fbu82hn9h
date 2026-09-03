import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingDown, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: number
  icon: LucideIcon
  tone: 'green' | 'amber' | 'red' | 'teal'
  caption: string
  trend?: 'up' | 'down'
  delay?: number
  to?: string
}

const TONES: Record<StatCardProps['tone'], { bg: string; text: string; caption: string }> = {
  green: { bg: 'bg-green-100', text: 'text-green-700', caption: 'text-green-700' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-700', caption: 'text-amber-700' },
  red: { bg: 'bg-red-100', text: 'text-red-700', caption: 'text-red-700' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-700', caption: 'text-teal-700' },
}

/** Conta de 0 até o valor final em ~700ms. */
function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(target * eased))
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick)
      }
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [target, duration])

  return value
}

export default function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  caption,
  trend,
  delay = 0,
  to,
}: StatCardProps) {
  const display = useCountUp(value)
  const toneStyles = TONES[tone]
  const TrendIcon = trend === 'down' ? TrendingDown : TrendingUp

  const cardContent = (
    <>
      <div className="flex items-start justify-between">
        <div
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-lg transition-transform duration-200',
            to && 'group-hover:scale-105',
            toneStyles.bg,
          )}
        >
          <Icon className={`h-5 w-5 ${toneStyles.text}`} />
        </div>
      </div>
      <p className="mt-4 text-[13px] text-muted-foreground">{label}</p>
      <p className="tabular-nums mt-1 text-[32px] font-bold leading-none text-foreground">
        {display}
      </p>
      <p className={`mt-2 flex items-center gap-1 text-xs font-medium ${toneStyles.caption}`}>
        <TrendIcon className="h-3.5 w-3.5" />
        {caption}
      </p>
    </>
  )

  const className = cn(
    'animate-fade-up rounded-xl border bg-white p-5 shadow-sm transition-all duration-200',
    to
      ? 'group block cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      : 'hover:-translate-y-0.5 hover:shadow-md',
  )

  if (to) {
    return (
      <Link
        to={to}
        className={className}
        style={{ animationDelay: `${delay}ms` }}
        aria-label={`${label}: ${value} (${caption})`}
      >
        {cardContent}
      </Link>
    )
  }

  return (
    <div className={className} style={{ animationDelay: `${delay}ms` }}>
      {cardContent}
    </div>
  )
}
