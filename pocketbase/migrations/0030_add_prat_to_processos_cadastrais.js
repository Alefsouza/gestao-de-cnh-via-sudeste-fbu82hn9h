migrate(
  (app) => {
    // Atualizar valores permitidos no campo select 'processo' da coleção 'processos_cadastrais'
    // Adicionando a nova opção 'PRAT'
    try {
      const col = app.findCollectionByNameOrId('processos_cadastrais')
      const processoField = col.fields.getByName('processo')
      if (processoField) {
        processoField.values = [
          'Inclusão',
          'Mudança de Função',
          'Exclusão',
          'Atualização',
          'Atualização Fiscal',
          'PRAT',
        ]
        app.save(col)
      }
    } catch (err) {
      console.log('Erro ao atualizar campo processo em processos_cadastrais (adicionar PRAT):', err)
      throw err
    }
  },
  (app) => {
    // Reverter valores permitidos no campo processo
    try {
      const col = app.findCollectionByNameOrId('processos_cadastrais')
      const processoField = col.fields.getByName('processo')
      if (processoField) {
        processoField.values = [
          'Inclusão',
          'Mudança de Função',
          'Exclusão',
          'Atualização',
          'Atualização Fiscal',
        ]
        app.save(col)
      }
    } catch (_) {}
  },
)
