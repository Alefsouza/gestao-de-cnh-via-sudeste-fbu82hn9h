// Atualiza o agendamento do cron `sync_employees` de */5 * * * * para 0 * * * * (de hora em hora).
// O cronAdd vive em pocketbase/hooks/sync-employees-cron.js com '0 * * * *'.
// No Skip Cloud / PocketBase, atualizamos o schedule persistido em `_cron_settings`.

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
          'migration 0016: schedule de sync_employees atualizado para 0 * * * * em _cron_settings',
        )
      } else {
        console.log(
          'migration 0016: tabela _cron_settings não encontrada, agendamento gerenciado via cronAdd no hook',
        )
      }
    } catch (err) {
      console.log(
        'migration 0016: aviso ao atualizar _cron_settings:',
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
