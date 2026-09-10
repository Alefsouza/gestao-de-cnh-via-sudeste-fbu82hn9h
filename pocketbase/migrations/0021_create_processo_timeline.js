migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('processo_timeline')
      return // Já existe
    } catch (_) {}

    const processosCol = app.findCollectionByNameOrId('processos_cadastrais')

    const collection = new Collection({
      name: 'processo_timeline',
      type: 'base',
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
      fields: [
        {
          name: 'processo',
          type: 'relation',
          required: true,
          collectionId: processosCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'etapa',
          type: 'text',
          required: true,
        },
        {
          name: 'data_hora',
          type: 'date',
          required: true,
        },
        {
          name: 'responsavel_nome',
          type: 'text',
          required: true,
        },
        {
          name: 'responsavel_perfil',
          type: 'select',
          values: ['Admin', 'RH', 'Tráfego'],
          maxSelect: 1,
        },
        {
          name: 'observacoes',
          type: 'text',
        },
        {
          name: 'motivo',
          type: 'text',
        },
        {
          name: 'documentos_recebidos',
          type: 'json',
        },
        {
          name: 'documentos_pendentes',
          type: 'json',
        },
        {
          name: 'status_documentacao',
          type: 'text',
        },
        {
          name: 'created',
          type: 'autodate',
          onCreate: true,
          onUpdate: false,
        },
        {
          name: 'updated',
          type: 'autodate',
          onCreate: true,
          onUpdate: true,
        },
      ],
      indexes: [
        'CREATE INDEX idx_timeline_processo ON processo_timeline (processo)',
        'CREATE INDEX idx_timeline_data_hora ON processo_timeline (data_hora)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('processo_timeline')
      app.delete(col)
    } catch (_) {}
  },
)
