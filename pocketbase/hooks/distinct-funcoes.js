/**
 * Endpoint leve para listar funções distintas cadastradas na base de colaboradores
 * que possuem CNH registrada (cnh_numero != "" && situacao_cnh != "Sem CNH").
 * GET /api/distinct-funcoes
 * Retorna { funcoes: string[] } ordenado alfabeticamente.
 *
 * Regras Skip Cloud / PocketBase v0.36:
 * - Toda a lógica vive inline no handler.
 * - Usa $app para operações no banco.
 */

routerAdd('GET', '/api/distinct-funcoes', (e) => {
  try {
    // Filtra apenas colaboradores com CNH registrada (cnh_numero preenchido e situacao_cnh diferente de 'Sem CNH')
    const filter =
      'funcao != "" && cnh_numero != "" && situacao_cnh != "Sem CNH" && situacao_cnh != ""'
    const records = $app.findRecordsByFilter('employees', filter, 'funcao', 0, 0)
    const set = {}
    for (let i = 0; i < records.length; i++) {
      const fn = String(records[i].getString('funcao') || '').trim()
      if (fn) {
        set[fn] = true
      }
    }
    const funcoes = Object.keys(set).sort(function (a, b) {
      return a.localeCompare(b, 'pt-BR')
    })
    return e.json(200, { funcoes: funcoes })
  } catch (err) {
    console.log('Erro ao obter funcoes distintas com CNH:', String((err && err.message) || err))
    return e.json(500, { error: 'Erro ao listar funções com CNH' })
  }
})
