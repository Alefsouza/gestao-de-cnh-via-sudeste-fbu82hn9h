// Dispara o envio do e-mail de teste para alef.silva@viasudeste.com
migrate(
  (app) => {
    try {
      const logsCol = app.findCollectionByNameOrId('cnh_email_logs')
      const rec = new Record(logsCol)
      rec.set('tipo_aviso', 'teste')
      rec.set('recipients', 'alef.silva@viasudeste.com')
      rec.set('colaborador_nome', 'Teste Automatizado CNH 15 dias')
      rec.set('matricula', 'TESTE')
      rec.set('status', 'solicitado')
      app.save(rec)
    } catch (err) {
      console.log('Erro ao registrar teste em cnh_email_logs:', err)
    }
  },
  (app) => {},
)
