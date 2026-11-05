import { describe, it, expect } from 'vitest'
import { modeloIdParaTipoCarta, tipoCartaConhecido, derivarDadosDaCarta } from './cartasDerivacao'
import { gerarCartaHtml } from './cartaModelos'
import type { CartaRecord } from '@/services/cartas'
import type { Employee } from '@/lib/types'

describe('modeloIdParaTipoCarta', () => {
  it('mapeia Regularização de CNH para atualizacao_cadastral', () => {
    expect(modeloIdParaTipoCarta('Regularização de CNH')).toBe('atualizacao_cadastral')
    expect(modeloIdParaTipoCarta('regularizacao de cnh')).toBe('atualizacao_cadastral')
    expect(modeloIdParaTipoCarta('REGULARIZAÇÃO')).toBe('atualizacao_cadastral')
    expect(modeloIdParaTipoCarta('Regularizacao')).toBe('atualizacao_cadastral')
  })

  it('mantém o mapeamento dos demais tipos de carta', () => {
    expect(modeloIdParaTipoCarta('Retorno do Afastamento')).toBe('inss_retorno')
    expect(modeloIdParaTipoCarta('Retorno INSS')).toBe('inss_retorno')
    expect(modeloIdParaTipoCarta('Afastados pelo INSS')).toBe('inss_afastados')
    expect(modeloIdParaTipoCarta('Afastamento')).toBe('inss_afastados')
    expect(modeloIdParaTipoCarta('PRAT')).toBe('prat')
    expect(modeloIdParaTipoCarta('Acidente de Trânsito')).toBe('prat')
    expect(modeloIdParaTipoCarta('Exclusão')).toBe('exclusao_condubus')
    expect(modeloIdParaTipoCarta('Exclusão / Desligamento')).toBe('exclusao_condubus')
    expect(modeloIdParaTipoCarta('Inclusão')).toBe('atualizacao_cadastral')
    expect(modeloIdParaTipoCarta('Mudança de Função')).toBe('atualizacao_cadastral')
    expect(modeloIdParaTipoCarta('Atualização')).toBe('atualizacao_cadastral')
    expect(modeloIdParaTipoCarta('Atualização Cadastral')).toBe('atualizacao_cadastral')
  })

  it('reconhece Regularização de CNH como tipo de carta conhecido', () => {
    expect(tipoCartaConhecido('Regularização de CNH')).toBe(true)
  })

  it('retorna null para tipos não implementados', () => {
    expect(modeloIdParaTipoCarta('Foto Bloqueada')).toBeNull()
    expect(modeloIdParaTipoCarta('Outro')).toBeNull()
    expect(modeloIdParaTipoCarta(undefined)).toBeNull()
    expect(modeloIdParaTipoCarta('')).toBeNull()
  })
})

describe('derivação e geração de carta para Regularização de CNH', () => {
  const cartaFake: CartaRecord = {
    id: 'carta-1',
    numero_carta: '309',
    colaborador: 'ELIAS RODRIGUES',
    matricula: '006236',
    funcao_carta: 'MOTORISTA',
    tipo_carta: 'Regularização de CNH',
    cnh: 'cnh.pdf',
    prontuario: 'pront.pdf',
    comprovante_residencia: 'comp.pdf',
    atestado: 'atest.pdf',
    doc_assinado_gestora: 'doc.pdf',
    created: '2026-10-09T20:12:23.424Z',
    updated: '2026-10-09T20:12:23.424Z',
  }

  const employeeFake: Employee = {
    id: 'emp-1',
    name: 'ELIAS RODRIGUES',
    registro: '006236',
    chapa: '006236',
    funcao: 'Motorista',
    cpf: '62404580400',
    filial: 'SAPOPEMBA',
    situacao: 'Ativo',
    situacao_cnh: 'Válida',
    validade_cnh: '2031-04-01T03:00:00.000Z',
    cnh_numero: '01357045838',
    cnh_categoria: 'E',
    company: 'VIA SUDESTE',
    motivo_afastamento: '',
    inicio_afastamento: '',
    previsao_retorno: '',
    documento_fiscal: '',
    validade_documento_fiscal: '',
    data_afastamento: '',
    data_retorno_afastamento: '',
    created: '2026-09-14T19:27:26.102Z',
    updated: '2026-10-09T15:01:07.806Z',
  }

  it('deriva modelo atualizacao_cadastral e completa dados pelo cadastro', () => {
    const derivada = derivarDadosDaCarta({
      carta: cartaFake,
      linhasDaCarta: [cartaFake],
      employees: [employeeFake],
    })

    expect(derivada.ok).toBe(true)
    expect(derivada.modelo).toBe('atualizacao_cadastral')
    expect(derivada.numeroCarta).toBe('309')
    expect(derivada.colaboradores).toHaveLength(1)
    expect(derivada.colaboradores[0].nome).toBe('ELIAS RODRIGUES')
    expect(derivada.colaboradores[0].registro).toBe('006236')
    expect(derivada.colaboradores[0].cpf).toBe('62404580400')
    expect(derivada.colaboradores[0].funcao).toBe('Motorista')

    const html = gerarCartaHtml({
      modelo: derivada.modelo,
      numeroCarta: derivada.numeroCarta,
      colaboradores: derivada.colaboradores,
    })

    // 1. Destinatário SPTRANS
    expect(html).toContain('São Paulo Transporte S/A – SPTRANS')
    expect(html).toContain('A/C: Cadastro de Frota')

    // 2. Frase de corpo de atualização
    expect(html).toContain('Seguem os dados dos operadores para atualização cadastral.')

    // 3. Tabela com Reg. · Função · Nome · CPF
    expect(html).toContain('<th>Reg.</th>')
    expect(html).toContain('<th>Função</th>')
    expect(html).toContain('<th>Nome</th>')
    expect(html).toContain('<th>CPF</th>')

    // 4. Timbre completo com logo da Via Sudeste, data e número "RH xxx/" e assinatura da Sabrina Trombini
    expect(html).toContain('Via Sudeste')
    expect(html).toContain('Transportes S/A')
    expect(html).toContain('RH 309')
    expect(html).toContain('Sabrina Trombini')
    expect(html).toContain('Recursos Humanos')
    expect(html).not.toContain('Leandro Pires Ferraz')

    // 5. Dados do colaborador formatados
    expect(html).toContain('006236')
    expect(html).toContain('Motorista')
    expect(html).toContain('ELIAS RODRIGUES')
    expect(html).toContain('624.045.804-00')
  })
})
