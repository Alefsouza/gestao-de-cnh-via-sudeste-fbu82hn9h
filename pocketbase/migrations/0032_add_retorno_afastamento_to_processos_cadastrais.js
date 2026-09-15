migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('processos_cadastrais')
      let changed = false

      // 1. Atualizar valores permitidos no select 'processo' para incluir 'Retorno do Afastamento'
      const processoField = col.fields.getByName('processo')
      if (processoField) {
        processoField.values = [
          'Inclusão',
          'Mudança de Função',
          'Exclusão',
          'Atualização',
          'Atualização Fiscal',
          'PRAT',
          'Retorno do Afastamento',
        ]
        changed = true
      }

      // 2. Adicionar campos de afastamento na coleção processos_cadastrais
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

      if (!col.fields.getByName('dias_afastado')) {
        col.fields.add(
          new NumberField({
            name: 'dias_afastado',
            required: false,
            onlyInt: true,
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
      console.log('Erro ao atualizar processos_cadastrais (Retorno do Afastamento):', err)
      throw err
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('processos_cadastrais')
      let changed = false

      const processoField = col.fields.getByName('processo')
      if (processoField) {
        processoField.values = [
          'Inclusão',
          'Mudança de Função',
          'Exclusão',
          'Atualização',
          'Atualização Fiscal',
          'PRAT',
        ]
        changed = true
      }

      if (col.fields.getByName('data_afastamento')) {
        col.fields.removeByName('data_afastamento')
        changed = true
      }
      if (col.fields.getByName('data_retorno_afastamento')) {
        col.fields.removeByName('data_retorno_afastamento')
        changed = true
      }
      if (col.fields.getByName('dias_afastado')) {
        col.fields.removeByName('dias_afastado')
        changed = true
      }
      if (col.fields.getByName('motivo_afastamento')) {
        col.fields.removeByName('motivo_afastamento')
        changed = true
      }

      if (changed) {
        app.save(col)
      }
    } catch (_) {}
  },
)
