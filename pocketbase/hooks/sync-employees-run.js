/**
 * Rota autenticada que dispara a MESMA rotina de sincronização do cron
 * (runEmployeesSync, definida em `sync-employees-lib.js`) sob demanda —
 * é o endpoint que o botão "Atualizar matriz" / "Sincronizar agora" chama.
 *
 * Convenções Skip Cloud: o callback roda em outra VM e não enxerga
 * identificadores de topo de arquivo — o require aqui é a única ponte.
 */
require('./sync-employees-lib.js')

routerAdd(
  'POST',
  '/backend/v1/sync-employees',
  (e) => {
    const run = runEmployeesSync('manual')
    return e.json(200, {
      id: run.id,
      status: run.getString('status'),
      records_updated: run.getInt('records_updated'),
      error: run.getString('error'),
    })
  },
  $apis.requireAuth(),
)
