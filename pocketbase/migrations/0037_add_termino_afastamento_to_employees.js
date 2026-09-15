migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('employees')
      let changed = false

      if (!col.fields.getByName('termino_afastamento')) {
        col.fields.add(
          new DateField({
            name: 'termino_afastamento',
            required: false,
          }),
        )
        changed = true
      }

      if (changed) {
        app.save(col)
      }
    } catch (err) {
      console.log('Erro ao adicionar campo termino_afastamento na colecao employees:', err)
      throw err
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('employees')
      let changed = false

      if (col.fields.getByName('termino_afastamento')) {
        col.fields.removeByName('termino_afastamento')
        changed = true
      }

      if (changed) {
        app.save(col)
      }
    } catch (_) {}
  },
)
