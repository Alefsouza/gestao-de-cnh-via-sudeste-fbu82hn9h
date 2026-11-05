import { describe, it, expect } from 'vitest'
import { gerarCartaHtml, CARTA_MODELOS, type CartaGeradaDados } from './cartaModelos'

describe('Modelos de carta - Logo Via Sudeste e Assinaturas específicas', () => {
  const mockColaborador = {
    nome: 'CARLOS SILVA',
    registro: '001234',
    funcao: 'MOTORISTA',
    cpf: '12345678901',
    dataAfastamento: '2026-01-10',
    grupo: 'SAPOPEMBA',
  }

  const baseDados: Omit<CartaGeradaDados, 'modelo'> = {
    numeroCarta: '100/26',
    colaboradores: [mockColaborador],
    dataRetorno: '2026-02-15',
    prefixoVeiculo: '51234',
    dataSinistro: '2026-01-20',
  }

  it('todos os modelos contêm o logo e o timbre oficial da Via Sudeste com endereço completo', () => {
    for (const mod of CARTA_MODELOS) {
      const html = gerarCartaHtml({
        ...baseDados,
        modelo: mod.id,
      })

      // Logo presente no timbre
      expect(html).toContain('timbre-logo')
      expect(html).toContain('Via Sudeste')
      expect(html).toContain('Transportes S/A')

      // Endereço completo preservado no timbre
      expect(html).toContain('Avenida do Cursino, nº5797 / Vila Moraes')
      expect(html).toContain('São Paulo • SP')
      expect(html).toContain('CEP 04169-000 • Filial 03')
      expect(html).toContain('Tel (11) 2133 5665')
      expect(html).toContain('www.viasudeste.com')
    }
  })

  it('o modelo Atualização Cadastral tem a assinatura exclusiva de Sabrina Trombini', () => {
    const html = gerarCartaHtml({
      ...baseDados,
      modelo: 'atualizacao_cadastral',
    })

    expect(html).toContain('Atenciosamente,')
    expect(html).toContain('SABRINA TROMBINI PERDIGÃO')
    expect(html).toContain('Recursos Humanos')
    expect(html).not.toContain('Sabrina Trombini')
    expect(html).not.toContain('Leandro Pires Ferraz')
  })

  it('os demais modelos (Retorno INSS, Afastados INSS, PRAT e Exclusão CONDUBUS) mantêm a assinatura de Leandro Pires Ferraz', () => {
    const outrosModelos: Array<CartaGeradaDados['modelo']> = [
      'inss_retorno',
      'inss_afastados',
      'prat',
      'exclusao_condubus',
    ]

    for (const modelo of outrosModelos) {
      const html = gerarCartaHtml({
        ...baseDados,
        modelo,
      })

      expect(html).toContain('Leandro Pires Ferraz')
      expect(html).toContain('Via Sudeste Transportes')
      expect(html).not.toContain('Sabrina Trombini')
    }
  })
})
