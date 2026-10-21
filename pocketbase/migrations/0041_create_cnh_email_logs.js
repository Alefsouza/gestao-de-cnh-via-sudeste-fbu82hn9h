// Cria coleção cnh_email_logs para registrar envios consolidados/notificações de e-mail de CNH
// garantindo idempotência e auditoria de envios.
migrate(
  (app) => {
    try {
      try {
        app.findCollectionByNameOrId('cnh_email_logs')
        // Já existe, não recriar
        return
      } catch (_) {}

      const employeesCol = app.findCollectionByNameOrId('employees')

      const collection = new Collection({
        name: 'cnh_email_logs',
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
            collectionId: employeesCol.id,
            cascadeDelete: true,
            maxSelect: 1,
            required: false,
          },
          { name: 'matricula', type: 'text', required: false },
          { name: 'colaborador_nome', type: 'text', required: false },
          { name: 'validade_cnh', type: 'text', required: false },
          {
            name: 'tipo_aviso',
            type: 'select',
            values: ['15_dias', 'teste', 'outro'],
            maxSelect: 1,
            required: true,
          },
          { name: 'recipients', type: 'text', required: false },
          { name: 'status', type: 'text', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_cnh_email_logs_emp_validade ON cnh_email_logs (matricula, validade_cnh, tipo_aviso)',
        ],
      })

      app.save(collection)
    } catch (err) {
      console.log('Erro ao criar colecao cnh_email_logs:', err)
      throw err
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('cnh_email_logs')
      app.delete(col)
    } catch (_) {}
  },
)
