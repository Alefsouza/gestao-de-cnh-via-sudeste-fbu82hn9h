migrate(
  (app) => {
    try {
      const procCol = app.findCollectionByNameOrId('processos_cadastrais')
      if (!procCol.fields.getByName('observacoes')) {
        procCol.fields.add(
          new TextField({
            name: 'observacoes',
            required: false,
          }),
        )
        app.save(procCol)
      }
    } catch (err) {
      console.log('Erro ao adicionar campo observacoes em processos_cadastrais:', err)
    }
  },
  (app) => {
    try {
      const procCol = app.findCollectionByNameOrId('processos_cadastrais')
      const field = procCol.fields.getByName('observacoes')
      if (field) {
        procCol.fields.removeByName('observacoes')
        app.save(procCol)
      }
    } catch (_) {}
  },
)
