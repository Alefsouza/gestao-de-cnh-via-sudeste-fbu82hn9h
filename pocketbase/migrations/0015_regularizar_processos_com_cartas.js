/**
 * Migration 0015: Regularizar processos cadastrais que já possuem cartas cadastradas.
 * Para qualquer carta já gravada na coleção `cartas`, localiza o processo cadastral
 * vinculado (por matrícula e/ou colaborador) e atualiza `situacao` para "Regular".
 */

migrate(
  (app) => {
    try {
      const cartasCol = app.findCollectionByNameOrId('cartas')
      const processosCol = app.findCollectionByNameOrId('processos_cadastrais')
      if (!cartasCol || !processosCol) return

      const cartas = app.findRecordsByFilter('cartas', '', '', 0, 0)
      const processos = app.findRecordsByFilter('processos_cadastrais', '', '', 0, 0)

      for (const carta of cartas) {
        const matCarta = String(carta.getString('matricula') || '').trim()
        const matCartaUnpadded = matCarta.replace(/^0+/, '')
        const colabCarta = String(carta.getString('colaborador') || '')
          .trim()
          .toLowerCase()

        for (const proc of processos) {
          const procMat = String(proc.getString('matricula') || '').trim()
          const procMatUnpadded = procMat.replace(/^0+/, '')
          const procColab = String(proc.getString('colaborador') || '')
            .trim()
            .toLowerCase()

          let match = false

          if (matCarta && procMat) {
            if (matCarta.toLowerCase() === procMat.toLowerCase()) match = true
            else if (
              matCartaUnpadded &&
              procMatUnpadded &&
              matCartaUnpadded.toLowerCase() === procMatUnpadded.toLowerCase()
            ) {
              match = true
            }
          }

          if (!match && colabCarta && procColab) {
            if (colabCarta === procColab) match = true
            else if (colabCarta.length >= 4 && procColab.indexOf(colabCarta) !== -1) match = true
            else if (procColab.length >= 4 && colabCarta.indexOf(procColab) !== -1) match = true
          }

          if (match && proc.getString('situacao') !== 'Regular') {
            proc.set('situacao', 'Regular')
            app.save(proc)
          }
        }
      }
    } catch (err) {
      console.log('Erro na migration 0015_regularizar_processos_com_cartas:', err)
    }
  },
  (app) => {
    // Reversão não necessária / no-op
  },
)
