import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Loader2,
  Mail,
  Printer,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { createCarta, listCartas, type CartaRecord } from '@/services/cartas'
import {
  uploadProcessoAnexo,
  listAnexosByCarta,
  listAnexosByProcesso,
  deleteProcessoAnexo,
  getProcessoAnexoFileUrl,
  type ProcessoAnexoRecord,
} from '@/services/processoAnexos'
import { createTimelineItem } from '@/services/processoTimeline'
import { updateProcessoSituacao } from '@/services/processosCadastrais'
import pb from '@/lib/pocketbase/client'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/types'

export interface CartaColaboradorInfo {
  processoId?: string
  matricula: string
  nome: string
  funcao?: string
  garagem?: string
  processoTipo?: string
}

interface CartaProcessoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  colaboradores: CartaColaboradorInfo[]
  tipoProcesso?: string
  initialNumeroCarta?: string
  isEditMode?: boolean
  onSuccess?: (numeroCarta: string) => void
}

const TIPOS_CARTA_PADRAO = [
  'Inclusão',
  'PRAT',
  'Mudança de Função',
  'Exclusão',
  'Retorno do Afastamento',
  'Regularização de CNH',
  'Foto Bloqueada',
  'Impossibilitado de Trabalhar',
  'Notificação Cadastral',
  'Encaminhamento SPTrans',
  'Admissão / Inclusão',
  'Exclusão / Desligamento',
  'Outro',
]

// Listas fixas de documentos por tipo de processo e função
const CAMPOS_FIXOS_PADRAO = [
  'Documento pessoal (RG / CNH)',
  'Comprovante de Residência',
  'Prontuário',
  'Atestado Médico / ASO',
  'Doc. Assinado pela Gestora',
  'Comprovante de Desligamento / Rescisão',
  'Outro comprovante',
]

// Carta PRAT: campos fixos específicos solicitados
const CAMPOS_FIXOS_PRAT = [
  'Exame Psicotécnico',
  'Certificado de Direção Defensiva',
  'Laudo Médico',
  'Doc. assinado pelo Diretor Leandro Ferraz',
]

// Carta Retorno do Afastamento — Motorista (ou padrão para outras funções que não sejam Cobrador)
const CAMPOS_FIXOS_RETORNO_MOTORISTA = [
  'CNH',
  'Prontuário',
  'ASO',
  'Comprovante de Endereço',
  'Antecedente Criminal',
]

// Carta Retorno do Afastamento — Cobrador
const CAMPOS_FIXOS_RETORNO_COBRADOR = [
  'RG',
  'ASO',
  'Comprovante de Endereço',
  'Antecedente Criminal',
]

/**
 * Retorna os campos fixos de documentos para um colaborador específico dentro da carta,
 * respeitando o tipo de processo/carta e a função do colaborador.
 */
export function getCamposFixosColaborador(
  colab: CartaColaboradorInfo,
  tipoProcessoOuCarta?: string,
): string[] {
  const tipo = (colab.processoTipo || tipoProcessoOuCarta || '').trim().toLowerCase()

  // 1. Processo PRAT
  if (tipo === 'prat' || tipo.includes('prat')) {
    return CAMPOS_FIXOS_PRAT
  }

  // 2. Processo Retorno do Afastamento
  if (tipo === 'retorno do afastamento' || tipo.includes('retorno')) {
    const funcaoNorm = (colab.funcao || '').trim().toLowerCase()
    const isCobrador = funcaoNorm.includes('cobrador') || funcaoNorm.includes('cobr')

    if (isCobrador) {
      return CAMPOS_FIXOS_RETORNO_COBRADOR
    }
    // Motorista ou qualquer outra função não-cobrador usa a lista do Motorista
    return CAMPOS_FIXOS_RETORNO_MOTORISTA
  }

  // 3. Demais processos (Inclusão, Mudança de Função, Exclusão, Atualização, etc.)
  return CAMPOS_FIXOS_PADRAO
}

// Mantido para compatibilidade com outros arquivos ou fallbacks gerais
export const TIPOS_ANEXO_SUGERIDOS = CAMPOS_FIXOS_PADRAO

