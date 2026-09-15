migrate(
  (app) => {
    // Atualiza os 7 registros de anexo criados às 13:02 que foram gravados
    // incorretamente para a matrícula 4559 (MARIA IVANILDA) em vez da matrícula 4567 (ANDRESSA)
    const targetIds = [
      'jna0yygbzopsl4d',
      'h5dao9rf72yj8ts',
      'kyfrkyzosov76sd',
      'dh6lcvmrai7ku0b',
      'g5fcu4mnyv980m6',
      'bytvlifkyw1c50i',
      'odkfygp1jyx81e5',
    ]

    for (const id of targetIds) {
      try {
        const record = app.findCollectionByNameOrId('processo_anexos')
        const anexo = app.findFirstRecordByData('processo_anexos', 'id', id)
        anexo.set('processo', '6s67262osi1xuxm')
        anexo.set('matricula', '4567')
        anexo.set('colaborador', 'ANDRESSA ALCANTARA LIMA')
        anexo.set('numero_carta', '278')
        app.save(anexo)
      } catch (e) {
        console.log('Erro ao atualizar anexo ' + id + ': ' + e)
      }
    }

    // Preenche também os arquivos na tabela cartas para a carta 278 de ANDRESSA ALCANTARA LIMA se existirem
    try {
      const cartaAndressa = app.findFirstRecordByData('cartas', 'id', 'atka1jd8xoui7xg')
      // Mapeia os arquivos dos anexos atualizados conforme o título
      for (const id of targetIds) {
        try {
          const anexo = app.findFirstRecordByData('processo_anexos', 'id', id)
          const titulo = (anexo.get('titulo') || '').toLowerCase()
          const arquivoNome = anexo.get('arquivo')
          if (!arquivoNome) continue

          if (titulo.includes('rg') || titulo.includes('cnh') || titulo.includes('pessoal')) {
            cartaAndressa.set('cnh', arquivoNome)
          } else if (titulo.includes('residência') || titulo.includes('residencia')) {
            cartaAndressa.set('comprovante_residencia', arquivoNome)
          } else if (titulo.includes('prontuário') || titulo.includes('prontuario')) {
            cartaAndressa.set('prontuario', arquivoNome)
          } else if (titulo.includes('atestado') || titulo.includes('aso')) {
            cartaAndressa.set('atestado', arquivoNome)
          } else if (titulo.includes('gestora') || titulo.includes('assinado')) {
            cartaAndressa.set('doc_assinado_gestora', arquivoNome)
          }
        } catch (_) {}
      }
      app.save(cartaAndressa)
    } catch (errCarta) {
      console.log('Aviso ao sincronizar campos de cartas para Andressa: ' + errCarta)
    }

    // Atualiza também a situação do processo de ANDRESSA (6s67262osi1xuxm) para Regular
    try {
      const procAndressa = app.findFirstRecordByData(
        'processos_cadastrais',
        'id',
        '6s67262osi1xuxm',
      )
      procAndressa.set('situacao', 'Regular')
      app.save(procAndressa)
    } catch (errProc) {
      console.log('Aviso ao atualizar processo de Andressa: ' + errProc)
    }
  },
  (app) => {
    // Reversão não é necessária pois são correções pontuais de dados
  },
)
