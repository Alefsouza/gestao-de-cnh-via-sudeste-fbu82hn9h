migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('processos_cadastrais')
    const etapaField = col.fields.getByName('etapa')
    if (etapaField) {
      etapaField.values = [
        'Análise',
        'Aprovação',
        'Concluído',
        'Documentos solicitados',
        'Aguardando documentos',
      ]
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('processos_cadastrais')
    const etapaField = col.fields.getByName('etapa')
    if (etapaField) {
      etapaField.values = [
        'Documentação',
        'Análise',
        'Aprovação',
        'Concluído',
        'Documentos solicitados',
        'Aguardando documentos',
        'Em conferência',
      ]
      app.save(col)
    }
  },
)
