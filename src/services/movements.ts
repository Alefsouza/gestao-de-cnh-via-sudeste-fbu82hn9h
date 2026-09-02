import pb from '@/lib/pocketbase/client'
import type { Movement, MovementStage, MovementType } from '@/lib/types'

const COLLECTION = 'movements'

export interface CreateMovementInput {
  employee: string
  type: MovementType
  stage?: MovementStage | ''
  date?: string
  notes?: string
}

export async function listMovementsByEmployee(employeeId: string): Promise<Movement[]> {
  return pb.collection<Movement>(COLLECTION).getFullList({
    filter: `employee = "${employeeId}"`,
    sort: '-date',
  })
}

export async function listMovementsByType(type: MovementType): Promise<Movement[]> {
  return pb.collection<Movement>(COLLECTION).getFullList({
    filter: `type = "${type}"`,
    sort: '-date',
    expand: 'employee',
  })
}

export async function createMovement(input: CreateMovementInput): Promise<Movement> {
  return pb.collection<Movement>(COLLECTION).create({
    employee: input.employee,
    type: input.type,
    stage: input.stage || undefined,
    date: input.date ?? new Date().toISOString(),
    notes: input.notes ?? '',
  })
}

export async function updateMovementStage(id: string, stage: MovementStage): Promise<Movement> {
  return pb.collection<Movement>(COLLECTION).update(id, { stage })
}
