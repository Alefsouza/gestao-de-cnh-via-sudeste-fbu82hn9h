// Migration 0033: aciona o cron job sync_employees atualizando temporariamente seu schedule em _cron_settings
// para rodar a cada minuto '* * * * *'
migrate(
  (app) => {
    try {
      if (app.hasTable('_cron_settings')) {
        app
          .db()
          .newQuery(
            "UPDATE _cron_settings SET schedule = '* * * * *' WHERE job = 'sync_employees' OR id = 'sync_employees'",
          )
          .execute()
        console.log('0033: sync_employees schedule alterado para * * * * *')
      }
    } catch (err) {
      console.log('0033 erro:', err)
    }
  },
  (app) => {
    try {
      if (app.hasTable('_cron_settings')) {
        app
          .db()
          .newQuery(
            "UPDATE _cron_settings SET schedule = '0 * * * *' WHERE job = 'sync_employees' OR id = 'sync_employees'",
          )
          .execute()
      }
    } catch (_) {}
  },
)
