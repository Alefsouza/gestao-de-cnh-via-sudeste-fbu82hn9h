// Atualiza o job agendado sync_employees para rodar de hora em hora (0 * * * *)
// no scheduler ativo do PocketBase / Skip Cloud.

migrate(
  (app) => {
    // 1. Atualizar na tabela interna _cron_settings se existir
    try {
      if (app.hasTable('_cron_settings')) {
        app
          .db()
          .newQuery(
            "UPDATE _cron_settings SET schedule = '0 * * * *' WHERE job = 'sync_employees' OR id = 'sync_employees'",
          )
          .execute()
        console.log('migration 0017: updated _cron_settings schedule for sync_employees')
      }
    } catch (e) {
      console.log('migration 0017: _cron_settings update err:', String((e && e.message) || e))
    }

    // 2. Chamar app.cron() no scheduler em memória se disponível
    try {
      if (typeof app.cron === 'function') {
        const cron = app.cron()
        if (cron) {
          console.log(
            'migration 0017: app.cron() found, total jobs:',
            typeof cron.total === 'function' ? cron.total() : 'unknown',
          )
        }
      }
    } catch (e) {
      console.log('migration 0017: app.cron() inspection err:', String((e && e.message) || e))
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
