import { useMemo, useState } from 'react'
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
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  CAMPOS_FIXOS_ATUALIZACAO_MOTORISTA,
  CAMPOS_FIXOS_ATUALIZACAO_FISCAL_COBRADOR,
} from '@/components/CartaProcessoModal'
import { createCarta, getProximoNumeroCartaSequencial } from '@/services/cartas'
import { uploadProcessoAnexo } from '@/services/processoAnexos'
import { createTimelineItem } from '@/services/processoTimeline'
import { updateProcessoSituacao } from '@/services/processosCadastrais'
import type { Employee, UserRole } from '@/lib/types'

interface NovaCartaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: Employee | null
  processoSituacao?: string
  processoId?: string
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

// Mapeamento legado para preencher campos da tabela cartas
function mapTituloParaLegado(
  titulo: string,
): 'cnh' | 'prontuario' | 'comprovante_residencia' | 'atestado' | 'doc_assinado_gestora' | null {
  const t = (titulo || '').toLowerCase()
  if (
    t.includes('sabrina') ||
    t.includes('gestora') ||
    t.includes('assinado') ||
    t.includes('assinada') ||
    t.includes('diretor') ||
    t.includes('ferraz') ||
    t.includes('leandro') ||
    t.includes('aptidão') ||
    t.includes('aptidao')
  ) {
    return 'doc_assinado_gestora'
  }
  if (
    t.includes('antecedente') ||
    t.includes('criminais') ||
    t.includes('atestado') ||
    t.includes('aso') ||
    t.includes('laudo')
  ) {
    return 'atestado'
  }
  if (
    t.includes('residência') ||
    t.includes('residencia') ||
    t.includes('endereço') ||
    t.includes('endereco')
  ) {
    return 'comprovante_residencia'
  }
  if (
    t.includes('prontuário') ||
    t.includes('prontuario') ||
    t.includes('certidão') ||
    t.includes('certidao')
  ) {
    return 'prontuario'
  }
  if (t.includes('cnh') || t.includes('rg') || t.includes('pessoal')) {
    return 'cnh'
  }
  return null
}

