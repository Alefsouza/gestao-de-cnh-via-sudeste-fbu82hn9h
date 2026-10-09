migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('employees')
      let changed = false

      if (!col.fields.getByName('obs_cnh')) {
        col.fields.add(
          new TextField({
            name: 'obs_cnh',
            required: false,
          }),
        )
        changed = true
      }

      if (changed) {
        app.save(col)
      }
    } catch (err) {
      console.log('Erro ao adicionar campo obs_cnh na colecao employees:', err)
      throw err
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('employees')
      let changed = false

      if (col.fields.getByName('obs_cnh')) {
        col.fields.removeByName('obs_cnh')
        changed = true
      }

      if (changed) {
        app.save(col)
      }
    } catch (_) {}
  },
)
