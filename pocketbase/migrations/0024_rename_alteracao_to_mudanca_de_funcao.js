migrate(
  (app) => {
    // 1. Atualizar valores permitidos no campo select 'processo' da coleção 'processos_cadastrais'
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
    } catch (err) {
      console.log('Erro ao atualizar campo processo em processos_cadastrais:', err)
      throw err
    }

    // 2. Migrar registros existentes com processo = 'Alteração' para 'Mudança de Função'
    try {
      app
        .db()
        .newQuery('UPDATE processos_cadastrais SET processo = {:novo} WHERE processo = {:antigo}')
        .bind({ novo: 'Mudança de Função', antigo: 'Alteração' })
        .execute()
    } catch (err) {
      console.log(
        'Erro ao atualizar registros existentes de Alteração para Mudança de Função:',
        err,
      )
      throw err
    }
  },
  (app) => {
    // Reverter registros para 'Alteração'
    try {
      app
        .db()
        .newQuery('UPDATE processos_cadastrais SET processo = {:antigo} WHERE processo = {:novo}')
        .bind({ antigo: 'Alteração', novo: 'Mudança de Função' })
        .execute()
    } catch (_) {}

    // Reverter valores permitidos no campo processo
    try {
      const col = app.findCollectionByNameOrId('processos_cadastrais')
      const processoField = col.fields.getByName('processo')
      if (processoField) {
        processoField.values = [
          'Inclusão',
          'Alteração',
          'Exclusão',
          'Atualização',
          'Atualização Fiscal',
        ]
        app.save(col)
      }
    } catch (_) {}
  },
)
