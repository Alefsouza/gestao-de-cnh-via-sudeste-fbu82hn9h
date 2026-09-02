import { useState } from 'react'
import { Users, UserMinus, CreditCard, FileCheck2 } from 'lucide-react'

interface StatCardProps {
  title: string
  value: number
  icon: 'users' | 'user-minus' | 'credit-card' | 'file-check'
  tint: 'green' | 'amber' | 'red' | 'teal'
  caption: string
}

const StatCard = ({ title, value, icon, tint, caption }: StatCardProps) => {
  const icons = {
    users: Users,
    'user-minus': UserMinus,
    'credit-card': CreditCard,
    'file-check': FileCheck2,
  }
  const Icon = icons[icon]
  const tints = {
    green: 'bg-green-100 text-green-600',
    amber: 'bg-amber-100 text-amber-600',
    red: 'bg-red-100 text-red-600',
    teal: 'bg-teal-100 text-teal-600',
  }

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`rounded-lg p-3 ${tints[tint]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
      <p className="mt-4 text-xs text-gray-500">{caption}</p>
    </div>
  )
}

export default StatCard
