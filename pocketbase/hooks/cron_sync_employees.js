// Cron de sincronização horária (0 * * * *)
// Hook: cron_sync_employees
cronAdd('sync_employees', '0 * * * *', () => {
  console.log('cron:sync_employees tick')
})
