migrate(
  (app) => {
    try {
      const procCol = app.findCollectionByNameOrId('processos_cadastrais')

      if (!procCol.fields.getByName('funcao_antiga')) {
        procCol.fields.add(
          new TextField({
            name: 'funcao_antiga',
            required: false,
          }),
        )
      }

      if (!procCol.fields.getByName('funcao_atual')) {
        procCol.fields.add(
          new TextField({
            name: 'funcao_atual',
            required: false,
          }),
        )
      }

      if (!procCol.fields.getByName('data_troca_funcao')) {
        procCol.fields.add(
          new DateField({
            name: 'data_troca_funcao',
            required: false,
          }),
        )
      }

      app.save(procCol)
    } catch (err) {
      console.log('Erro ao adicionar campos de Mudança de Função em processos_cadastrais:', err)
      throw err
    }
  },
  (app) => {
    try {
      const procCol = app.findCollectionByNameOrId('processos_cadastrais')
      let changed = false

      if (procCol.fields.getByName('funcao_antiga')) {
        procCol.fields.removeByName('funcao_antiga')
        changed = true
      }
      if (procCol.fields.getByName('funcao_atual')) {
        procCol.fields.removeByName('funcao_atual')
        changed = true
      }
      if (procCol.fields.getByName('data_troca_funcao')) {
        procCol.fields.removeByName('data_troca_funcao')
        changed = true
      }

      if (changed) {
        app.save(procCol)
      }
    } catch (_) {}
  },
)
