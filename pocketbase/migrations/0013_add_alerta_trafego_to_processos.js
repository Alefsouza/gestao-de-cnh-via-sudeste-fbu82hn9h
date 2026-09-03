migrate(
  (app) => {
    try {
      const procCol = app.findCollectionByNameOrId('processos_cadastrais')
      if (!procCol.fields.getByName('alerta_trafego')) {
        procCol.fields.add(
          new TextField({
            name: 'alerta_trafego',
            required: false,
          }),
        )
        app.save(procCol)
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const procCol = app.findCollectionByNameOrId('processos_cadastrais')
      const field = procCol.fields.getByName('alerta_trafego')
      if (field) {
        procCol.fields.removeByName('alerta_trafego')
        app.save(procCol)
      }
    } catch (_) {}
  },
)
