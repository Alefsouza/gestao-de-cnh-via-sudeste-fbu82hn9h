migrate(
  (app) => {
    const today = new Date()

    const iso = (y, m, d) => {
      const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
      return dt.toISOString().replace('T', ' ')
    }
    const futureDate = (days) => {
      const dt = new Date(today.getTime() + days * 86400000)
      return dt.toISOString().replace('T', ' ')
    }
    const pastDate = (days) => futureDate(-days)

    const employeeChapas = [
      '0147',
      '0412',
      '0231',
      '0367',
      '0315',
      '0089',
      '0102',
      '0136',
      '0188',
      '0203',
      '0219',
      '0245',
      '0278',
      '0301',
      '0344',
      '0402',
      '0433',
      '0461',
      '0488',
      '0501',
      '0523',
      '0210',
      '0267',
      '0311',
      '0355',
    ]

    // ---- Admin -------------------------------------------------------------
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'financeiro@viasudeste.com')
    } catch (_) {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      const admin = new Record(users)
      admin.setEmail('financeiro@viasudeste.com')
      admin.setPassword('Skip@Pass')
      admin.setVerified(true)
      admin.set('name', 'Administrador Via Sudeste')
      app.save(admin)
    }

    // ---- Funcionários ------------------------------------------------------
    const employeeRows = [
      // [chapa, name, filial, funcao, situacao, cnh, categoria, validadeCnh, situacaoCnh,
      //  motivo, inicioAfast, previsaoRetorno, docFiscal, validadeDocFiscal]
      [
        '0147',
        'Carlos Alberto Mendes',
        'CURSINO',
        'Motorista',
        'Ativo',
        '038.291.456-10',
        'D',
        iso(2024, 3, 12),
        'Vencida',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(40),
      ],
      [
        '0412',
        'Paulo Henrique Dias',
        'CURSINO',
        'Motorista',
        'Ativo',
        '058.812.345-67',
        'D',
        iso(2024, 6, 20),
        'Vencida',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(180),
      ],
      [
        '0231',
        'José Roberto Silva',
        'SAPOPEMBA',
        'Motorista',
        'Ativo',
        '041.277.893-45',
        'D',
        iso(2024, 1, 28),
        'Vencida',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(15),
      ],
      [
        '0367',
        'Marcos Vinícius Souza',
        'SAPOPEMBA',
        'Motorista',
        'Ativo',
        '052.384.719-02',
        'D',
        iso(2024, 9, 2),
        'Vencida',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(300),
      ],
      [
        '0315',
        'Antônio Carlos Ferreira',
        'CURSINO',
        'Motorista',
        'Ativo',
        '045.661.234-78',
        'D',
        iso(2023, 11, 15),
        'Vencida',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(25),
      ],
      [
        '0089',
        'Fernanda Lima Costa',
        'CURSINO',
        'Fiscal de Viajem',
        'Ativo',
        '',
        '',
        null,
        '',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(220),
      ],
      [
        '0102',
        'Rafael Almeida Souza',
        'SAPOPEMBA',
        'Fiscal de Viajem',
        'Ativo',
        '',
        '',
        null,
        '',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(95),
      ],
      [
        '0136',
        'Juliana Fernandes Rocha',
        'CURSINO',
        'Fiscal de Viajem',
        'Ativo',
        '',
        '',
        null,
        '',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(410),
      ],
      [
        '0188',
        'Marcelo Tavares Pinto',
        'SAPOPEMBA',
        'Fiscal de Viajem',
        'Ativo',
        '',
        '',
        null,
        '',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(28),
      ],
      [
        '0203',
        'Camila Rodrigues Lima',
        'CURSINO',
        'Fiscal de Viajem',
        'Ativo',
        '',
        '',
        null,
        '',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(160),
      ],
      [
        '0219',
        'Eduardo Nogueira Santos',
        'SAPOPEMBA',
        'Fiscal de Viajem',
        'Ativo',
        '',
        '',
        null,
        '',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(20),
      ],
      [
        '0245',
        'Patrícia Moraes Freitas',
        'CURSINO',
        'Fiscal de Viajem',
        'Ativo',
        '',
        '',
        null,
        '',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(300),
      ],
      [
        '0278',
        'Roberto Carlos Andrade',
        'SAPOPEMBA',
        'Fiscal de Viajem',
        'Ativo',
        '',
        '',
        null,
        '',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(190),
      ],
      [
        '0301',
        'Simone Alves Pereira',
        'CURSINO',
        'Fiscal de Viajem',
        'Ativo',
        '',
        '',
        null,
        '',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(75),
      ],
      [
        '0344',
        'Gustavo Henrique Ribeiro',
        'SAPOPEMBA',
        'Fiscal de Viajem',
        'Ativo',
        '',
        '',
        null,
        '',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(25),
      ],
      [
        '0402',
        'Luciana Barbosa Martins',
        'CURSINO',
        'Motorista',
        'Ativo',
        '071.482.905-33',
        'D',
        futureDate(420),
        'Válida',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(120),
      ],
      [
        '0433',
        'Rodrigo Mendes Lacerda',
        'SAPOPEMBA',
        'Motorista',
        'Ativo',
        '082.519.304-77',
        'D',
        futureDate(21),
        'A vencer',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(200),
      ],
      [
        '0461',
        'Tatiane Costa Vieira',
        'CURSINO',
        'Motorista',
        'Ativo',
        '093.671.258-09',
        'D',
        futureDate(12),
        'A vencer',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(260),
      ],
      [
        '0488',
        'Fernando Antunes Prado',
        'SAPOPEMBA',
        'Motorista',
        'Ativo',
        '014.938.267-51',
        'D',
        futureDate(365),
        'Válida',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(330),
      ],
      [
        '0501',
        'Bianca Carvalho Menezes',
        'CURSINO',
        'Motorista',
        'Ativo',
        '025.174.903-86',
        'D',
        futureDate(500),
        'Válida',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(60),
      ],
      [
        '0523',
        'Anderson Silva Júnior',
        'SAPOPEMBA',
        'Motorista',
        'Ativo',
        '036.815.274-09',
        'D',
        futureDate(27),
        'A vencer',
        '',
        null,
        null,
        'Certificado MOPE',
        futureDate(410),
      ],
      [
        '0210',
        'Marcela Duarte Nogueira',
        'CURSINO',
        'Auxiliar Administrativo',
        'Afastado',
        '047.281.905-36',
        'B',
        futureDate(200),
        'Válida',
        'Licença maternidade',
        pastDate(40),
        futureDate(120),
        '',
        null,
      ],
      [
        '0267',
        'Paulo César Fontes',
        'SAPOPEMBA',
        'Motorista',
        'Afastado',
        '058.193.746-20',
        'D',
        futureDate(150),
        'Válida',
        'Acidente de trabalho',
        pastDate(20),
        futureDate(40),
        '',
        null,
      ],
      [
        '0311',
        'Regina Célia Barros',
        'CURSINO',
        'Fiscal de Viajem',
        'Afastado',
        '',
        '',
        null,
        '',
        'Tratamento de saúde',
        pastDate(75),
        futureDate(15),
        'Certificado MOPE',
        futureDate(90),
      ],
      [
        '0355',
        'Jorge Amado Ferreira',
        'SAPOPEMBA',
        'Motorista',
        'Afastado',
        '069.274.815-43',
        'D',
        futureDate(280),
        'Válida',
        'Licença paternidade',
        pastDate(5),
        futureDate(25),
        '',
        null,
      ],
    ]

    const employeesCol = app.findCollectionByNameOrId('employees')
    const createdEmployees = {}

    for (const row of employeeRows) {
      let record
      try {
        record = app.findFirstRecordByData('employees', 'chapa', row[0])
      } catch (_) {
        record = new Record(employeesCol)
        record.set('chapa', row[0])
      }
      record.set('name', row[1])
      record.set('company', 'Via Sudeste Transportes')
      record.set('filial', row[2])
      record.set('funcao', row[3])
      record.set('situacao', row[4])
      record.set('cnh_numero', row[5])
      record.set('cnh_categoria', row[6])
      record.set('validade_cnh', row[7])
      record.set('situacao_cnh', row[8])
      record.set('motivo_afastamento', row[9])
      record.set('inicio_afastamento', row[10])
      record.set('previsao_retorno', row[11])
      record.set('documento_fiscal', row[12])
      record.set('validade_documento_fiscal', row[13])
      app.save(record)
      createdEmployees[row[0]] = record.id
    }

    // ---- Movimentos --------------------------------------------------------
    const movementsCol = app.findCollectionByNameOrId('movements')
    const movementsRows = [
      // [chapa, type, stage, daysAgo, notes]
      ['0147', 'Admissão', 'Integração', 900, 'Admissão concluída — integrado à garagem CURSINO.'],
      ['0412', 'Admissão', 'Integração', 850, 'Admissão concluída — integrado à garagem CURSINO.'],
      [
        '0231',
        'Admissão',
        'Integração',
        800,
        'Admissão concluída — integrado à garagem SAPOPEMBA.',
      ],
      [
        '0367',
        'Admissão',
        'Integração',
        700,
        'Admissão concluída — integrado à garagem SAPOPEMBA.',
      ],
      ['0315', 'Admissão', 'Integração', 650, 'Admissão concluída — integrado à garagem CURSINO.'],
      ['0210', 'Afastamento', '', 40, 'Licença maternidade — início do afastamento.'],
      ['0267', 'Afastamento', '', 20, 'Acidente de trabalho — afastamento imediato.'],
      ['0311', 'Afastamento', '', 75, 'Tratamento de saúde com laudo médico.'],
      ['0355', 'Afastamento', '', 5, 'Licença paternidade — 25 dias.'],
      ['0402', 'Admissão', 'Integração', 400, 'Admissão concluída — integrado à garagem CURSINO.'],
      ['0433', 'Admissão', 'Treinamento', 20, 'Em treinamento de direção defensiva.'],
      ['0461', 'Admissão', 'Exame médico', 10, 'Aguardando exame médico ocupacional.'],
      ['0488', 'Admissão', 'Documentação', 5, 'Documentação em análise pelo RH.'],
      ['0501', 'Admissão', 'Exame médico', 8, 'Exame médico agendado.'],
      ['0523', 'Admissão', 'Treinamento', 12, 'Em treinamento operacional.'],
    ]

    for (const row of movementsRows) {
      const existing = app.findRecordsByFilter(
        'movements',
        `employee = "${createdEmployees[row[0]]}" && type = "${row[1]}" && date = "${pastDate(row[3])}"`,
        '',
        1,
        0,
      )
      if (existing.length > 0) continue

      const record = new Record(movementsCol)
      record.set('employee', createdEmployees[row[0]])
      record.set('type', row[1])
      if (row[2]) record.set('stage', row[2])
      record.set('date', pastDate(row[3]))
      record.set('notes', row[4])
      app.save(record)
    }

    // ---- Notificações ------------------------------------------------------
    let adminId = ''
    try {
      adminId = app.findAuthRecordByEmail('_pb_users_auth_', 'financeiro@viasudeste.com').id
    } catch (_) {
      adminId = ''
    }

    const notificationsCol = app.findCollectionByNameOrId('notifications')
    const notificationsRows = [
      // [title, message, type, read, minutesAgo]
      [
        'CNH vencida',
        'Carlos Alberto Mendes (0147) está com a CNH vencida desde 12/03/2024.',
        'alert',
        false,
        32,
      ],
      [
        'Documento a vencer',
        'Marcelo Tavares Pinto (0188) tem o Certificado MOPE vencendo em 28 dias.',
        'alert',
        false,
        95,
      ],
      [
        'Retorno registrado',
        'Jorge Amado Ferreira (0355) retorna da licença paternidade em 25 dias.',
        'info',
        false,
        240,
      ],
      [
        'Nova movimentação',
        'Processo admissional de Eduardo Nogueira Santos iniciado.',
        'info',
        true,
        1440,
      ],
      [
        'Sincronização concluída',
        'Matriz de funcionários sincronizada com sucesso às 06:00.',
        'success',
        true,
        1500,
      ],
    ]

    for (const row of notificationsRows) {
      const existing = app.findRecordsByFilter('notifications', `title = "${row[0]}"`, '', 1, 0)
      if (existing.length > 0) continue

      const record = new Record(notificationsCol)
      record.set('title', row[0])
      record.set('message', row[1])
      record.set('type', row[2])
      record.set('read', row[3])
      if (adminId) record.set('user', adminId)
      record.set('created', new Date(Date.now() - row[4] * 60000).toISOString().replace('T', ' '))
      app.save(record)
    }
  },
  (app) => {
    // Revert: remove apenas dados de exemplo (mantém o usuário admin).
    for (const collection of ['notifications', 'movements']) {
      try {
        app.truncateCollection(app.findCollectionByNameOrId(collection))
      } catch (_) {}
    }
    for (const chapa of employeeChapas) {
      try {
        app.delete(app.findFirstRecordByData('employees', 'chapa', chapa))
      } catch (_) {}
    }
  },
)
