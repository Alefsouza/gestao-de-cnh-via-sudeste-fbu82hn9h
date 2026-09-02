// Amplia os valores de filial e situação de CNH e inclui colaboradores
// afastados de outras empresas/filiais para a tela "Afastados".
migrate(
  (app) => {
    const employeesCol = app.findCollectionByNameOrId('employees')

    // --- campos de seleção ampliados ----------------------------------------
    const filialField = employeesCol.fields.getByName('filial')
    if (filialField && filialField.values.indexOf('ITAQUERA') === -1) {
      filialField.values.push('ITAQUERA')
    }
    if (filialField && filialField.values.indexOf('GUAIANASES') === -1) {
      filialField.values.push('GUAIANASES')
    }

    const situacaoCnhField = employeesCol.fields.getByName('situacao_cnh')
    if (situacaoCnhField && situacaoCnhField.values.indexOf('Vencida CNH') === -1) {
      situacaoCnhField.values.push('Vencida CNH')
    }
    if (situacaoCnhField && situacaoCnhField.values.indexOf('Sem CNH') === -1) {
      situacaoCnhField.values.push('Sem CNH')
    }

    app.save(employeesCol)

    // --- dados de exemplo: afastados em outras empresas ----------------------
    const rows = [
      // [chapa, name, company, filial, funcao, cnh_numero, categoria, validadeCnh,
      //  situacaoCnh, motivo, inicioAfast, previsaoRetorno, docFiscal, validadeDocFiscal]
      [
        '1078',
        'Cleber Antônio Ribeiro',
        'Trans Vale do Tietê Logística',
        'ITAQUERA',
        'Motorista',
        '044.718.293-51',
        'D',
        null,
        'Vencida CNH',
        'Auxílio doença',
        '2026-07-05 12:00:00.000Z',
        '2026-10-05 12:00:00.000Z',
        '',
        null,
      ],
      [
        '1102',
        'Denise Aparecida Monteiro',
        'Trans Vale do Tietê Logística',
        'ITAQUERA',
        'Fiscal de Viajem',
        '',
        '',
        null,
        'Sem CNH',
        'Afastamento previdenciário',
        '2026-06-28 12:00:00.000Z',
        '2026-09-28 12:00:00.000Z',
        'Certificado MOPE',
        '2026-11-20 12:00:00.000Z',
      ],
      [
        '1134',
        'Wagner Luiz da Conceição',
        'Expresso Litoral Norte',
        'GUAIANASES',
        'Motorista',
        '050.392.184-07',
        'D',
        null,
        'Vencida CNH',
        'Afastamento previdenciário',
        '2026-05-12 12:00:00.000Z',
        '2026-11-12 12:00:00.000Z',
        '',
        null,
      ],
      [
        '1156',
        'Sandra Regina dos Santos',
        'Expresso Litoral Norte',
        'GUAIANASES',
        'Auxiliar Administrativo',
        '061.845.729-34',
        'B',
        null,
        'Vencida CNH',
        'Estabilidade gestante',
        '2026-08-01 12:00:00.000Z',
        '2027-01-15 12:00:00.000Z',
        '',
        null,
      ],
      [
        '1203',
        'Ivanildo Ferreira da Silva',
        'Transportes Bandeirantes Ltda',
        'ITAQUERA',
        'Motorista',
        '075.513.906-82',
        'D',
        null,
        'Vencida CNH',
        'Acidente de trabalho',
        '2026-07-18 12:00:00.000Z',
        '2026-10-18 12:00:00.000Z',
        '',
        null,
      ],
      [
        '1231',
        'Marilene Souza Andrade',
        'Transportes Bandeirantes Ltda',
        'GUAIANASES',
        'Fiscal de Viajem',
        '',
        '',
        null,
        'Sem CNH',
        'Cirurgia programada',
        '2026-08-10 12:00:00.000Z',
        '2026-11-25 12:00:00.000Z',
        'Certificado MOPE',
        '2026-12-10 12:00:00.000Z',
      ],
      [
        '1257',
        'Robson Pereira Machado',
        'Via Cargas Transporte Rodoviário',
        'SAPOPEMBA',
        'Motorista',
        '033.647.208-15',
        'E',
        null,
        'Vencida CNH',
        'Afastamento previdenciário',
        '2026-04-30 12:00:00.000Z',
        '2026-12-30 12:00:00.000Z',
        '',
        null,
      ],
    ]

    for (const row of rows) {
      let record
      try {
        record = app.findFirstRecordByData('employees', 'chapa', row[0])
      } catch (_) {
        record = new Record(employeesCol)
        record.set('chapa', row[0])
      }
      record.set('name', row[1])
      record.set('company', row[2])
      record.set('filial', row[3])
      record.set('funcao', row[4])
      record.set('situacao', 'Afastado')
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
    }
  },
  (app) => {
    // Revert: remove os registros de exemplo e volta os valores originais.
    const chapas = ['1078', '1102', '1134', '1156', '1203', '1231', '1257']
    for (const chapa of chapas) {
      try {
        app.delete(app.findFirstRecordByData('employees', 'chapa', chapa))
      } catch (_) {}
    }

    const employeesCol = app.findCollectionByNameOrId('employees')
    const filialField = employeesCol.fields.getByName('filial')
    filialField.values = filialField.values.filter((v) => v !== 'ITAQUERA' && v !== 'GUAIANASES')
    const situacaoCnhField = employeesCol.fields.getByName('situacao_cnh')
    situacaoCnhField.values = situacaoCnhField.values.filter(
      (v) => v !== 'Vencida CNH' && v !== 'Sem CNH',
    )
    app.save(employeesCol)
  },
)
