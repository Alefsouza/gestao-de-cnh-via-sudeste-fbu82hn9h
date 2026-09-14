migrate(
  (app) => {
    try {
      const procCol = app.findCollectionByNameOrId('processos_cadastrais')

      if (!procCol.fields.getByName('data_desligamento')) {
        procCol.fields.add(
          new DateField({
            name: 'data_desligamento',
            required: false,
          }),
        )
      }

      if (!procCol.fields.getByName('motivo_desligamento')) {
        procCol.fields.add(
          new TextField({
            name: 'motivo_desligamento',
            required: false,
          }),
        )
      }

      app.save(procCol)
    } catch (err) {
      console.log(
        'Erro ao adicionar campos de Exclusão (desligamento) em processos_cadastrais:',
        err,
      )
      throw err
    }
  },
  (app) => {
    try {
      const procCol = app.findCollectionByNameOrId('processos_cadastrais')
      let changed = false

      if (procCol.fields.getByName('data_desligamento')) {
        procCol.fields.removeByName('data_desligamento')
        changed = true
      }
      if (procCol.fields.getByName('motivo_desligamento')) {
        procCol.fields.removeByName('motivo_desligamento')
        changed = true
      }

      if (changed) {
        app.save(procCol)
      }
    } catch (_) {}
  },
)
