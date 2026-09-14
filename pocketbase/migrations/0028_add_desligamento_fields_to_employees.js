migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('employees')
      let changed = false

      if (!col.fields.getByName('data_desligamento')) {
        col.fields.add(
          new DateField({
            name: 'data_desligamento',
            required: false,
          }),
        )
        changed = true
      }

      if (!col.fields.getByName('motivo_desligamento')) {
        col.fields.add(
          new TextField({
            name: 'motivo_desligamento',
            required: false,
          }),
        )
        changed = true
      }

      if (changed) {
        app.save(col)
      }
    } catch (err) {
      console.log('Erro ao adicionar campos de desligamento na coleção employees:', err)
      throw err
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('employees')
      let changed = false

      if (col.fields.getByName('data_desligamento')) {
        col.fields.removeByName('data_desligamento')
        changed = true
      }
      if (col.fields.getByName('motivo_desligamento')) {
        col.fields.removeByName('motivo_desligamento')
        changed = true
      }

      if (changed) {
        app.save(col)
      }
    } catch (_) {}
  },
)
