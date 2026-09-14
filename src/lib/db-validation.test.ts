import { describe, it, expect } from 'vitest'
import { countEmployees } from '@/services/employees'

describe('Validação no Banco - Contagens CNH Via Sudeste', () => {
  it('deve obter contagens de Ativo, Afastado, Desligado e total', async () => {
    const total = await countEmployees('')
    const desligados = await countEmployees('situacao = "Desligado"')
    const ativos = await countEmployees('situacao = "Ativo"')
    const afastados = await countEmployees('situacao = "Afastado"')
    const comDataDeslig = await countEmployees('data_desligamento != ""')

    const message = `Total=${total}, Ativos=${ativos}, Afastados=${afastados}, Desligados=${desligados}, ComDataDeslig=${comDataDeslig}`
    expect(message).toBe('PRINT_REPORT')
  })
})
