migrate(
  (app) => {
    try {
      const settings = app.settings()
      if (settings && settings.meta) {
        settings.meta.senderName = 'Via Sudeste — Gestão de CNH'
        app.save(settings)
        console.log('migration 0043: senderName atualizado para "Via Sudeste — Gestão de CNH"')
      }
    } catch (err) {
      console.log('migration 0043 erro ao salvar app.settings():', err)
    }

    // Disparar o e-mail de teste para alef.silva@viasudeste.com
    try {
      const logsCol = app.findCollectionByNameOrId('cnh_email_logs')
      const rec = new Record(logsCol)
      rec.set('tipo_aviso', 'teste')
      rec.set('recipients', 'alef.silva@viasudeste.com')
      rec.set('colaborador_nome', 'Teste Novo Remetente Via Sudeste')
      rec.set('matricula', 'TESTE_REMETENTE')
      rec.set('status', 'solicitado')
      app.save(rec)
      console.log('migration 0043: registro de teste criado em cnh_email_logs')
    } catch (errLogs) {
      console.log('migration 0043 erro ao registrar teste em cnh_email_logs:', errLogs)
    }
  },
  (app) => {
    try {
      const settings = app.settings()
      if (settings && settings.meta) {
        settings.meta.senderName = 'Via Sudeste Transportes'
        app.save(settings)
      }
    } catch (_) {}
  },
)
