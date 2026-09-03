migrate(
  (app) => {
    // 1. Adicionar campo 'garagem' na coleção de users se não existir
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!usersCol.fields.getByName('garagem')) {
      usersCol.fields.add(
        new SelectField({
          name: 'garagem',
          values: ['CURSINO', 'SAPOPEMBA', 'Todas'],
          maxSelect: 1,
        }),
      )
      app.save(usersCol)
    }

    // 2. Adicionar campo 'garagem' na coleção 'processos_cadastrais' se não existir
    try {
      const procCol = app.findCollectionByNameOrId('processos_cadastrais')
      if (!procCol.fields.getByName('garagem')) {
        procCol.fields.add(
          new SelectField({
            name: 'garagem',
            values: ['CURSINO', 'SAPOPEMBA'],
            maxSelect: 1,
          }),
        )
        app.save(procCol)
      }

      // 3. Atualizar processos cadastrais existentes com a garagem correta
      // Distribuindo de forma realista entre CURSINO e SAPOPEMBA
      const processos = app.findRecordsByFilter('processos_cadastrais', '1=1', '', 100, 0)
      for (const p of processos) {
        if (!p.get('garagem')) {
          const mat = p.get('matricula')
          // Atribuir metade para CURSINO e metade para SAPOPEMBA
          if (['10012', '10018', '10025', '10032', '10038'].includes(mat)) {
            p.set('garagem', 'CURSINO')
          } else {
            p.set('garagem', 'SAPOPEMBA')
          }
          app.save(p)
        }
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
      const userGaragem = usersCol.fields.getByName('garagem')
      if (userGaragem) {
        usersCol.fields.removeByName('garagem')
        app.save(usersCol)
      }
    } catch (_) {}

    try {
      const procCol = app.findCollectionByNameOrId('processos_cadastrais')
      const procGaragem = procCol.fields.getByName('garagem')
      if (procGaragem) {
        procCol.fields.removeByName('garagem')
        app.save(procCol)
      }
    } catch (_) {}
  },
)
