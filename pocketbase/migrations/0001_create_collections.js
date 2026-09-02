// Cria as coleções do sistema Gestão de CNH Via Sudeste.
migrate(
  (app) => {
    const usersId = '_pb_users_auth_'

    const employees = new Collection({
      name: 'employees',
      type: 'base',
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
      fields: [
        { name: 'chapa', type: 'text', required: true },
        { name: 'name', type: 'text', required: true },
        { name: 'company', type: 'text' },
        { name: 'filial', type: 'select', values: ['CURSINO', 'SAPOPEMBA'], maxSelect: 1 },
        { name: 'funcao', type: 'text' },
        {
          name: 'situacao',
          type: 'select',
          values: ['Ativo', 'Afastado', 'Desligado'],
          maxSelect: 1,
        },
        { name: 'cnh_numero', type: 'text' },
        { name: 'cnh_categoria', type: 'text' },
        { name: 'validade_cnh', type: 'date' },
        {
          name: 'situacao_cnh',
          type: 'select',
          values: ['Válida', 'A vencer', 'Vencida'],
          maxSelect: 1,
        },
        { name: 'motivo_afastamento', type: 'text' },
        { name: 'inicio_afastamento', type: 'date' },
        { name: 'previsao_retorno', type: 'date' },
        { name: 'documento_fiscal', type: 'text' },
        { name: 'validade_documento_fiscal', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_employees_chapa ON employees (chapa)',
        'CREATE INDEX idx_employees_situacao_cnh ON employees (situacao_cnh)',
        'CREATE INDEX idx_employees_situacao ON employees (situacao)',
        'CREATE INDEX idx_employees_validade_cnh ON employees (validade_cnh)',
      ],
    })
    app.save(employees)

    const movements = new Collection({
      name: 'movements',
      type: 'base',
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
      fields: [
        {
          name: 'employee',
          type: 'relation',
          collectionId: employees.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'type',
          type: 'select',
          values: ['Admissão', 'Afastamento', 'Retorno', 'Desligamento', 'Atualização fiscal'],
          maxSelect: 1,
        },
        {
          name: 'stage',
          type: 'select',
          values: ['Documentação', 'Exame médico', 'Treinamento', 'Integração'],
          maxSelect: 1,
        },
        { name: 'date', type: 'date' },
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_movements_employee ON movements (employee)',
        'CREATE INDEX idx_movements_type ON movements (type)',
      ],
    })
    app.save(movements)

    const notifications = new Collection({
      name: 'notifications',
      type: 'base',
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
      fields: [
        {
          name: 'user',
          type: 'relation',
          collectionId: usersId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'title', type: 'text', required: true },
        { name: 'message', type: 'text' },
        { name: 'type', type: 'select', values: ['info', 'alert', 'success'], maxSelect: 1 },
        { name: 'read', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_notifications_user ON notifications (user)'],
    })
    app.save(notifications)
  },
  (app) => {
    for (const name of ['notifications', 'movements', 'employees']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
  },
)
