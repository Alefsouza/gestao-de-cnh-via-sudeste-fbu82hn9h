migrate(
  (app) => {
    // 1. Remover duplicata de ANTENOR FERNANDES SILVEIRA na carta 280 criada em 05/11 sem anexos
    // Mantém intacto o registro original com anexos de 09/10 (id: 8bzs0czi9py1ct1)
    try {
      const dupAntenor = app.findRecordsByFilter(
        'cartas',
        'numero_carta = "280" && (matricula = "003851" || colaborador ~ "ANTENOR") && cnh = "" && prontuario = "" && comprovante_residencia = "" && atestado = "" && doc_assinado_gestora = ""',
        '-created',
        10,
        0,
      )
      for (const rec of dupAntenor) {
        // Garantir que não estamos apagando o original com anexos
        if (rec.id !== '8bzs0czi9py1ct1') {
          app.delete(rec)
        }
      }
    } catch (err) {
      console.log('0046_remover_duplicatas_cartas: erro ao remover duplicata Antenor:', err)
    }

    // 2. Remover duplicata de ELIAS RODRIGUES na carta 309 criada em 05/11 sem anexos
    // Mantém intacto o registro original com anexos de 09/10 (id: 0l5flmlr2xw6w3b)
    try {
      const dupElias = app.findRecordsByFilter(
        'cartas',
        'numero_carta = "309" && (matricula = "006236" || matricula = "6236" || colaborador ~ "ELIAS") && cnh = "" && prontuario = "" && comprovante_residencia = "" && atestado = "" && doc_assinado_gestora = ""',
        '-created',
        10,
        0,
      )
      for (const rec of dupElias) {
        if (rec.id !== '0l5flmlr2xw6w3b') {
          app.delete(rec)
        }
      }
    } catch (err) {
      console.log('0046_remover_duplicatas_cartas: erro ao remover duplicata Elias:', err)
    }

    // 3. Limpar processo órfão de Antenor criado no dia 05/11 pelo hook ao criar a carta duplicada
    try {
      const procOrfao = app.findRecordsByFilter(
        'processos_cadastrais',
        'id = "xtsrifd3kc37jnf" && matricula = "003851" && processo = "Inclusão"',
        '',
        1,
        0,
      )
      if (procOrfao && procOrfao.length > 0) {
        // Limpar timeline associada ao processo órfão
        const timelineItems = app.findRecordsByFilter(
          'processo_timeline',
          'processo = "xtsrifd3kc37jnf"',
          '',
          50,
          0,
        )
        for (const item of timelineItems) {
          app.delete(item)
        }
        app.delete(procOrfao[0])
      }
    } catch (errProc) {
      console.log('0046_remover_duplicatas_cartas: erro ao limpar processo órfão:', errProc)
    }

    // 4. Limpar timeline duplicada da geração de 05/11 no processo de Antonio Elias Rodrigues
    try {
      const timelineDupElias = app.findRecordsByFilter(
        'processo_timeline',
        'id = "35268x1cy2srwev"',
        '',
        1,
        0,
      )
      if (timelineDupElias && timelineDupElias.length > 0) {
        app.delete(timelineDupElias[0])
      }
    } catch (errTimeline) {
      console.log(
        '0046_remover_duplicatas_cartas: erro ao limpar timeline duplicada Elias:',
        errTimeline,
      )
    }
  },
  () => {
    // Operação de limpeza irreversível de duplicatas — rollback não recria dados corrompidos
  },
)
