// Migration 0017: Garante atualização efetiva do cron sync_employees para execução horária (0 * * * *)
// e ajusta a tabela de configurações do cron para o valor horário.

migrate(
  (app) => {
    try {
      if (app.hasTable('_cron_settings')) {
        app
          .db()
          .newQuery(
            "UPDATE _cron_settings SET schedule = '0 * * * *' WHERE job = 'sync_employees' OR id = 'sync_employees'",
          )
          .execute()
        console.log(
          'migration 0017: schedule de sync_employees atualizado para 0 * * * * em _cron_settings',
        )
      } else {
        console.log(
          'migration 0017: tabela _cron_settings não encontrada, cron gerenciado via hook',
        )
      }
    } catch (err) {
      console.log(
        'migration 0017: aviso ao atualizar _cron_settings:',
        String((err && err.message) || err),
      )
    }

    // Atualiza também a empresa em todos os registros de employees que possam estar sem "VIA SUDESTE"
    try {
      app
        .db()
        .newQuery(
          "UPDATE employees SET company = 'VIA SUDESTE' WHERE company IS NULL OR company = ''",
        )
        .execute()
      console.log('migration 0017: company atualizada para VIA SUDESTE nos registros existentes')
    } catch (err) {
      console.log(
        'migration 0017: aviso ao atualizar company dos employees:',
        String((err && err.message) || err),
      )
    }
  },
  (app) => {
    try {
      if (app.hasTable('_cron_settings')) {
        app
          .db()
          .newQuery(
            "UPDATE _cron_settings SET schedule = '*/5 * * * *' WHERE job = 'sync_employees' OR id = 'sync_employees'",
          )
          .execute()
      }
    } catch (_) {}
  },
)
