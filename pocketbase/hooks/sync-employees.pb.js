/**
 * Cron de sincronização: roda a cada 5 minutos e espelha a view externa
 * (secret VW_CONTROLE_CNH) na collection `employees`.
 *
 * A rotina real vive em `sync-employees-lib.js` (runEmployeesSync), que também
 * é usada pela rota manual disparada pelo botão "Atualizar matriz".
 *
 * Convenções Skip Cloud: o callback roda em outra VM e não enxerga
 * identificadores de topo de arquivo — o require aqui é a única ponte.
 */
require('sync-employees-lib.js')

cronAdd('sync_employees', '*/5 * * * *', () => {
  runEmployeesSync('cron')
})
