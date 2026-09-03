/**
 * Adiciona o campo `registro` à collection `employees` — a view externa
 * (secret VW_CONTROLE_CNH) traz o registro além da chapa, e a dedup da
 * sincronização usa os dois. O índice de chapa já existe desde 0001; o
 * `registro` é opcional (a view pode não trazê-lo), então fica sem índice
 * único para não bloquear registros sem o valor.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('employees')
    if (!col.fields.getByName('registro')) {
      col.fields.add(new TextField({ name: 'registro' }))
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('employees')
    const field = col.fields.getByName('registro')
    if (field) {
      col.fields.removeByName('registro')
      app.save(col)
    }
  },
)