export default function CartaProcessoModal({
  open,
  onOpenChange,
  colaboradores,
  tipoProcesso,
  initialNumeroCarta,
  isEditMode = false,
  onSuccess,
}: CartaProcessoModalProps) {
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
  const [tipoCarta, setTipoCarta] = useState('Regularização de CNH')
  const [funcaoCartaGeral, setFuncaoCartaGeral] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedMatriculas, setExpandedMatriculas] = useState<Record<string, boolean>>({})

  // Anexos locais pendentes de envio (estritamente por processoId)
  // Cada item: { file: File, titulo: string, id: string }
  const [pendingAnexos, setPendingAnexos] = useState<
    Record<string, Array<{ id: string; file: File; titulo: string }>>
  >({})

  // Anexos já persistidos no backend (estritamente por processoId)
  const [savedAnexos, setSavedAnexos] = useState<Record<string, ProcessoAnexoRecord[]>>({})
  const [loadingSavedAnexos, setLoadingSavedAnexos] = useState(false)

  // Define tipo padrão de carta baseado no tipo de processo
  const getDefaultTipoCarta = (tipo?: string) => {
    const trimmed = tipo?.trim()
    if (!trimmed) return 'Inclusão'
    // Prioriza o tipo exato do processo cadastral registrado (ex: 'Inclusão', 'PRAT', 'Mudança de Função', 'Exclusão', 'Retorno do Afastamento')
    return trimmed
  }

  // Inicialização quando o modal abre
  useEffect(() => {
    if (!open) {
      setExpandedMatriculas({})
      setPendingAnexos({})
      setSavedAnexos({})
      return
    }

    const defaultTipo = getDefaultTipoCarta(tipoProcesso)
    setTipoCarta(defaultTipo)

    if (initialNumeroCarta) {
      setNumeroCarta(initialNumeroCarta)
      // Carrega anexos já existentes do backend para essa carta
      loadExistingAnexos(initialNumeroCarta)
    } else {
      setNumeroCarta('')
      // Inicializa mapa vazio
      setPendingAnexos({})
      setSavedAnexos({})
    }

    // Função padrão sugerida
    const primeiraFuncao = colaboradores[0]?.funcao || 'Motorista'
    setFuncaoCartaGeral(primeiraFuncao)

    // Se estiver em modo edição ou se houver processos vinculados, busca anexos por processo
    if (isEditMode) {
      loadAnexosPorProcessos(colaboradores)
    }
  }, [open, initialNumeroCarta, tipoProcesso, colaboradores, isEditMode])

  const getColabKey = (colab: CartaColaboradorInfo): string => {
    return colab.processoId || colab.matricula || colab.nome
  }

  const loadExistingAnexos = async (numCarta: string) => {
    if (!numCarta) return
    setLoadingSavedAnexos(true)
    try {
      const records = await listAnexosByCarta(numCarta)
      const grouped: Record<string, ProcessoAnexoRecord[]> = {}
      for (const rec of records) {
        // Chave estrita por processo se existir
        const key = rec.processo || (rec.matricula || '').trim() || (rec.colaborador || '').trim()
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(rec)
      }
      setSavedAnexos((prev) => ({ ...prev, ...grouped }))
    } catch (err) {
      console.warn('Erro ao carregar anexos salvos da carta:', err)
    } finally {
      setLoadingSavedAnexos(false)
    }
  }

  const loadAnexosPorProcessos = async (colabs: CartaColaboradorInfo[]) => {
    const procIds = colabs.map((c) => c.processoId).filter(Boolean) as string[]
    if (procIds.length === 0) return
    setLoadingSavedAnexos(true)
    try {
      const all: Record<string, ProcessoAnexoRecord[]> = {}
      for (const colab of colabs) {
        if (!colab.processoId) continue
        const recs = await listAnexosByProcesso(colab.processoId)
        const key = getColabKey(colab)
        all[key] = recs
      }
      setSavedAnexos((prev) => ({ ...prev, ...all }))
    } catch (err) {
      console.warn('Erro ao carregar anexos por processo:', err)
    } finally {
      setLoadingSavedAnexos(false)
    }
  }

  const toggleExpand = (key: string) => {
    setExpandedMatriculas((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  // Adicionar anexo pendente com tipo fixo de documento
  const handleAddPendingAnexo = (
    key: string,
    fileList: FileList | null,
    colab: CartaColaboradorInfo,
    tipoDoc?: string,
  ) => {
    if (!fileList || fileList.length === 0) return
    const file = fileList[0]

    // Limite de tamanho: 10MB
    const MAX_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      toast.error(`O arquivo "${file.name}" excede o tamanho máximo permitido de 10 MB.`)
      return
    }

    const tituloFinal = (tipoDoc && tipoDoc.trim()) || file.name
    const newAnexo = {
      id: `${Date.now()}-${Math.random()}`,
      file,
      titulo: tituloFinal,
    }

    // Se já existia um pendente com este mesmo tipo/título, substitui pelo novo arquivo
    setPendingAnexos((prev) => {
      const atuais = prev[key] || []
      const filtrados = tipoDoc ? atuais.filter((a) => a.titulo !== tipoDoc) : atuais
      return {
        ...prev,
        [key]: [...filtrados, newAnexo],
      }
    })

    // Se estiver em modo edição (já existe carta e processo salvos), faz upload direto
    if (isEditMode && (numeroCarta || colab.processoId)) {
      void uploadSingleAnexoNow(key, file, tituloFinal, colab)
    }

    toast.success(`"${tituloFinal}" selecionado para ${colab.nome}.`)
  }

  // Mapeia título do anexo para o campo legado correspondente na coleção `cartas`
  const mapTituloParaCampoCarta = (titulo: string): string | null => {
    const t = (titulo || '').toLowerCase()
    if (
      t.includes('rg') ||
      t.includes('cnh') ||
      t.includes('pessoal') ||
      t.includes('psicotécnico') ||
      t.includes('psicotecnico')
    ) {
      return 'cnh'
    }
    if (
      t.includes('residência') ||
      t.includes('residencia') ||
      t.includes('endereço') ||
      t.includes('endereco') ||
      t.includes('direção defensiva') ||
      t.includes('direcao defensiva')
    ) {
      return 'comprovante_residencia'
    }
    if (t.includes('prontuário') || t.includes('prontuario') || t.includes('antecedente')) {
      return 'prontuario'
    }
    if (t.includes('atestado') || t.includes('aso') || t.includes('laudo')) {
      return 'atestado'
    }
    if (
      t.includes('gestora') ||
      t.includes('assinado') ||
      t.includes('diretor') ||
      t.includes('ferraz')
    ) {
      return 'doc_assinado_gestora'
    }
    return null
  }

  // Atualiza os campos legados da coleção cartas com os nomes de arquivos salvos
  const syncCamposLegadosCarta = async (
    numCarta: string,
    colab: CartaColaboradorInfo,
    anexosDoColab: Array<{ titulo?: string; arquivo?: string }>,
  ) => {
    if (!numCarta) return
    try {
      const mat = (colab.matricula || '').trim()
      const nome = (colab.nome || '').trim()
      let filter = `numero_carta = "${numCarta.replace(/"/g, '\\"')}"`
      if (mat) {
        filter += ` && matricula = "${mat.replace(/"/g, '\\"')}"`
      } else if (nome) {
        filter += ` && colaborador ~ "${nome.replace(/"/g, '\\"')}"`
      }
      const res = await pb.collection('cartas').getList(1, 1, { filter })
      if (res.items.length === 0) return

      const cartaId = res.items[0].id
      const patchData: Record<string, string> = {}
      for (const item of anexosDoColab) {
        const campo = mapTituloParaCampoCarta(item.titulo || '')
        if (campo && item.arquivo) {
          patchData[campo] = item.arquivo
        }
      }
      if (Object.keys(patchData).length > 0) {
        await pb.collection('cartas').update(cartaId, patchData)
      }
    } catch (errSync) {
      console.warn('Erro ao sincronizar campos legados em cartas:', errSync)
    }
  }

  const uploadSingleAnexoNow = async (
    key: string,
    file: File,
    titulo: string,
    colab: CartaColaboradorInfo,
  ) => {
    try {
      const tituloFinal = titulo || file.name
      const saved = await uploadProcessoAnexo({
        processoId: colab.processoId,
        numero_carta: numeroCarta.trim(),
        matricula: colab.matricula,
        colaborador: colab.nome,
        titulo: tituloFinal,
        arquivo: file,
        criado_por: user?.id,
        criado_por_nome: currentUserName,
      })
      const novosSalvos = [saved, ...(savedAnexos[key] || [])]
      setSavedAnexos((prev) => ({
        ...prev,
        [key]: [saved, ...(prev[key] || [])],
      }))
      // Remove da lista pendente
      setPendingAnexos((prev) => ({
        ...prev,
        [key]: (prev[key] || []).filter((p) => p.file !== file),
      }))

      // Cria item na timeline do processo: "Documento anexado"
      if (colab.processoId) {
        try {
          await createTimelineItem({
            processo: colab.processoId,
            etapa: 'Documento anexado',
            responsavel_nome: currentUserName,
            responsavel_perfil: currentRole,
            observacoes: `Documento anexado: ${tituloFinal} (${file.name})`,
          })
        } catch (tlErr) {
          console.warn('Erro ao registrar upload na timeline:', tlErr)
        }

        // Sincroniza campos legados da carta se já existir
        if (numeroCarta.trim()) {
          void syncCamposLegadosCarta(numeroCarta.trim(), colab, [
            { titulo: tituloFinal, arquivo: saved.arquivo },
          ])
        }

        // Regra "Regular": ao anexar documentos (>= total de campos fixos do colaborador ou >= 1 anexo relevante),
        // atualiza situação para Regular. Se anexou ao menos um anexo ou completou a lista do tipo/função:
        const camposFixosColab = getCamposFixosColaborador(colab, tipoProcesso || tipoCarta)
        const qtdNecessaria = Math.min(camposFixosColab.length, 4)
        if (novosSalvos.length >= qtdNecessaria || novosSalvos.length >= 4) {
          try {
            await updateProcessoSituacao(colab.processoId, 'Regular')
          } catch (regErr) {
            console.warn('Erro ao atualizar situação para Regular:', regErr)
          }
        }
      }

      toast.success(`Anexo "${file.name}" salvo com sucesso no servidor.`)
    } catch (err: any) {
      console.error('Erro ao enviar anexo:', err)
      toast.error(`Falha ao enviar anexo: ${err?.message || 'Erro desconhecido'}`)
    }
  }

  const handleRemovePendingAnexo = (key: string, id: string) => {
    setPendingAnexos((prev) => ({
      ...prev,
      [key]: (prev[key] || []).filter((a) => a.id !== id),
    }))
  }

  const handleDeleteSavedAnexo = async (
    key: string,
    anexoId: string,
    colab?: CartaColaboradorInfo,
  ) => {
    try {
      const anexoObj = (savedAnexos[key] || []).find((a) => a.id === anexoId)
      await deleteProcessoAnexo(anexoId)
      setSavedAnexos((prev) => ({
        ...prev,
        [key]: (prev[key] || []).filter((a) => a.id !== anexoId),
      }))

      // Timeline de exclusão (Remoção de anexo NÃO reverte situação do processo)
      const procId = colab?.processoId || anexoObj?.processo
      if (procId) {
        try {
          await createTimelineItem({
            processo: procId,
            etapa: 'Documento removido',
            responsavel_nome: currentUserName,
            responsavel_perfil: currentRole,
            observacoes: `Documento removido: ${anexoObj?.titulo || anexoObj?.arquivo || 'Documento'}`,
          })
        } catch (tlErr) {
          console.warn('Erro ao registrar remoção na timeline:', tlErr)
        }
      }

      toast.success('Anexo removido com sucesso.')
    } catch (err: any) {
      console.error('Erro ao excluir anexo:', err)
      toast.error(`Erro ao excluir anexo: ${err?.message || 'Tente novamente.'}`)
    }
  }

  // Submeter / Salvar carta
  const handleSalvarCarta = async () => {
    if (!numeroCarta.trim()) {
      toast.error('Informe o Número da carta.')
      return
    }

    if (!tipoCarta.trim()) {
      toast.error('Informe o Tipo da carta.')
      return
    }

    if (colaboradores.length === 0) {
      toast.error('Nenhum colaborador incluído para emissão da carta.')
      return
    }

    setSaving(true)
    try {
      const numCartaTrim = numeroCarta.trim()
      const tipoCartaTrim = tipoCarta.trim()
      const funcaoPadrao = funcaoCartaGeral.trim() || 'Motorista'

      // Cria ou atualiza os registros de carta na coleção `cartas` para cada colaborador
      // e faz o upload dos anexos vinculados a cada um
      for (const colab of colaboradores) {
        const key = getColabKey(colab)
        const anexosDoColab = pendingAnexos[key] || []
        const anexosJaSalvos = savedAnexos[key] || []

        // Verifica se a carta já existe para esse colaborador
        const cartasExistentes = await listCartas()
        let cartaRegistro = cartasExistentes.find(
          (c) =>
            (c.numero_carta || '').trim() === numCartaTrim &&
            ((c.matricula && c.matricula.trim() === colab.matricula.trim()) ||
              c.colaborador.trim().toLowerCase() === colab.nome.trim().toLowerCase()),
        )

        if (!cartaRegistro) {
          // Cria o registro na coleção cartas
          cartaRegistro = await createCarta({
            numero_carta: numCartaTrim,
            colaborador: colab.nome,
            matricula: colab.matricula,
            funcao_carta: colab.funcao || funcaoPadrao,
            tipo_carta: tipoCartaTrim,
            garagem: colab.garagem || 'CURSINO',
            responsavel_nome: currentUserName,
            responsavel_perfil: currentRole,
            processoId: colab.processoId,
          })
        }

        const novosSalvosNestaRodada: ProcessoAnexoRecord[] = []

        // Faz upload de cada anexo pendente vinculado a este colaborador
        for (const anexoItem of anexosDoColab) {
          try {
            const saved = await uploadProcessoAnexo({
              processoId: colab.processoId,
              numero_carta: numCartaTrim,
              matricula: colab.matricula,
              colaborador: colab.nome,
              titulo: anexoItem.titulo || anexoItem.file.name,
              arquivo: anexoItem.file,
              criado_por: user?.id,
              criado_por_nome: currentUserName,
            })
            novosSalvosNestaRodada.push(saved)

            // Timeline do processo para cada upload
            if (colab.processoId) {
              try {
                await createTimelineItem({
                  processo: colab.processoId,
                  etapa: 'Documento anexado',
                  responsavel_nome: currentUserName,
                  responsavel_perfil: currentRole,
                  observacoes: `Documento anexado: ${saved.titulo} (${saved.arquivo})`,
                })
              } catch (tlErr) {
                console.warn('Erro ao registrar upload na timeline:', tlErr)
              }
            }
          } catch (anexoErr) {
            console.warn(
              `Erro ao fazer upload do anexo ${anexoItem.file.name} para ${colab.nome}:`,
              anexoErr,
            )
          }
        }

        // Preenche também os campos legados da coleção cartas com todos os anexos deste colaborador
        const todosAnexos = [
          ...anexosJaSalvos.map((a) => ({ titulo: a.titulo, arquivo: a.arquivo })),
          ...novosSalvosNestaRodada.map((a) => ({ titulo: a.titulo, arquivo: a.arquivo })),
        ]
        await syncCamposLegadosCarta(numCartaTrim, colab, todosAnexos)

        // Se houver anexos já existentes que estavam sem numero_carta ou com numero desatualizado, atualiza
        for (const sal of anexosJaSalvos) {
          if (!sal.numero_carta || sal.numero_carta !== numCartaTrim) {
            try {
              await pb.collection('processo_anexos').update(sal.id, {
                numero_carta: numCartaTrim,
              })
            } catch {
              /* intentionally ignored */
            }
          }
        }

        // Regra "Regular": ao salvar a carta, atualiza a situação do processo para "Regular"
        if (colab.processoId) {
          try {
            await updateProcessoSituacao(colab.processoId, 'Regular')
          } catch (regErr) {
            console.warn('Erro ao atualizar processo para Regular ao salvar carta:', regErr)
          }
        }
      }

      toast.success(
        `Carta N.º ${numCartaTrim} gerada com sucesso com ${colaboradores.length} colaborador(es) e seus anexos!`,
      )
      onOpenChange(false)
      if (onSuccess) onSuccess(numCartaTrim)
    } catch (err: any) {
      console.error('Erro ao salvar carta:', err)
      toast.error(`Falha ao registrar carta: ${err?.message || 'Erro desconhecido'}`)
    } finally {
      setSaving(false)
    }
  }

  // Ação de Impressão da Carta (Gera visualização de impressão nativa)
  const handleImprimirCarta = async () => {
    if (!numeroCarta.trim()) {
      toast.error('Informe o Número da carta antes de imprimir.')
      return
    }

    // Mantém a regularização existente ao "Gerar/Imprimir Carta"
    for (const colab of colaboradores) {
      if (colab.processoId) {
        try {
          await updateProcessoSituacao(colab.processoId, 'Regular')
        } catch (errReg) {
          console.warn('Erro ao manter regularização ao imprimir carta:', errReg)
        }
      }
    }

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('Permita pop-ups no navegador para imprimir a carta.')
      return
    }

    const dataHoje = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })

    const rowsHtml = colaboradores
      .map((colab, idx) => {
        const key = getColabKey(colab)
        const anexosSalvos = savedAnexos[key] || []
        const anexosPend = pendingAnexos[key] || []
        const totalAnexos = anexosSalvos.length + anexosPend.length
        const listaDocs = [
          ...anexosSalvos.map((a) => a.titulo || a.arquivo),
          ...anexosPend.map((a) => a.titulo || a.file.name),
        ]
        const docsTexto = listaDocs.length > 0 ? listaDocs.join(', ') : 'Nenhum documento anexado'

        return `
        <tr>
          <td style="border: 1px solid #cbd5e1; padding: 8px; text-align: center;">${idx + 1}</td>
          <td style="border: 1px solid #cbd5e1; padding: 8px; font-weight: 600;">${colab.nome}</td>
          <td style="border: 1px solid #cbd5e1; padding: 8px; font-family: monospace;">${colab.matricula || '—'}</td>
          <td style="border: 1px solid #cbd5e1; padding: 8px;">${colab.funcao || funcaoCartaGeral || 'Motorista'}</td>
          <td style="border: 1px solid #cbd5e1; padding: 8px;">${colab.garagem || 'CURSINO'}</td>
          <td style="border: 1px solid #cbd5e1; padding: 8px; font-size: 11px;">
            <strong>(${totalAnexos} anexo(s)):</strong> ${docsTexto}
          </td>
        </tr>
      `
      })
      .join('')

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Carta do Processo N.º ${numeroCarta}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #1e293b;
            margin: 40px;
            font-size: 13px;
            line-height: 1.5;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          .company-title {
            font-size: 18px;
            font-weight: bold;
            color: #0f172a;
          }
          .doc-title {
            font-size: 16px;
            font-weight: bold;
            text-align: center;
            margin: 20px 0 10px 0;
            text-transform: uppercase;
          }
          .meta-box {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 12px 16px;
            margin-bottom: 20px;
            border-radius: 4px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          th {
            background-color: #f1f5f9;
            border: 1px solid #cbd5e1;
            padding: 8px;
            text-align: left;
            font-size: 12px;
          }
          .footer {
            margin-top: 50px;
            display: flex;
            justify-content: space-between;
          }
          .signature-box {
            width: 45%;
            border-top: 1px solid #0f172a;
            padding-top: 8px;
            text-align: center;
            font-size: 12px;
          }
          @media print {
            body { margin: 20px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="company-title">VIA SUDESTE TRANSPORTES URBANOS</div>
            <div style="font-size: 11px; color: #64748b;">Sistema Integrado de Gestão Cadastral e CNH</div>
          </div>
          <div style="text-align: right; font-size: 12px;">
            <strong>Carta N.º:</strong> ${numeroCarta}<br>
            <strong>Data:</strong> ${dataHoje}
          </div>
        </div>

        <div class="doc-title">CARTA DE PROCESSO CADASTRAL — ${tipoCarta.toUpperCase()}</div>

        <div class="meta-box">
          <table style="margin: 0; border: none;">
            <tr style="border: none;">
              <td style="border: none; padding: 4px 8px;"><strong>Tipo de Processo:</strong> ${tipoProcesso || tipoCarta}</td>
              <td style="border: none; padding: 4px 8px;"><strong>Finalidade da Carta:</strong> ${tipoCarta}</td>
            </tr>
            <tr style="border: none;">
              <td style="border: none; padding: 4px 8px;"><strong>Responsável pela Emissão:</strong> ${currentUserName} (${currentRole})</td>
              <td style="border: none; padding: 4px 8px;"><strong>Colaboradores Incluídos:</strong> ${colaboradores.length}</td>
            </tr>
          </table>
        </div>

        <p>
          Certificamos que os colaboradores abaixo relacionados foram devidamente registrados e incluídos
          no processo cadastral de <strong>${tipoProcesso || tipoCarta}</strong>, com a documentação comprobatória
          anexada aos seus respectivos prontuários digitais:
        </p>

        <table>
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">#</th>
              <th>Nome do Colaborador</th>
              <th>Registro / Matrícula</th>
              <th>Função</th>
              <th>Garagem</th>
              <th>Documentos Anexados</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer">
          <div class="signature-box">
            <strong>Recursos Humanos / Gestão de Pessoas</strong><br>
            Via Sudeste Transportes
          </div>
          <div class="signature-box">
            <strong>Responsável Operacional</strong><br>
            ${currentUserName}
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `

    printWindow.document.open()
    printWindow.document.write(htmlContent)
    printWindow.document.close()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            {isEditMode ? 'Carta do Processo Cadastral' : 'Criar Carta do Processo'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Consulte os dados da carta, visualize e adicione novos anexos por colaborador.'
              : 'Os colaboradores foram registrados. Agora, gere a carta do processo e anexe os documentos específicos de cada colaborador.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Dados gerais da carta: Número e Tipo */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 bg-muted/20 p-3.5 rounded-lg border">
            <div className="space-y-1.5">
              <Label htmlFor="carta-numero" className="text-xs font-semibold">
                Nº da Carta <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="carta-numero"
                placeholder="Ex: 278/2026 ou 1042/76"
                value={numeroCarta}
                onChange={(e) => setNumeroCarta(e.target.value)}
                disabled={saving}
                className="font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="carta-tipo" className="text-xs font-semibold">
                Tipo da Carta <span className="text-rose-500">*</span>
              </Label>
              <Select
                value={tipoCarta}
                onValueChange={(val) => setTipoCarta(val)}
                disabled={saving}
              >
                <SelectTrigger id="carta-tipo">
                  <SelectValue placeholder="Selecione o tipo da carta" />
                </SelectTrigger>
                <SelectContent>
                  {/* Se o tipo atual não estiver na lista padrão, exibe ele também no topo */}
                  {tipoCarta && !TIPOS_CARTA_PADRAO.includes(tipoCarta) && (
                    <SelectItem key={tipoCarta} value={tipoCarta}>
                      {tipoCarta}
                    </SelectItem>
                  )}
                  {TIPOS_CARTA_PADRAO.map((tipo) => (
                    <SelectItem key={tipo} value={tipo}>
                      {tipo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Seção principal: Lista de Colaboradores MINIMIZADA com expansão para ANEXOS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold text-foreground">
                  Colaboradores Incluídos ({colaboradores.length})
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Clique no colaborador para expandir e gerenciar seus anexos
              </span>
            </div>

            {loadingSavedAnexos && (
              <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                Carregando anexos salvos…
              </div>
            )}

            <div className="space-y-2 pt-1">
              {colaboradores.map((colab, idx) => {
                const key = getColabKey(colab)
                const uniqueKey = colab.processoId
                  ? `${colab.processoId}-${idx}`
                  : colab.matricula
                    ? `${colab.matricula}-${idx}`
                    : `colab-${idx}`
                const isExpanded = !!expandedMatriculas[key]
                const pendentes = pendingAnexos[key] || []
                const salvos = savedAnexos[key] || []
                const totalAnexos = pendentes.length + salvos.length
                const camposFixosColab = getCamposFixosColaborador(colab, tipoProcesso || tipoCarta)
                const outrosSalvos = salvos.filter(
                  (s) =>
                    !camposFixosColab.some(
                      (tipo) => (s.titulo || '').trim().toLowerCase() === tipo.toLowerCase(),
                    ),
                )
                const outrosPendentes = pendentes.filter(
                  (p) =>
                    !camposFixosColab.some(
                      (tipo) => (p.titulo || '').trim().toLowerCase() === tipo.toLowerCase(),
                    ),
                )

                return (
                  <div
                    key={uniqueKey}
                    className={cn(
                      'rounded-lg border transition-all duration-150',
                      isExpanded
                        ? 'border-primary/50 bg-card shadow-xs'
                        : 'border-border/70 bg-muted/20 hover:bg-muted/40',
                    )}
                  >
                    {/* Linha minimizada (somente o nome do colaborador + contagem de anexos + chevron) */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(key)}
                      aria-expanded={isExpanded}
                      className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-xs sm:text-sm text-foreground truncate">
                            {colab.nome}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            Registro: {colab.matricula || '—'} · Garagem:{' '}
                            {colab.garagem || 'CURSINO'}
                            {colab.funcao ? ` · Função: ${colab.funcao}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-none">
                        <Badge
                          variant={totalAnexos > 0 ? 'default' : 'outline'}
                          className={cn(
                            'text-[10px] font-normal h-5',
                            totalAnexos > 0
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'text-muted-foreground',
                          )}
                        >
                          {totalAnexos} {totalAnexos === 1 ? 'anexo' : 'anexos'}
                        </Badge>

                        <span className="text-[11px] text-muted-foreground hidden sm:inline">
                          {isExpanded ? 'Recolher' : 'Anexos'}
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Bloco expandido: Área de Anexos para ESTE colaborador */}
                    {isExpanded && (
                      <div className="border-t p-3.5 space-y-3 bg-muted/10">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-2">
                          <div className="flex items-center gap-1.5">
                            <FileCheck2 className="h-4 w-4 text-primary" />
                            <span className="text-xs font-bold text-foreground">
                              Anexos vinculados a {colab.nome}
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            Formatos: PDF, JPG, PNG, DOCX (até 10MB por arquivo)
                          </span>
                        </div>

                        {/* Campos FIXOS de anexo por tipo de documento específicos deste colaborador */}
                        {(() => {
                          return (
                            <div className="space-y-2">
                              <div className="text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                                <span>Documentos correspondentes:</span>
                                <span className="text-[10px] font-normal text-muted-foreground">
                                  {camposFixosColab.length} documento(s) fixo(s)
                                </span>
                              </div>
                              <div className="space-y-2">
                                {camposFixosColab.map((tipoDoc) => {
                                  // Verifica se já existe anexo salvo para este tipo de documento
                                  const anexosSalvosDoTipo = salvos.filter(
                                    (s) =>
                                      (s.titulo || '').trim().toLowerCase() ===
                                      tipoDoc.toLowerCase(),
                                  )
                                  // Verifica se há anexo pendente para este tipo
                                  const anexoPendenteDoTipo = pendentes.find(
                                    (p) =>
                                      (p.titulo || '').trim().toLowerCase() ===
                                      tipoDoc.toLowerCase(),
                                  )

                                  const inputId = `file-${key}-${tipoDoc.replace(/[^a-zA-Z0-9]/g, '_')}`
                                  const temArquivo =
                                    anexosSalvosDoTipo.length > 0 || !!anexoPendenteDoTipo

                                  return (
                                    <div
                                      key={tipoDoc}
                                      className={cn(
                                        'rounded-md border p-2.5 transition-colors',
                                        temArquivo
                                          ? 'bg-card border-emerald-300/60 dark:border-emerald-800/60'
                                          : 'bg-background/90 border-border/80 hover:border-border',
                                      )}
                                    >
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        {/* Nome fixo do documento ao lado */}
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
                                            <p className="font-semibold text-xs text-foreground truncate">
                                              {tipoDoc}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground">
                                              {temArquivo
                                                ? 'Documento anexado'
                                                : 'Nenhum arquivo anexado (máx. 10 MB)'}
                                            </p>
                                          </div>
                                        </div>

                                        {/* Botão de anexar/substituir arquivo */}
                                        <div className="flex items-center gap-1.5 flex-none self-end sm:self-auto">
                                          <input
                                            id={inputId}
                                            type="file"
                                            className="hidden"
                                            disabled={saving}
                                            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                                            onChange={(e) => {
                                              handleAddPendingAnexo(
                                                key,
                                                e.target.files,
                                                colab,
                                                tipoDoc,
                                              )
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
                                            title={
                                              temArquivo
                                                ? `Substituir ou adicionar arquivo para ${tipoDoc}`
                                                : `Anexar ${tipoDoc}`
                                            }
                                          >
                                            <Upload className="h-3 w-3" />
                                            <span>
                                              {temArquivo
                                                ? 'Substituir / Reanexar'
                                                : 'Anexar documento'}
                                            </span>
                                          </label>
                                        </div>
                                      </div>

                                      {/* Arquivo pendente correspondente a este campo */}
                                      {anexoPendenteDoTipo && (
                                        <div className="mt-2 flex items-center justify-between gap-2 rounded bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 px-2 py-1.5 text-xs">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <FileText className="h-3.5 w-3.5 flex-none text-amber-600" />
                                            <div className="min-w-0">
                                              <p className="font-medium text-foreground text-[11px] truncate">
                                                {anexoPendenteDoTipo.file.name}
                                              </p>
                                              <p className="text-[10px] text-muted-foreground truncate">
                                                {(anexoPendenteDoTipo.file.size / 1024).toFixed(0)}{' '}
                                                KB · Pronto para salvar
                                              </p>
                                            </div>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleRemovePendingAnexo(key, anexoPendenteDoTipo.id)
                                            }
                                            className="inline-flex items-center gap-1 text-[10px] text-rose-600 hover:text-rose-800 font-medium px-1.5 py-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                            title="Remover anexo pendente"
                                          >
                                            <X className="h-3 w-3" />
                                            Remover
                                          </button>
                                        </div>
                                      )}

                                      {/* Arquivos já salvos correspondentes a este campo */}
                                      {anexosSalvosDoTipo.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                          {anexosSalvosDoTipo.map((anexo) => {
                                            const urlVisualizar = getProcessoAnexoFileUrl(anexo)
                                            const urlBaixar = getProcessoAnexoFileUrl(
                                              anexo,
                                              undefined,
                                              {
                                                download: true,
                                              },
                                            )
                                            const tamanhoKb = anexo.tamanho
                                              ? `${(anexo.tamanho / 1024).toFixed(0)} KB`
                                              : ''

                                            return (
                                              <div
                                                key={anexo.id}
                                                className="flex items-center justify-between gap-2 rounded bg-white dark:bg-muted/40 px-2 py-1.5 text-xs border border-border/80"
                                              >
                                                <div className="flex items-center gap-2 min-w-0">
                                                  <FileText className="h-3.5 w-3.5 flex-none text-emerald-600" />
                                                  <div className="min-w-0">
                                                    <p className="font-medium text-foreground text-[11px] truncate">
                                                      {anexo.arquivo}
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground truncate">
                                                      {tamanhoKb}
                                                      {anexo.created &&
                                                        ` · Salvo em ${formatDate(anexo.created)}`}
                                                    </p>
                                                  </div>
                                                </div>

                                                <div className="flex items-center gap-1 flex-none">
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-6 px-1.5 text-[10px] gap-1"
                                                    onClick={() =>
                                                      window.open(
                                                        urlVisualizar,
                                                        '_blank',
                                                        'noopener,noreferrer',
                                                      )
                                                    }
                                                    title="Visualizar anexo"
                                                  >
                                                    <ExternalLink className="h-3 w-3" />
                                                    <span className="hidden sm:inline">
                                                      Visualizar
                                                    </span>
                                                  </Button>
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-6 px-1.5 text-[10px] gap-1"
                                                    onClick={() => {
                                                      const win = window.open(urlBaixar, '_blank')
                                                      if (!win) window.location.href = urlBaixar
                                                    }}
                                                    title="Baixar anexo"
                                                  >
                                                    <Download className="h-3 w-3" />
                                                  </Button>
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                                                    onClick={() =>
                                                      handleDeleteSavedAnexo(key, anexo.id, colab)
                                                    }
                                                    title="Excluir anexo salvo"
                                                  >
                                                    <Trash2 className="h-3 w-3" />
                                                  </Button>
                                                </div>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>

                              {/* Se houver algum anexo salvo com título personalizado fora da lista fixa deste colaborador, exibe como 'Outros anexos' */}
                              {(outrosSalvos.length > 0 || outrosPendentes.length > 0) && (
                                <div className="mt-3 space-y-1.5 rounded-md border border-dashed p-2 bg-muted/20">
                                  <span className="text-[11px] font-semibold text-muted-foreground">
                                    Outros documentos anexados:
                                  </span>
                                  {outrosSalvos.map((anexo) => {
                                    const urlVisualizar = getProcessoAnexoFileUrl(anexo)
                                    const urlBaixar = getProcessoAnexoFileUrl(anexo, undefined, {
                                      download: true,
                                    })
                                    return (
                                      <div
                                        key={anexo.id}
                                        className="flex items-center justify-between gap-2 rounded bg-white dark:bg-muted/40 p-1.5 text-xs border border-border/80"
                                      >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <FileText className="h-3.5 w-3.5 flex-none text-emerald-600" />
                                          <span className="font-medium truncate text-[11px]">
                                            {anexo.titulo || anexo.arquivo}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1 flex-none">
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-6 px-1.5 text-[10px] gap-1"
                                            onClick={() =>
                                              window.open(
                                                urlVisualizar,
                                                '_blank',
                                                'noopener,noreferrer',
                                              )
                                            }
                                          >
                                            <ExternalLink className="h-3 w-3" />
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-6 px-1.5 text-[10px] gap-1"
                                            onClick={() => {
                                              const win = window.open(urlBaixar, '_blank')
                                              if (!win) window.location.href = urlBaixar
                                            }}
                                          >
                                            <Download className="h-3 w-3" />
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                                            onClick={() =>
                                              handleDeleteSavedAnexo(key, anexo.id, colab)
                                            }
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                    )
                                  })}
                                  {outrosPendentes.map((anexo) => (
                                    <div
                                      key={anexo.id}
                                      className="flex items-center justify-between gap-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 p-1.5 text-xs"
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <FileText className="h-3.5 w-3.5 flex-none text-amber-600" />
                                        <span className="font-medium truncate text-[11px]">
                                          {anexo.titulo} ({anexo.file.name})
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleRemovePendingAnexo(key, anexo.id)}
                                        className="text-rose-600 hover:text-rose-800 text-[10px] font-medium px-1 py-0.5"
                                      >
                                        Remover
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleImprimirCarta}
              disabled={saving || !numeroCarta.trim()}
              className="gap-1.5 text-xs"
              title="Gerar e imprimir visualização da carta com dados dos colaboradores"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Gerar / Imprimir Carta</span>
            </Button>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {isEditMode ? 'Fechar' : 'Concluir depois'}
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={() => void handleSalvarCarta()}
              disabled={saving || !numeroCarta.trim()}
              className="bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando carta…
                </>
              ) : isEditMode ? (
                'Salvar Alterações da Carta'
              ) : (
                'Salvar e Confirmar Carta'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
