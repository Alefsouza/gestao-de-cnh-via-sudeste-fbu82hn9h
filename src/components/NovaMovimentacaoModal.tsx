import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import pb from '@/lib/pocketbase/client'
import { getEmployee } from '@/services/employees'
import { createMovement } from '@/services/movements'
import { createNotification } from '@/services/notifications'
import type { Employee } from '@/lib/types'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Plus } from 'lucide-react'

const STEP_1 = 1
const STEP_2 = 2

interface NovaMovimentacaoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultType?: string
}

const TYPES = ['Admissão', 'Afastamento', 'Retorno', 'Desligamento', 'Atualização fiscal']
const STAGES = ['Documentação', 'Exame médico', 'Treinamento', 'Integração']

export default function NovaMovimentacaoModal({
  open,
  onOpenChange,
  defaultType,
}: NovaMovimentacaoModalProps) {
  const [step, setStep] = useState(STEP_1)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Employee[]>([])
  const [selected, setSelected] = useState<Employee | null>(null)
  const [type, setType] = useState(defaultType || 'Admissão')
  const [stage, setStage] = useState('')
  const [notes, setNotes] = useState('')
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setStep(STEP_1)
      setSearch('')
      setResults([])
      setSelected(null)
      setType(defaultType || 'Admissão')
      setStage(defaultType === 'Admissão' ? 'Documentação' : '')
      setNotes('')
    }
  }, [open, defaultType])

  useEffect(() => {
    if (!open) return
    const term = search.trim()
    if (term.length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const safe = term.replace(/"/g, '\\"')
        const records = await pb.collection('employees').getList(1, 6, {
          filter: `(name ~ "${safe}" || chapa ~ "${safe}")`,
          sort: 'chapa',
        })
        setResults(records.items as unknown as Employee[])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [search, open])

  const handleSubmit = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await createMovement({
        employee: selected.id,
        type: type as never,
        stage: (type === 'Admissão' ? stage : '') as never,
        notes,
      })
      await createNotification({
        title: 'Nova movimentação',
        message: `${type} registrada para ${selected.name} (${selected.chapa}).`,
        type: 'info',
      })
      toast.success('Movimentação registrada com sucesso')
      onOpenChange(false)
    } catch {
      toast.error('Não foi possível registrar a movimentação')
    } finally {
      setSaving(false)
    }
  }

  const summary = useMemo(
    () => (selected ? `${selected.name} · ${selected.chapa} · ${selected.filial || '—'}` : ''),
    [selected],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Nova movimentação
          </DialogTitle>
          <DialogDescription>
            Registre admissões, afastamentos, retornos e outras movimentações de pessoal.
          </DialogDescription>
        </DialogHeader>

        {step === STEP_1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="colaborador">Colaborador</Label>
              <Input
                id="colaborador"
                placeholder="Buscar por nome ou chapa…"
                value={selected ? summary : search}
                onChange={(event) => {
                  setSelected(null)
                  setSearch(event.target.value)
                }}
                autoComplete="off"
              />
              {searching && <p className="text-xs text-muted-foreground">Buscando…</p>}
              {!searching && !selected && results.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-md border">
                  {results.map((employee) => (
                    <button
                      key={employee.id}
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-accent"
                      onClick={() => {
                        setSelected(employee)
                        setResults([])
                      }}
                    >
                      <span className="font-medium">{employee.name}</span>
                      <span className="text-xs text-muted-foreground">
                        Chapa {employee.chapa} · {employee.funcao || '—'} · {employee.filial || '—'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {!searching && !selected && search.trim().length >= 2 && results.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum colaborador encontrado.</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="button" disabled={!selected} onClick={() => setStep(STEP_2)}>
                Continuar
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === STEP_2 && selected && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">{selected.name}</span>
              <span className="text-muted-foreground"> · Chapa {selected.chapa}</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo de movimentação</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="tipo">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {type === 'Admissão' && (
              <div className="space-y-2">
                <Label htmlFor="etapa">Etapa atual</Label>
                <Select value={stage} onValueChange={setStage}>
                  <SelectTrigger id="etapa">
                    <SelectValue placeholder="Selecione a etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                placeholder="Detalhes da movimentação (opcional)"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(STEP_1)}
                disabled={saving}
              >
                Voltar
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={saving || (type === 'Admissão' && !stage)}
              >
                {saving ? 'Salvando…' : 'Registrar movimentação'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
