export interface Employee {
  id: string
  chapa: string
  name: string
  company: string
  filial: 'CURSINO' | 'SAPOPEMBA' | ''
  funcao: string
  situacao: 'Ativo' | 'Afastado' | 'Desligado' | ''
  cnh_numero: string
  cnh_categoria: string
  validade_cnh: string
  situacao_cnh: 'Válida' | 'A vencer' | 'Vencida' | ''
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

export const FILIAIS = ['CURSINO', 'SAPOPEMBA'] as const
export const SITUACOES = ['Ativo', 'Afastado', 'Desligado'] as const
export const FUNCOES = ['Motorista', 'Fiscal de Viajem', 'Auxiliar Administrativo'] as const
export const MOVEMENT_STAGES: MovementStage[] = [
  'Documentação',
  'Exame médico',
  'Treinamento',
  'Integração',
]
