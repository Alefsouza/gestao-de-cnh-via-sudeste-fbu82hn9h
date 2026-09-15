migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('employees')
      let changed = false

      if (!col.fields.getByName('data_afastamento')) {
        col.fields.add(
          new DateField({
            name: 'data_afastamento',
            required: false,
          }),
        )
        changed = true
      }

      if (!col.fields.getByName('data_retorno_afastamento')) {
        col.fields.add(
          new DateField({
            name: 'data_retorno_afastamento',
            required: false,
          }),
        )
        changed = true
      }

      if (!col.fields.getByName('motivo_afastamento')) {
        col.fields.add(
          new TextField({
            name: 'motivo_afastamento',
            required: false,
          }),
        )
        changed = true
      }

      if (changed) {
        app.save(col)
      }
    } catch (err) {
      console.log('Erro ao adicionar campos de afastamento na coleção employees:', err)
      throw err
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('employees')
      let changed = false

      if (col.fields.getByName('data_afastamento')) {
        col.fields.removeByName('data_afastamento')
        changed = true
      }
      if (col.fields.getByName('data_retorno_afastamento')) {
        col.fields.removeByName('data_retorno_afastamento')
        changed = true
      }

      if (changed) {
        app.save(col)
      }
    } catch (_) {}
  },
)
