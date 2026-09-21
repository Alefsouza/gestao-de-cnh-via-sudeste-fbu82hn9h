migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('processo_timeline')
      let changed = false

      if (!col.fields.getByName('alterado_por')) {
        col.fields.add(
          new TextField({
            name: 'alterado_por',
            required: false,
          }),
        )
        changed = true
      }

      if (!col.fields.getByName('alterado_em')) {
        col.fields.add(
          new DateField({
            name: 'alterado_em',
            required: false,
          }),
        )
        changed = true
      }

      if (changed) {
        app.save(col)
      }
    } catch (err) {
      console.log('Erro ao adicionar alterado_por e alterado_em em processo_timeline:', err)
      throw err
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('processo_timeline')
      let changed = false

      if (col.fields.getByName('alterado_por')) {
        col.fields.removeByName('alterado_por')
        changed = true
      }
      if (col.fields.getByName('alterado_em')) {
        col.fields.removeByName('alterado_em')
        changed = true
      }

      if (changed) {
        app.save(col)
      }
    } catch (_) {}
  },
)