export default function NovaCartaModal({
  open,
  onOpenChange,
  employee,
  processoSituacao,
  processoId,
  onSuccess,
}: NovaCartaModalProps) {
  const { user } = useAuth()
  const userRole = ((user?.role as string) || 'Admin').toLowerCase()
  const isRH = userRole === 'rh'
  const isTrafego = userRole === 'tráfego' || userRole === 'trafego'
  const currentRole: UserRole = isTrafego ? 'Tráfego' : isRH ? 'RH' : 'Admin'
  const currentUserName =
    user?.name ||
    user?.email ||
    (isTrafego ? 'Operador Tráfego' : isRH ? 'Analista RH' : 'Administrador')

  const [numeroCarta, setNumeroCarta] = useState('')
  const [tipoCarta, setTipoCarta] = useState(
    processoSituacao === 'Foto Bloqueada'
      ? 'Foto Bloqueada'
      : processoSituacao === 'Impossibilitado de Trabalhar'
        ? 'Impossibilitado de Trabalhar'
        : 'Regularização de CNH',
  )
  const [funcaoCarta, setFuncaoCarta] = useState(employee?.funcao || '')
  // Mapa de arquivos indexado pelo nome do campo fixo
  const [anexosMap, setAnexosMap] = useState<Record<string, File | null>>({})
  const [saving, setSaving] = useState(false)

  // Determina lista de campos fixos baseada na função (funcaoCarta ou employee.funcao)
  const camposFixos = useMemo(() => {
    const fn = (funcaoCarta || employee?.funcao || '').trim().toLowerCase()
    const isMotorista = fn.includes('motorist')
    if (isMotorista) {
      return CAMPOS_FIXOS_ATUALIZACAO_MOTORISTA
    }
    return CAMPOS_FIXOS_ATUALIZACAO_FISCAL_COBRADOR
  }, [funcaoCarta, employee?.funcao])

  // Quando o colaborador muda ou o modal abre, reinicia o estado
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && employee) {
      const sit = String(processoSituacao || employee.situacao || '')
      setTipoCarta(
        sit === 'Foto Bloqueada'
          ? 'Foto Bloqueada'
          : sit === 'Impossibilitado de Trabalhar'
            ? 'Impossibilitado de Trabalhar'
            : 'Regularização de CNH',
      )
      setFuncaoCarta(String(employee.funcao || ''))
      setAnexosMap({})
      setNumeroCarta('')
      // Pré-preenche automaticamente com número sequencial iniciando em 289 (editável)
      void getProximoNumeroCartaSequencial().then((proxNum) => {
        setNumeroCarta((prev) => (prev ? prev : proxNum))
      })
    }
    onOpenChange(nextOpen)
  }

  const handleFileChange = (campo: string, fileList: FileList | null) => {
    const file = fileList && fileList[0] ? fileList[0] : null
    if (file) {
      const MAX_SIZE = 10 * 1024 * 1024
      if (file.size > MAX_SIZE) {
        toast.error(`O arquivo "${file.name}" excede o tamanho máximo permitido de 10 MB.`)
        return
      }
    }
    setAnexosMap((prev) => ({ ...prev, [campo]: file }))
  }

  const removeFile = (campo: string) => {
    setAnexosMap((prev) => ({ ...prev, [campo]: null }))
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

    // Validação de preenchimento dos campos fixos da função
    const missing: string[] = []
    for (const campo of camposFixos) {
      if (!anexosMap[campo]) {
        missing.push(campo)
      }
    }

    if (missing.length > 0) {
      toast.error(`Anexo(s) obrigatório(s) ausente(s): ${missing.join(', ')}.`)
      return
    }

    setSaving(true)
    try {
      const numCartaTrim = numeroCarta.trim()
      const matricula = employee.chapa || employee.registro || ''
      const colaboradorNome = employee.name

      // Monta mapeamento legado para a tabela `cartas`
      const legacyFiles: {
        cnh?: File
        prontuario?: File
        comprovante_residencia?: File
        atestado?: File
        doc_assinado_gestora?: File
      } = {}

      for (const campo of camposFixos) {
        const file = anexosMap[campo]
        if (!file) continue
        const legField = mapTituloParaLegado(campo)
        if (legField && !legacyFiles[legField]) {
          legacyFiles[legField] = file
        }
      }

      // 1. Cria a carta na coleção `cartas`
      await createCarta({
        numero_carta: numCartaTrim,
        colaborador: colaboradorNome,
        matricula,
        funcao_carta: funcaoCarta.trim(),
        tipo_carta: tipoCarta.trim(),
        cnh: legacyFiles.cnh,
        prontuario: legacyFiles.prontuario,
        comprovante_residencia: legacyFiles.comprovante_residencia,
        atestado: legacyFiles.atestado,
        doc_assinado_gestora: legacyFiles.doc_assinado_gestora,
        garagem: employee.filial || 'CURSINO',
        responsavel_nome: currentUserName,
        responsavel_perfil: currentRole,
        processoId,
      })

      // 2. Salva cada arquivo na coleção `processo_anexos` vinculado a processoId, numero_carta, matricula e colaborador
      for (const campo of camposFixos) {
        const file = anexosMap[campo]
        if (!file) continue
        try {
          const savedAnexo = await uploadProcessoAnexo({
            processoId,
            numero_carta: numCartaTrim,
            matricula,
            colaborador: colaboradorNome,
            titulo: campo,
            arquivo: file,
            criado_por: user?.id,
            criado_por_nome: currentUserName,
          })

          // 3. Registra na linha do tempo: "Documento anexado: [documento]"
          if (processoId) {
            try {
              await createTimelineItem({
                processo: processoId,
                etapa: 'Documento anexado',
                responsavel_nome: currentUserName,
                responsavel_perfil: currentRole,
                observacoes: `Documento anexado: ${campo} (${savedAnexo.arquivo || file.name})`,
              })
            } catch (tlErr) {
              console.warn('Erro ao registrar anexo na timeline:', tlErr)
            }
          }
        } catch (uploadErr) {
          console.warn(`Erro ao fazer upload do anexo "${campo}":`, uploadErr)
        }
      }

      // 4. Ao concluir anexos/emissão, atualiza a situação do processo em processos_cadastrais para 'Regular'
      if (processoId) {
        try {
          await updateProcessoSituacao(processoId, 'Regular')
        } catch (regErr) {
          console.warn('Erro ao atualizar situação para Regular:', regErr)
        }
      }

      toast.success(
        `Carta nº ${numCartaTrim} cadastrada! O processo de ${colaboradorNome} foi atualizado para "Regular".`,
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
            Cadastre os dados e anexe os documentos obrigatórios ({camposFixos.length} campos) para
            regularizar o processo do colaborador. Ao salvar, a situação em{' '}
            <strong>Processos Cadastrais</strong> será atualizada para{' '}
            <strong>&quot;Regular&quot;</strong>.
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

          {/* Campos de anexo específicos por função */}
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-xs font-bold text-foreground">
                Documentos Anexos ({camposFixos.length} obrigatórios)
              </span>
              <span className="text-[11px] text-muted-foreground">
                Formatos: PDF, JPG, PNG, DOCX (máx. 10 MB)
              </span>
            </div>

            <div className="space-y-2 pt-1">
              {camposFixos.map((campo, index) => {
                const file = anexosMap[campo] || null
                return (
                  <FileInputField
                    key={campo}
                    label={`${index + 1}. ${campo}`}
                    file={file}
                    onChange={(fl) => handleFileChange(campo, fl)}
                    onRemove={() => removeFile(campo)}
                    disabled={saving}
                  />
                )
              })}
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
  const inputId = `file-${label.replace(/[^a-zA-Z0-9]/g, '_')}`
  const temArquivo = !!file

  return (
    <div
      className={cn(
        'rounded-md border p-2.5 transition-colors',
        temArquivo
          ? 'bg-card border-emerald-300/60 dark:border-emerald-800/60'
          : 'bg-background/90 border-border/80 hover:border-border',
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className={cn(
              'flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-semibold',
              temArquivo
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {temArquivo ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-xs text-foreground truncate">{label}</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {temArquivo ? (
                <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                  ✓ Anexado: {file.name} ({(file.size / 1024).toFixed(0)} KB)
                </span>
              ) : (
                'Pendente — Nenhum arquivo anexado (máx. 10 MB)'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-none self-end sm:self-auto">
          {temArquivo ? (
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              className="inline-flex items-center gap-1 text-[11px] text-rose-600 hover:text-rose-800 font-medium px-2 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40"
              title="Remover arquivo selecionado"
            >
              <X className="h-3 w-3" />
              Remover
            </button>
          ) : null}

          <input
            id={inputId}
            type="file"
            className="hidden"
            disabled={disabled}
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            onChange={(e) => {
              onChange(e.target.files)
              e.target.value = ''
            }}
          />
          <label
            htmlFor={inputId}
            className={cn(
              'inline-flex h-7 items-center justify-center gap-1.5 cursor-pointer rounded-md px-2.5 text-[11px] font-medium transition-colors',
              temArquivo
                ? 'border border-input bg-background hover:bg-muted text-foreground'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
            title={temArquivo ? `Substituir arquivo para ${label}` : `Anexar ${label}`}
          >
            <Upload className="h-3 w-3" />
            <span>{temArquivo ? 'Substituir' : 'Anexar'}</span>
          </label>
        </div>
      </div>
    </div>
  )
}
