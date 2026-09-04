// Inspeciona e atualiza o agendamento do cron `sync_employees` de */5 * * * * para 0 * * * * (de hora em hora).

migrate(
  (app) => {
    // 1. Verificar tabelas no banco de dados
    const hasCronSettings = app.hasTable('_cron_settings')
    console.log('migration 0017: hasTable(_cron_settings) =', hasCronSettings)

    if (hasCronSettings) {
      // Ler registros existentes em _cron_settings
      try {
        const rows = app.db().newQuery('SELECT * FROM _cron_settings').all()
        console.log('migration 0017: _cron_settings rows count =', rows ? rows.length : 0)
        if (rows && rows.length > 0) {
          for (let i = 0; i < rows.length; i++) {
            console.log('migration 0017: row', i, JSON.stringify(rows[i]))
          }
        }
      } catch (errRows) {
        console.log('migration 0017: error reading _cron_settings:', String(errRows))
      }

      // Atualizar ou inserir
      try {
        const res = app
          .db()
          .newQuery(
            "UPDATE _cron_settings SET schedule = '0 * * * *' WHERE job = 'sync_employees' OR id = 'sync_employees'",
          )
          .execute()
        console.log('migration 0017: UPDATE _cron_settings executed')
      } catch (errUpdate) {
        console.log('migration 0017: UPDATE _cron_settings error:', String(errUpdate))
      }
    }

    // 2. Tentar acessar app.cron()
    try {
      if (typeof app.cron === 'function') {
        const c = app.cron()
        if (c && typeof c.remove === 'function') {
          c.remove('sync_employees')
          console.log('migration 0017: app.cron().remove(sync_employees) called')
        }
        if (c && typeof c.add === 'function') {
          // Nota: em Goja fn precisa ser compatível
          console.log('migration 0017: app.cron().add is available')
        }
      }
    } catch (errCron) {
      console.log('migration 0017: app.cron() error:', String(errCron))
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
