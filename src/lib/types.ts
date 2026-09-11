export interface Employee {
  id: string
  chapa: string
  name: string
  company: string
  filial: 'CURSINO' | 'SAPOPEMBA' | 'ITAQUERA' | 'GUAIANASES' | string
  funcao: string
  situacao: 'Ativo' | 'Afastado' | 'Desligado' | ''
  cnh_numero: string
  cnh_categoria: string
  validade_cnh: string
  situacao_cnh: 'Válida' | 'A vencer' | 'Vencida' | 'Vencida CNH' | 'Sem CNH' | ''
  motivo_afastamento: string
  inicio_afastamento: string
  previsao_retorno: string
  documento_fiscal: string
  validade_documento_fiscal: string
  registro?: string
  cpf?: string
  created: string
  updated: string
  expand?: { employee?: Employee }
}

export type MovementType =
  | 'Admissão'
  | 'Afastamento'
  | 'Retorno'
  | 'Desligamento'
  | 'Atualização fiscal'
export type MovementStage = 'Documentação' | 'Exame médico' | 'Treinamento' | 'Integração'

export interface Movement {
  id: string
  employee: string
  type: MovementType
  stage: MovementStage | ''
  date: string
  notes: string
  created: string
  updated: string
  expand?: { employee?: Employee }
}

export interface Notification {
  id: string
  user: string
  title: string
  message: string
  type: 'info' | 'alert' | 'success'
  read: boolean
  created: string
  updated: string
}

export const FILIAIS = ['CURSINO', 'SAPOPEMBA', 'GUAIANASES', 'ITAQUERA'] as const
export const SITUACOES = ['Ativo', 'Afastado', 'Desligado'] as const
export const FUNCOES = ['Motorista', 'Fiscal de Viajem', 'Auxiliar Administrativo'] as const
export const MOVEMENT_STAGES: MovementStage[] = [
  'Documentação',
  'Exame médico',
  'Treinamento',
  'Integração',
]

export type UserRole = 'Admin' | 'RH' | 'Tráfego'
export type GaragemOption = 'CURSINO' | 'SAPOPEMBA' | 'Todas'

export type ProcessoCategoria =
  | 'Inclusão'
  | 'Mudança de Função'
  | 'Exclusão'
  | 'Atualização'
  | 'Atualização Fiscal'

export type ProcessoEtapa =
  | 'Análise'
  | 'Aprovação'
  | 'Concluído'
  | 'Documentos solicitados'
  | 'Aguardando documentos'

export type ProcessoSituacao =
  | 'Pendente'
  | 'Bloqueado'
  | 'Regular'
  | 'Foto Bloqueada'
  | 'Impossibilitado de Trabalhar'

export type AlertaTrafego = 'bloquear_foto' | 'impossibilitado_trabalhar' | ''

export interface ProcessoCadastralRecord {
  id: string
  matricula: string
  colaborador: string
  funcao: string
  processo: ProcessoCategoria
  etapa: ProcessoEtapa
  prazo: string
  situacao: ProcessoSituacao
  garagem?: 'CURSINO' | 'SAPOPEMBA' | string
  alerta_trafego?: AlertaTrafego | string
  observacoes?: string
  funcao_antiga?: string
  funcao_atual?: string
  data_troca_funcao?: string
  created?: string
  updated?: string
}

export const TIMELINE_DOCUMENTOS_OBRIGATORIOS = [
  'CNH',
  'Prontuário',
  'Comprovante de Residência',
  'Atestado',
  'Doc. Assinado pela Gestora',
] as const

export type TimelineDocumento = (typeof TIMELINE_DOCUMENTOS_OBRIGATORIOS)[number]

export const TIMELINE_ETAPAS_ORDEM = [
  'Processo criado',
  'Carta criada',
  'Tráfego informado',
  'Operador notificado',
  'Comparecimento ao RH',
  'Entrega dos documentos',
  'Conferência',
  'Envio para a SPTrans',
  'Conclusão',
] as const

export type TimelineEtapaOrdem = (typeof TIMELINE_ETAPAS_ORDEM)[number]

export interface ProcessoTimelineRecord {
  id: string
  processo: string
  etapa: string
  data_hora: string
  responsavel_nome: string
  responsavel_perfil: UserRole
  observacoes?: string
  motivo?: string
  documentos_recebidos?: string[]
  documentos_pendentes?: string[]
  status_documentacao?: string
  created?: string
  updated?: string
}
