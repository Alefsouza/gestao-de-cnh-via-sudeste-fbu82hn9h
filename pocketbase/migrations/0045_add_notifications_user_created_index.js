// Índice para as consultas de notificações do sino (Layout/NotificationBell):
// a listagem usa `sort: -created` com filtro sobre `user` e `title`, então um
// índice composto (user, created) deixa o SQLite ordenar pelo índice em vez de
// ordenar o resultado filtrado inteiro. Antes, cada listagem varria a tabela
// inteira e custou 44–90s nos logs do backend.
// Idempotente: no-op se o índice já existir ou se a coleção ainda não existir.
migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('notifications')
      const indexName = 'idx_notifications_user_created'
      const existing = col.indexes || []

      if (existing.some((idx) => String(idx).includes(indexName))) {
        return
      }

      col.indexes = existing.concat([
        'CREATE INDEX `idx_notifications_user_created` ON `notifications` (`user`, `created` DESC)',
      ])
      app.save(col)
    } catch (err) {
      console.log('Migration 0045: índice notifications não aplicado (no-op):', err)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('notifications')
      const filtered = (col.indexes || []).filter(
        (idx) => !String(idx).includes('idx_notifications_user_created'),
      )
      if (filtered.length !== (col.indexes || []).length) {
        col.indexes = filtered
        app.save(col)
      }
    } catch (_) {
      // no-op no down
    }
  },
)
