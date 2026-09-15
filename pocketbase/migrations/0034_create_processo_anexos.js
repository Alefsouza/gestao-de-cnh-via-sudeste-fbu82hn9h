/**
 * Migration 0034: Criar coleção processo_anexos para vincular arquivos anexos por colaborador
 * dentro da carta do processo (documento pessoal, comprovante, CNH, prontuário, etc.).
 * Suporta permissões onde Admin e RH criam/atualizam/deletam, Tráfego não tem acesso.
 */
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('processo_anexos')
      return // Já existe
    } catch (_) {}

    const processosCol = app.findCollectionByNameOrId('processos_cadastrais')
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    const collection = new Collection({
      name: 'processo_anexos',
      type: 'base',
      listRule:
        '@request.auth.id != "" && (@request.auth.role = "Admin" || @request.auth.role = "RH")',
      viewRule:
        '@request.auth.id != "" && (@request.auth.role = "Admin" || @request.auth.role = "RH")',
      createRule:
        '@request.auth.id != "" && (@request.auth.role = "Admin" || @request.auth.role = "RH")',
      updateRule:
        '@request.auth.id != "" && (@request.auth.role = "Admin" || @request.auth.role = "RH")',
      deleteRule:
        '@request.auth.id != "" && (@request.auth.role = "Admin" || @request.auth.role = "RH")',
      fields: [
        {
          name: 'processo',
          type: 'relation',
          required: false,
          collectionId: processosCol.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'numero_carta',
          type: 'text',
          required: false,
        },
        {
          name: 'matricula',
          type: 'text',
          required: false,
        },
        {
          name: 'colaborador',
          type: 'text',
          required: false,
        },
        {
          name: 'titulo',
          type: 'text',
          required: false,
        },
        {
          name: 'arquivo',
          type: 'file',
          required: true,
          maxSelect: 1,
          maxSize: 10485760, // 10MB
          mimeTypes: [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/webp',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          ],
        },
        {
          name: 'tamanho',
          type: 'number',
          required: false,
        },
        {
          name: 'criado_por',
          type: 'relation',
          required: false,
          collectionId: usersCol.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        {
          name: 'criado_por_nome',
          type: 'text',
          required: false,
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
        'CREATE INDEX idx_processo_anexos_processo ON processo_anexos (processo)',
        'CREATE INDEX idx_processo_anexos_carta ON processo_anexos (numero_carta)',
        'CREATE INDEX idx_processo_anexos_matricula ON processo_anexos (matricula)',
      ],
    })

    app.save(collection)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('processo_anexos')
      app.delete(col)
    } catch (_) {}
  },
)
