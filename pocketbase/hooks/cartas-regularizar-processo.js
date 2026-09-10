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

        // Se o processo existente ainda não possui o evento "Carta criada" para este número de carta, registra
        try {
          const numCarta = String(carta.getString('numero_carta') || '').trim()
          const timelineCol = $app.findCollectionByNameOrId('processo_timeline')
          if (timelineCol) {
            const existingEvents = $app.findRecordsByFilter(
              'processo_timeline',
              `processo = "${proc.id}" && etapa = "Carta criada" && observacoes ~ "${numCarta}"`,
              '',
              1,
              0,
            )
            if (!existingEvents || existingEvents.length === 0) {
              const timelineItemCarta = new Record(timelineCol)
              timelineItemCarta.set('processo', proc.id)
              timelineItemCarta.set('etapa', 'Carta criada')
              timelineItemCarta.set('data_hora', new Date().toISOString())
              timelineItemCarta.set('responsavel_nome', 'Emissão de Carta')
              timelineItemCarta.set('responsavel_perfil', 'RH')
              timelineItemCarta.set(
                'observacoes',
                'Carta N.º ' +
                  (numCarta || '—') +
                  ' criada — todos os documentos anexados (5): CNH, Prontuário, Comprovante de Residência, Atestado, Doc. Assinado pela Gestora.',
              )
              timelineItemCarta.set('motivo', '')
              timelineItemCarta.set('documentos_recebidos', [
                'CNH',
                'Prontuário',
                'Comprovante de Residência',
                'Atestado',
                'Doc. Assinado pela Gestora',
              ])
              timelineItemCarta.set('documentos_pendentes', [])
              timelineItemCarta.set('status_documentacao', 'Documentação completa (5/5)')
              $app.save(timelineItemCarta)
            }
          }
        } catch (errTimelineExistente) {
          console.log(
            'regularizar_processo_carta erro ao gravar evento Carta criada em processo existente:',
            String((errTimelineExistente && errTimelineExistente.message) || errTimelineExistente),
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

      // Registra os itens na linha do tempo para processos nascidos de cartas:
      // 1) "Processo criado" (mais antigo)
      // 2) "Carta criada" (mais recente, acima de "Processo criado")
      try {
        const timelineCol = $app.findCollectionByNameOrId('processo_timeline')
        if (timelineCol) {
          const numCarta = String(carta.getString('numero_carta') || '').trim()
          const nowMs = Date.now()

          // 1. Processo criado
          const timelineItemCriado = new Record(timelineCol)
          timelineItemCriado.set('processo', newProc.id)
          timelineItemCriado.set('etapa', 'Processo criado')
          timelineItemCriado.set('data_hora', new Date(nowMs - 2000).toISOString())
          timelineItemCriado.set('responsavel_nome', 'Emissão de Carta')
          timelineItemCriado.set('responsavel_perfil', 'RH')
          timelineItemCriado.set(
            'observacoes',
            numCarta
              ? 'Processo criado a partir da Carta N.º ' + numCarta
              : 'Processo criado a partir da Carta',
          )
          timelineItemCriado.set('motivo', '')
          timelineItemCriado.set('documentos_recebidos', [])
          timelineItemCriado.set('documentos_pendentes', [])
          timelineItemCriado.set('status_documentacao', '')
          $app.save(timelineItemCriado)

          // 2. Carta criada
          const timelineItemCarta = new Record(timelineCol)
          timelineItemCarta.set('processo', newProc.id)
          timelineItemCarta.set('etapa', 'Carta criada')
          timelineItemCarta.set('data_hora', new Date(nowMs).toISOString())
          timelineItemCarta.set('responsavel_nome', 'Emissão de Carta')
          timelineItemCarta.set('responsavel_perfil', 'RH')
          timelineItemCarta.set(
            'observacoes',
            'Carta N.º ' +
              (numCarta || '—') +
              ' criada — todos os documentos anexados (5): CNH, Prontuário, Comprovante de Residência, Atestado, Doc. Assinado pela Gestora.',
          )
          timelineItemCarta.set('motivo', '')
          timelineItemCarta.set('documentos_recebidos', [
            'CNH',
            'Prontuário',
            'Comprovante de Residência',
            'Atestado',
            'Doc. Assinado pela Gestora',
          ])
          timelineItemCarta.set('documentos_pendentes', [])
          timelineItemCarta.set('status_documentacao', 'Documentação completa (5/5)')
          $app.save(timelineItemCarta)
        }
      } catch (errTimeline) {
        console.log(
          'regularizar_processo_carta erro ao gravar itens na timeline:',
          String((errTimeline && errTimeline.message) || errTimeline),
        )
      }
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
