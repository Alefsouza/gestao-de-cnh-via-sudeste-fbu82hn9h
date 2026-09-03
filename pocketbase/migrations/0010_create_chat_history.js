// Cria as coleções conversations e messages para persistência do histórico do Assistente IA
migrate(
  (app) => {
    const usersId = '_pb_users_auth_'

    const conversations = new Collection({
      name: 'conversations',
      type: 'base',
      listRule: '@request.auth.id != "" && user = @request.auth.id',
      viewRule: '@request.auth.id != "" && user = @request.auth.id',
      createRule: '@request.auth.id != "" && user = @request.auth.id',
      updateRule: '@request.auth.id != "" && user = @request.auth.id',
      deleteRule: '@request.auth.id != "" && user = @request.auth.id',
      fields: [
        {
          name: 'user',
          type: 'relation',
          collectionId: usersId,
          cascadeDelete: true,
          required: true,
          maxSelect: 1,
        },
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_conversations_user ON conversations (user)',
        'CREATE INDEX idx_conversations_user_updated ON conversations (user, updated DESC)',
      ],
    })
    app.save(conversations)

    const messages = new Collection({
      name: 'messages',
      type: 'base',
      listRule: '@request.auth.id != "" && conversation.user = @request.auth.id',
      viewRule: '@request.auth.id != "" && conversation.user = @request.auth.id',
      createRule: '@request.auth.id != "" && conversation.user = @request.auth.id',
      updateRule: '@request.auth.id != "" && conversation.user = @request.auth.id',
      deleteRule: '@request.auth.id != "" && conversation.user = @request.auth.id',
      fields: [
        {
          name: 'conversation',
          type: 'relation',
          collectionId: conversations.id,
          cascadeDelete: true,
          required: true,
          maxSelect: 1,
        },
        {
          name: 'role',
          type: 'select',
          values: ['user', 'assistant', 'system'],
          required: true,
          maxSelect: 1,
        },
        {
          name: 'content',
          type: 'text',
          required: true,
        },
        {
          name: 'metadata',
          type: 'json',
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_messages_conversation ON messages (conversation)',
        'CREATE INDEX idx_messages_conversation_created ON messages (conversation, created ASC)',
      ],
    })
    app.save(messages)
  },
  (app) => {
    for (const name of ['messages', 'conversations']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
  },
)
