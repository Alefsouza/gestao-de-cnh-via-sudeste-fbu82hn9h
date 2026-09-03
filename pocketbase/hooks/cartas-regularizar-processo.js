/**
 * Hook disparado após criação ou atualização com sucesso de uma carta.
 *
 * Localiza o processo correspondente em processos_cadastrais pelo colaborador
 * (matrícula e/ou nome) e atualiza a situação para "Regular".
 * Se o processo já estiver "Regular", a situação é mantida.
 * Atualizações posteriores da carta nunca revertem ou alteram a situação para outro valor.
 *
 * Regras Skip Cloud / PocketBase v0.36:
 * - Toda a lógica vive dentro dos callbacks inline (sem referenciar escopo de arquivo).
 * - Usa $app para operações no banco.
 * - Registrado para cartas com onRecordAfterCreateSuccess e onRecordAfterUpdateSuccess.
 */

onRecordAfterCreateSuccess((e) => {
  try {
    const carta = e.record
    if (!carta) return

    const matricula = String(carta.getString('matricula') || '').trim()
    const matUnpadded = matricula.replace(/^0+/, '')
    const colaborador = String(carta.getString('colaborador') || '')
      .trim()
      .toLowerCase()
    const funcaoCarta = String(carta.getString('funcao_carta') || '').trim()

    const processosCol = $app.findCollectionByNameOrId('processos_cadastrais')
    if (!processosCol) return

    let matchedAny = false
    const allProcessos = $app.findRecordsByFilter('processos_cadastrais', '', '', 0, 0)
    for (const proc of allProcessos) {
      const procMat = String(proc.getString('matricula') || '').trim()
      const procMatUnpadded = procMat.replace(/^0+/, '')
      const procColab = String(proc.getString('colaborador') || '')
        .trim()
        .toLowerCase()

      let matches = false

      // Cruzamento por matrícula
      if (matricula && procMat) {
        if (procMat.toLowerCase() === matricula.toLowerCase()) {
          matches = true
        } else if (
          matUnpadded &&
          procMatUnpadded &&
          matUnpadded.toLowerCase() === procMatUnpadded.toLowerCase()
        ) {
          matches = true
        }
      }

      // Cruzamento por nome
      if (!matches && colaborador && procColab) {
        if (procColab === colaborador) {
          matches = true
        } else if (colaborador.length >= 4 && procColab.indexOf(colaborador) !== -1) {
          matches = true
        } else if (procColab.length >= 4 && colaborador.indexOf(procColab) !== -1) {
          matches = true
        }
      }

      if (matches) {
        matchedAny = true
        // Atualiza a situação para "Regular"
        const currentSit = proc.getString('situacao')
        if (currentSit !== 'Regular') {
          proc.set('situacao', 'Regular')
          $app.save(proc)
          console.log(
            'regularizar_processo_carta: processo',
            proc.id,
            'do colaborador',
            procColab,
            'atualizado para Regular',
          )
        }
      }
    }

    // Se nenhum processo existia para o colaborador, cria automaticamente um processo com situação Regular
    if (!matchedAny && (matricula || colaborador)) {
      let resolvedGaragem = 'CURSINO'
      let resolvedNome = String(carta.getString('colaborador') || '').trim()
      let resolvedFuncao = funcaoCarta || 'Motorista'

      // Tenta consultar na coleção employees para preencher dados consistentes
      if (matricula) {
        try {
          const empRecords = $app.findRecordsByFilter(
            'employees',
            `chapa = "${matricula}" || registro = "${matricula}"`,
            '',
            1,
            0,
          )
          if (empRecords && empRecords.length > 0) {
            const emp = empRecords[0]
            if (!resolvedNome && emp.getString('name')) resolvedNome = emp.getString('name')
            if (!resolvedFuncao && emp.getString('funcao')) resolvedFuncao = emp.getString('funcao')
            const f = String(emp.getString('filial') || '').toUpperCase()
            if (f.indexOf('SAPOPEMBA') !== -1) resolvedGaragem = 'SAPOPEMBA'
          }
        } catch (_) {}
      }

      const newProc = new Record(processosCol)
      newProc.set('matricula', matricula)
      newProc.set('colaborador', resolvedNome || matricula)
      newProc.set('funcao', resolvedFuncao || 'Motorista')
      newProc.set('processo', 'Inclusão')
      newProc.set('etapa', 'Documentos solicitados')
      newProc.set('prazo', new Date().toISOString())
      newProc.set('situacao', 'Regular')
      newProc.set('garagem', resolvedGaragem)
      newProc.set('alerta_trafego', '')
      $app.save(newProc)
      console.log(
        'regularizar_processo_carta: novo processo criado automaticamente como Regular para',
        matricula,
      )
    }
  } catch (err) {
    console.log(
      'regularizar_processo_carta hook (create) erro ignorado:',
      String((err && err.message) || err),
    )
  }
}, 'cartas')

onRecordAfterUpdateSuccess((e) => {
  try {
    const carta = e.record
    if (!carta) return

    const matricula = String(carta.getString('matricula') || '').trim()
    const matUnpadded = matricula.replace(/^0+/, '')
    const colaborador = String(carta.getString('colaborador') || '')
      .trim()
      .toLowerCase()

    const processosCol = $app.findCollectionByNameOrId('processos_cadastrais')
    if (!processosCol) return

    const allProcessos = $app.findRecordsByFilter('processos_cadastrais', '', '', 0, 0)
    for (const proc of allProcessos) {
      const procMat = String(proc.getString('matricula') || '').trim()
      const procMatUnpadded = procMat.replace(/^0+/, '')
      const procColab = String(proc.getString('colaborador') || '')
        .trim()
        .toLowerCase()

      let matches = false

      if (matricula && procMat) {
        if (procMat.toLowerCase() === matricula.toLowerCase()) {
          matches = true
        } else if (
          matUnpadded &&
          procMatUnpadded &&
          matUnpadded.toLowerCase() === procMatUnpadded.toLowerCase()
        ) {
          matches = true
        }
      }

      if (!matches && colaborador && procColab) {
        if (procColab === colaborador) {
          matches = true
        } else if (colaborador.length >= 4 && procColab.indexOf(colaborador) !== -1) {
          matches = true
        } else if (procColab.length >= 4 && colaborador.indexOf(procColab) !== -1) {
          matches = true
        }
      }

      if (matches) {
        // Se a situação ainda não for Regular, regulariza. Atualizações de carta NUNCA revertem Regular.
        const currentSit = proc.getString('situacao')
        if (currentSit !== 'Regular') {
          proc.set('situacao', 'Regular')
          $app.save(proc)
        }
      }
    }
  } catch (err) {
    console.log(
      'regularizar_processo_carta hook (update) erro ignorado:',
      String((err && err.message) || err),
    )
  }
}, 'cartas')
