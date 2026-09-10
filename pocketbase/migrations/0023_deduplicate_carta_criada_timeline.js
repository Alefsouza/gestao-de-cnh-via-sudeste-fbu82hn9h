migrate(
  (app) => {
    // Migration 0023: Remover registros duplicados de "Carta criada" na coleção processo_timeline,
    // mantendo o registro mais recente de cada par (mesmo processo + mesmo número de carta ou observações).
    // Não remove nada além disso.
    try {
      const timelineCol = app.findCollectionByNameOrId('processo_timeline')
      if (!timelineCol) return

      // Busca todos os registros de Carta criada ordenados por created decrescente (mais recente primeiro)
      const records = app.findRecordsByFilter(
        'processo_timeline',
        'etapa = "Carta criada"',
        '-created',
        0,
        0,
      )

      if (!records || records.length === 0) return

      const seen = new Set()
      const idsToDelete = []

      for (const rec of records) {
        const procId = String(rec.getString('processo') || '').trim()
        const obs = String(rec.getString('observacoes') || '').trim()

        // Extrai o número da carta de observacoes (ex: "Carta N.º 278/76 criada...")
        // ou usa o texto de observacoes como chave
        const match = obs.match(/Carta\s+N[º°\.]*\s*([^\s]+)/i)
        const numCarta = match ? match[1].trim() : obs

        const key = procId + '__' + numCarta

        if (seen.has(key)) {
          // Já vimos o mais recente desta combinação (já que a ordenação é -created),
          // então este é duplicado e deve ser removido
          idsToDelete.push(rec)
        } else {
          seen.add(key)
        }
      }

      for (const rec of idsToDelete) {
        console.log(
          'Removendo registro duplicado da timeline:',
          rec.id,
          rec.getString('observacoes'),
        )
        app.delete(rec)
      }
    } catch (err) {
      console.log(
        'Erro na migration 0023_deduplicate_carta_criada_timeline:',
        String((err && err.message) || err),
      )
      throw err
    }
  },
  (app) => {
    // Reversão não aplicável (registros duplicados removidos)
  },
)
