migrate(
  (app) => {
    // Migration 0036: Gerar eventos retroativos na coleção processo_timeline para anexos
    // existentes que foram criados antes do recurso de timeline de anexos.
    //
    // Padrão solicitado:
    // - etapa: "Documento anexado"
    // - observacoes: "Documento anexado: <titulo/documento> (<nome_arquivo>)"
    // - data_hora: data de criação do anexo (ou created)
    // - responsavel_nome: nome de quem criou o anexo ou "Matheus"
    // - responsavel_perfil: "RH"

    try {
      const timelineCol = app.findCollectionByNameOrId('processo_timeline')
      const anexosCol = app.findCollectionByNameOrId('processo_anexos')
      const processosCol = app.findCollectionByNameOrId('processos_cadastrais')

      if (!timelineCol || !anexosCol || !processosCol) {
        console.log('0036: Coleções necessárias não encontradas.')
        return
      }

      // 1. Busca todos os anexos cadastrados
      const todosAnexos = app.findRecordsByFilter('processo_anexos', '', 'created', 0, 0)
      console.log('0036: Total de anexos encontrados:', todosAnexos.length)

      let criadosRetroativos = 0

      for (const anexo of todosAnexos) {
        try {
          let processoId = String(anexo.getString('processo') || '').trim()
          const matricula = String(anexo.getString('matricula') || '').trim()
          const colaborador = String(anexo.getString('colaborador') || '').trim()
          const titulo = String(anexo.getString('titulo') || '').trim()
          const arquivo = String(anexo.getString('arquivo') || '').trim()
          const anexoCreated = anexo.getString('created') || new Date().toISOString()
          const criadoPorNome = String(anexo.getString('criado_por_nome') || '').trim() || 'Matheus'

          // Se o anexo não tem processo vinculado diretamente, tenta localizar pelo id ou matricula/colaborador
          if (!processoId) {
            // Caso especial Andressa Alcântara Lima (matrícula 4567)
            if (matricula === '4567' || colaborador.toLowerCase().includes('andressa')) {
              processoId = '6s67262osi1xuxm'
            } else if (matricula) {
              const procsMat = app.findRecordsByFilter(
                'processos_cadastrais',
                `matricula = "${matricula}"`,
                '-created',
                1,
                0,
              )
              if (procsMat && procsMat.length > 0) {
                processoId = procsMat[0].id
              }
            } else if (colaborador) {
              const procsColab = app.findRecordsByFilter(
                'processos_cadastrais',
                `colaborador ~ "${colaborador}"`,
                '-created',
                1,
                0,
              )
              if (procsColab && procsColab.length > 0) {
                processoId = procsColab[0].id
              }
            }
          }

          if (!processoId) {
            console.log('0036: Anexo', anexo.id, 'sem processo associado, pulando.')
            continue
          }

          // Garante que o processo existe ou recupera
          let procExiste = false
          try {
            app.findFirstRecordByData('processos_cadastrais', 'id', processoId)
            procExiste = true
          } catch (_) {
            // Tenta encontrar por matrícula
            if (matricula) {
              const p = app.findRecordsByFilter(
                'processos_cadastrais',
                `matricula = "${matricula}"`,
                '-created',
                1,
                0,
              )
              if (p && p.length > 0) {
                processoId = p[0].id
                procExiste = true
              }
            }
          }

          if (!procExiste) {
            console.log('0036: Processo', processoId, 'não encontrado na base.')
            continue
          }

          const docLabel = titulo || arquivo || 'Documento'
          const obsEsperada = `Documento anexado: ${docLabel} (${arquivo})`

          // Verifica se já existe evento na timeline para este arquivo neste processo
          // (evita duplicar se já foi registrado)
          const filtroExistente = `processo = "${processoId}" && etapa = "Documento anexado" && observacoes ~ "${arquivo}"`
          const eventosExistentes = app.findRecordsByFilter(
            'processo_timeline',
            filtroExistente,
            '',
            1,
            0,
          )

          if (eventosExistentes && eventosExistentes.length > 0) {
            continue // Já existe registro para este anexo
          }

          // Cria o evento retroativo na timeline
          const novoEvento = new Record(timelineCol)
          novoEvento.set('processo', processoId)
          novoEvento.set('etapa', 'Documento anexado')
          novoEvento.set('data_hora', anexoCreated)
          novoEvento.set('responsavel_nome', criadoPorNome)
          novoEvento.set('responsavel_perfil', 'RH')
          novoEvento.set('observacoes', obsEsperada)
          novoEvento.set('motivo', '')
          novoEvento.set('documentos_recebidos', [docLabel])
          novoEvento.set('documentos_pendentes', [])
          novoEvento.set('status_documentacao', '')
          app.save(novoEvento)

          criadosRetroativos++
        } catch (errAnexo) {
          console.log('0036: Erro ao processar anexo individual:', errAnexo)
        }
      }

      console.log('0036: Eventos retroativos criados com sucesso:', criadosRetroativos)

      // Fallback específico para a ANDRESSA ALCANTARA LIMA (matrícula 4567, ID 6s67262osi1xuxm):
      // Caso os 7 anexos da Andressa estivessem salvos na carta ou processo_anexos sem terem gerado timeline
      const targetIdsAndressa = [
        'jna0yygbzopsl4d',
        'h5dao9rf72yj8ts',
        'kyfrkyzosov76sd',
        'dh6lcvmrai7ku0b',
        'g5fcu4mnyv980m6',
        'bytvlifkyw1c50i',
        'odkfygp1jyx81e5',
      ]

      for (const id of targetIdsAndressa) {
        try {
          let anexoRec = null
          try {
            anexoRec = app.findFirstRecordByData('processo_anexos', 'id', id)
          } catch (_) {}

          if (anexoRec) {
            const procId = '6s67262osi1xuxm'
            const arq = String(anexoRec.getString('arquivo') || '')
            const tit = String(anexoRec.getString('titulo') || '') || arq
            const dt = anexoRec.getString('created') || new Date().toISOString()
            const autor = String(anexoRec.getString('criado_por_nome') || '').trim() || 'Matheus'

            const jaTem = app.findRecordsByFilter(
              'processo_timeline',
              `processo = "${procId}" && etapa = "Documento anexado" && observacoes ~ "${arq}"`,
              '',
              1,
              0,
            )

            if (!jaTem || jaTem.length === 0) {
              const ev = new Record(timelineCol)
              ev.set('processo', procId)
              ev.set('etapa', 'Documento anexado')
              ev.set('data_hora', dt)
              ev.set('responsavel_nome', autor)
              ev.set('responsavel_perfil', 'RH')
              ev.set('observacoes', `Documento anexado: ${tit} (${arq})`)
              ev.set('motivo', '')
              ev.set('documentos_recebidos', [tit])
              ev.set('documentos_pendentes', [])
              ev.set('status_documentacao', '')
              app.save(ev)
              console.log('0036: Evento retroativo criado para anexo Andressa:', id)
            }
          }
        } catch (eAndressa) {
          console.log('0036: Erro ao verificar anexo Andressa ' + id + ':', eAndressa)
        }
      }
    } catch (err) {
      console.log('0036: Erro geral na migration:', err)
    }
  },
  (app) => {
    // Reversão
  },
)
