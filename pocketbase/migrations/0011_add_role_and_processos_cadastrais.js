migrate(
  (app) => {
    // 1. Adicionar campo 'role' na coleção de users se não existir
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!usersCol.fields.getByName('role')) {
      usersCol.fields.add(
        new SelectField({
          name: 'role',
          values: ['Admin', 'RH', 'Tráfego'],
          maxSelect: 1,
        }),
      )
      // Ajustar regras da coleção users para permitir que Admin gerencie ou liste usuários
      usersCol.listRule = '@request.auth.id != ""'
      usersCol.viewRule = '@request.auth.id != ""'
      usersCol.deleteRule = '@request.auth.id != ""'
      app.save(usersCol)
    }

    // 2. Atualizar usuários existentes para papéis padrão
    try {
      const allUsers = app.findRecordsByFilter('_pb_users_auth_', '1=1', '', 100, 0)
      for (const u of allUsers) {
        if (!u.get('role')) {
          const email = (u.get('email') || '').toLowerCase()
          if (email.includes('rh')) {
            u.set('role', 'RH')
          } else {
            u.set('role', 'Admin')
          }
          app.save(u)
        }
      }
    } catch (_) {}

    // 3. Criar coleção 'processos_cadastrais'
    try {
      app.findCollectionByNameOrId('processos_cadastrais')
    } catch (_) {
      const col = new Collection({
        name: 'processos_cadastrais',
        type: 'base',
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
        fields: [
          { name: 'matricula', type: 'text', required: true },
          { name: 'colaborador', type: 'text', required: true },
          { name: 'funcao', type: 'text' },
          {
            name: 'processo',
            type: 'select',
            values: ['Inclusão', 'Alteração', 'Exclusão', 'Atualização', 'Atualização Fiscal'],
            maxSelect: 1,
          },
          {
            name: 'etapa',
            type: 'select',
            values: [
              'Documentação',
              'Análise',
              'Aprovação',
              'Concluído',
              'Documentos solicitados',
              'Aguardando documentos',
              'Em conferência',
            ],
            maxSelect: 1,
          },
          { name: 'prazo', type: 'date' },
          {
            name: 'situacao',
            type: 'select',
            values: [
              'Pendente',
              'Bloqueado',
              'Regular',
              'Foto Bloqueada',
              'Impossibilitado de Trabalhar',
            ],
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_processos_matricula ON processos_cadastrais (matricula)',
          'CREATE INDEX idx_processos_situacao ON processos_cadastrais (situacao)',
          'CREATE INDEX idx_processos_processo ON processos_cadastrais (processo)',
        ],
      })
      app.save(col)

      // 4. Semear registros iniciais de processos_cadastrais
      const seedData = [
        {
          matricula: '10012',
          colaborador: 'Carlos Eduardo Ramos',
          funcao: 'Motorista',
          processo: 'Inclusão',
          etapa: 'Documentos solicitados',
          prazo: '2026-09-10 12:00:00.000Z',
          situacao: 'Pendente',
        },
        {
          matricula: '10015',
          colaborador: 'Ana Paula Ferreira',
          funcao: 'Fiscal de Viajem',
          processo: 'Alteração',
          etapa: 'Aguardando documentos',
          prazo: '2026-09-05 12:00:00.000Z',
          situacao: 'Pendente',
        },
        {
          matricula: '10018',
          colaborador: 'Marcos Vinícius Alves',
          funcao: 'Motorista',
          processo: 'Exclusão',
          etapa: 'Em conferência',
          prazo: '2026-08-28 12:00:00.000Z',
          situacao: 'Bloqueado',
        },
        {
          matricula: '10021',
          colaborador: 'Juliana Castro Lima',
          funcao: 'Auxiliar Administrativo',
          processo: 'Atualização',
          etapa: 'Documentos solicitados',
          prazo: '2026-09-12 12:00:00.000Z',
          situacao: 'Pendente',
        },
        {
          matricula: '10025',
          colaborador: 'Rafael Souza Gomes',
          funcao: 'Motorista',
          processo: 'Atualização Fiscal',
          etapa: 'Em conferência',
          prazo: '2026-09-01 12:00:00.000Z',
          situacao: 'Regular',
        },
        {
          matricula: '10028',
          colaborador: 'Patrícia Menezes Silva',
          funcao: 'Fiscal de Viajem',
          processo: 'Inclusão',
          etapa: 'Aguardando documentos',
          prazo: '2026-09-08 12:00:00.000Z',
          situacao: 'Bloqueado',
        },
        {
          matricula: '10032',
          colaborador: 'Diego Almeida Costa',
          funcao: 'Motorista',
          processo: 'Alteração',
          etapa: 'Concluído',
          prazo: '2026-08-20 12:00:00.000Z',
          situacao: 'Regular',
        },
        {
          matricula: '10035',
          colaborador: 'Fernanda Ribeiro Dias',
          funcao: 'Auxiliar Administrativo',
          processo: 'Exclusão',
          etapa: 'Concluído',
          prazo: '2026-08-15 12:00:00.000Z',
          situacao: 'Regular',
        },
        {
          matricula: '10038',
          colaborador: 'Rodrigo Martins Pires',
          funcao: 'Motorista',
          processo: 'Atualização',
          etapa: 'Em conferência',
          prazo: '2026-09-03 12:00:00.000Z',
          situacao: 'Regular',
        },
        {
          matricula: '10041',
          colaborador: 'Camila Nogueira Farias',
          funcao: 'Fiscal de Viajem',
          processo: 'Atualização Fiscal',
          etapa: 'Documentos solicitados',
          prazo: '2026-09-14 12:00:00.000Z',
          situacao: 'Pendente',
        },
      ]

      for (const item of seedData) {
        const record = new Record(col)
        record.set('matricula', item.matricula)
        record.set('colaborador', item.colaborador)
        record.set('funcao', item.funcao)
        record.set('processo', item.processo)
        record.set('etapa', item.etapa)
        record.set('prazo', item.prazo)
        record.set('situacao', item.situacao)
        app.save(record)
      }
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('processos_cadastrais')
      app.delete(col)
    } catch (_) {}
  },
)
