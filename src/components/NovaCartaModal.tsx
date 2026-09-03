import { useState } from 'react'
import { CheckCircle2, FileText, Loader2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'

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
import { createCarta } from '@/services/cartas'
import type { Employee } from '@/lib/types'

interface NovaCartaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: Employee | null
  processoSituacao?: string
  onSuccess?: () => void
}

const TIPOS_CARTA_PADRAO = [
  'Regularização de CNH',
  'Foto Bloqueada',
  'Impossibilitado de Trabalhar',
  'Notificação Cadastral',
  'Encaminhamento SPTrans',
  'Outro',
]

interface FileState {
  cnh: File | null
  prontuario: File | null
  comprovante_residencia: File | null
  atestado: File | null
  doc_assinado_gestora: File | null
}

export default function NovaCartaModal({
  open,
  onOpenChange,
  employee,
  processoSituacao,
  onSuccess,
}: NovaCartaModalProps) {
  const [numeroCarta, setNumeroCarta] = useState('')
  const [tipoCarta, setTipoCarta] = useState(
    processoSituacao === 'Foto Bloqueada'
      ? 'Foto Bloqueada'
      : processoSituacao === 'Impossibilitado de Trabalhar'
        ? 'Impossibilitado de Trabalhar'
        : 'Regularização de CNH',
  )
  const [funcaoCarta, setFuncaoCarta] = useState(employee?.funcao || '')
  const [files, setFiles] = useState<FileState>({
    cnh: null,
    prontuario: null,
    comprovante_residencia: null,
    atestado: null,
    doc_assinado_gestora: null,
  })
  const [saving, setSaving] = useState(false)

  // Quando o colaborador muda ou o modal abre, reinicia o estado
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && employee) {
      const sit = String(processoSituacao || employee.situacao || '')
      setNumeroCarta('')
      setTipoCarta(
        sit === 'Foto Bloqueada'
          ? 'Foto Bloqueada'
          : sit === 'Impossibilitado de Trabalhar'
            ? 'Impossibilitado de Trabalhar'
            : 'Regularização de CNH',
      )
      setFuncaoCarta(String(employee.funcao || ''))
      setFiles({
        cnh: null,
        prontuario: null,
        comprovante_residencia: null,
        atestado: null,
        doc_assinado_gestora: null,
      })
    }
    onOpenChange(nextOpen)
  }

  const handleFileChange = (field: keyof FileState, fileList: FileList | null) => {
    const file = fileList && fileList[0] ? fileList[0] : null
    setFiles((prev) => ({ ...prev, [field]: file }))
  }

  const removeFile = (field: keyof FileState) => {
    setFiles((prev) => ({ ...prev, [field]: null }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!employee) return

    if (!numeroCarta.trim()) {
      toast.error('Informe o Nº da carta.')
      return
    }

    if (!tipoCarta.trim()) {
      toast.error('Informe o Tipo de carta.')
      return
    }

    if (!funcaoCarta.trim()) {
      toast.error('O campo "Função - Carta" não pode ficar vazio.')
      return
    }

    // Validação estrita dos 5 anexos
    const missing: string[] = []
    if (!files.cnh) missing.push('CNH')
    if (!files.prontuario) missing.push('Prontuário')
    if (!files.comprovante_residencia) missing.push('Comprovante de Residência')
    if (!files.atestado) missing.push('Atestado')
    if (!files.doc_assinado_gestora) missing.push('Doc. Assinado pela Gestora')

    if (missing.length > 0) {
      toast.error(`Anexo(s) obrigatório(s) ausente(s): ${missing.join(', ')}.`)
      return
    }

    setSaving(true)
    try {
      await createCarta({
        numero_carta: numeroCarta.trim(),
        colaborador: employee.name,
        matricula: employee.chapa || employee.registro || '',
        funcao_carta: funcaoCarta.trim(),
        tipo_carta: tipoCarta.trim(),
        cnh: files.cnh!,
        prontuario: files.prontuario!,
        comprovante_residencia: files.comprovante_residencia!,
        atestado: files.atestado!,
        doc_assinado_gestora: files.doc_assinado_gestora!,
        garagem: employee.filial || 'CURSINO',
      })

      toast.success(
        `Carta nº ${numeroCarta} cadastrada! O processo de ${employee.name} foi atualizado para "Regular".`,
      )
      onOpenChange(false)
      if (onSuccess) onSuccess()
    } catch (err: any) {
      console.error('Erro ao salvar carta:', err)
      const msg = err?.message || 'Erro ao registrar a carta no servidor.'
      toast.error(`Falha ao salvar carta: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Emissão e Regularização de Carta
          </DialogTitle>
          <DialogDescription>
            Cadastre os dados e anexe os 5 documentos obrigatórios para regularizar o processo do
            colaborador. Ao salvar, a situação em <strong>Processos Cadastrais</strong> será
            atualizada para <strong>&quot;Regular&quot;</strong>.
          </DialogDescription>
        </DialogHeader>

        {employee && (
          <div className="rounded-lg border bg-muted/40 p-3 text-xs">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div>
                <span className="text-muted-foreground">Colaborador:</span>
                <p className="font-semibold text-foreground">{employee.name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Registro / Chapa:</span>
                <p className="font-semibold text-foreground">
                  {employee.chapa || employee.registro || '—'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Filial / Garagem:</span>
                <p className="font-semibold text-foreground">{employee.filial || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Função Original:</span>
                <p className="text-foreground">{employee.funcao || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Situação Atual:</span>
                <p className="font-semibold text-amber-700">
                  {processoSituacao || employee.situacao || '—'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">CNH / Categoria:</span>
                <p className="text-foreground">
                  {employee.cnh_numero || '—'} ({employee.cnh_categoria || '—'})
                </p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="numero_carta" className="text-xs font-semibold">
                Nº da carta <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="numero_carta"
                placeholder="Ex: 278/76 ou 1042/2026"
                value={numeroCarta}
                onChange={(e) => setNumeroCarta(e.target.value)}
                required
                disabled={saving}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tipo_carta" className="text-xs font-semibold">
                Tipo de carta <span className="text-rose-500">*</span>
              </Label>
              <Select
                value={tipoCarta}
                onValueChange={(val) => setTipoCarta(val)}
                disabled={saving}
              >
                <SelectTrigger id="tipo_carta">
                  <SelectValue placeholder="Selecione o tipo de carta" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_CARTA_PADRAO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="funcao_carta" className="text-xs font-semibold">
              Função - Carta <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="funcao_carta"
              placeholder="Função para a carta (pré-preenchida, editável)"
              value={funcaoCarta}
              onChange={(e) => setFuncaoCarta(e.target.value)}
              required
              disabled={saving}
            />
            <p className="text-[11px] text-muted-foreground">
              Vem pré-preenchida com a função do colaborador, mas permanece editável.
            </p>
          </div>

          {/* 5 campos de anexo obrigatórios */}
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-xs font-bold text-foreground">
                Documentos Anexos (5 obrigatórios)
              </span>
              <span className="text-[11px] text-muted-foreground">
                Formatos aceitos: PDF, JPG, PNG
              </span>
            </div>

            <div className="space-y-3 pt-1">
              <FileInputField
                label="1. CNH"
                file={files.cnh}
                onChange={(f) => handleFileChange('cnh', f)}
                onRemove={() => removeFile('cnh')}
                disabled={saving}
              />

              <FileInputField
                label="2. Prontuário"
                file={files.prontuario}
                onChange={(f) => handleFileChange('prontuario', f)}
                onRemove={() => removeFile('prontuario')}
                disabled={saving}
              />

              <FileInputField
                label="3. Comprovante de Residência"
                file={files.comprovante_residencia}
                onChange={(f) => handleFileChange('comprovante_residencia', f)}
                onRemove={() => removeFile('comprovante_residencia')}
                disabled={saving}
              />

              <FileInputField
                label="4. Atestado"
                file={files.atestado}
                onChange={(f) => handleFileChange('atestado', f)}
                onRemove={() => removeFile('atestado')}
                disabled={saving}
              />

              <FileInputField
                label="5. Doc. Assinado pela Gestora"
                file={files.doc_assinado_gestora}
                onChange={(f) => handleFileChange('doc_assinado_gestora', f)}
                onRemove={() => removeFile('doc_assinado_gestora')}
                disabled={saving}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando carta…
                </>
              ) : (
                'Salvar e Regularizar'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FileInputField({
  label,
  file,
  onChange,
  onRemove,
  disabled,
}: {
  label: string
  file: File | null
  onChange: (files: FileList | null) => void
  onRemove: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-xs rounded-md bg-muted/20 p-2 border border-dashed border-border/80">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-foreground min-w-[180px]">{label}</span>
        {file ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium truncate max-w-[220px]">
            <FileText className="h-3.5 w-3.5 flex-none" />
            <span className="truncate">{file.name}</span>
            <span className="text-[10px] text-muted-foreground flex-none">
              ({(file.size / 1024).toFixed(0)} KB)
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground italic text-[11px]">Nenhum arquivo anexado</span>
        )}
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto">
        {file ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-800 text-[11px] font-medium"
            title="Remover arquivo"
          >
            <X className="h-3.5 w-3.5" />
            Remover
          </button>
        ) : (
          <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-md bg-white border border-input px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors">
            <Upload className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Anexar</span>
            <input
              type="file"
              className="hidden"
              onChange={(e) => onChange(e.target.files)}
              disabled={disabled}
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            />
          </label>
        )}
      </div>
    </div>
  )
}
