// Índice composto para as consultas de CNHs vencidas/a vencer do Dashboard (Visão Geral):
// situacao_cnh + validade_cnh + situacao na coleção `employees`.
// Idempotente: no-op se o índice já existir ou se a coleção ainda não existir (banco vazio).
migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('employees')
      const indexName = 'idx_employees_dashboard_cnh'
      const existing = col.indexes || []

      if (existing.some((idx) => String(idx).includes(indexName))) {
        // Já existe, não recriar
        return
      }

      col.indexes = existing.concat([
        'CREATE INDEX `idx_employees_dashboard_cnh` ON `employees` (`situacao_cnh`, `validade_cnh`, `situacao`)',
      ])
      app.save(col)
    } catch (err) {
      // Coleção ausente (banco vazio/provisionamento) ou índice já presente no banco:
      // no-op seguro, sem derrubar a migração.
      console.log('Migration 0044: índice dashboard não aplicado (no-op):', err)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('employees')
      const filtered = (col.indexes || []).filter(
        (idx) => !String(idx).includes('idx_employees_dashboard_cnh'),
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
