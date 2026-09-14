migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('employees')
      if (!col.fields.getByName('funcao_anterior')) {
        col.fields.add(
          new TextField({
            name: 'funcao_anterior',
            required: false,
          }),
        )
        app.save(col)
      }
    } catch (err) {
      console.log('Erro ao adicionar campo funcao_anterior na coleção employees:', err)
      throw err
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('employees')
      const field = col.fields.getByName('funcao_anterior')
      if (field) {
        col.fields.removeByName('funcao_anterior')
        app.save(col)
      }
    } catch (_) {}
  },
)
