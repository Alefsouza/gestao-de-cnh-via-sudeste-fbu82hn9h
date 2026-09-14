/**
 * Migration 0029: Atualiza a situacao de colaboradores que possuem
 * data_desligamento preenchida ou motivo_desligamento preenchido para 'Desligado'.
 */
migrate(
  (app) => {
    try {
      const res = app
        .db()
        .newQuery(
          "UPDATE employees SET situacao = 'Desligado' WHERE (data_desligamento IS NOT NULL AND data_desligamento != '') OR (motivo_desligamento IS NOT NULL AND motivo_desligamento != '')",
        )
        .execute()
      console.log('Migration 0029 executada com sucesso:', res)
    } catch (err) {
      console.log('Erro na migration 0029:', err)
      throw err
    }
  },
  (app) => {
    // Reversão no-op
  },
)
