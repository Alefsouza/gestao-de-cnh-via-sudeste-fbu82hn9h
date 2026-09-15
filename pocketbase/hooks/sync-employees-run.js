/**
 * Rota autenticada que dispara a rotina de sincronização sob demanda
 * (POST /backend/v1/sync-employees) — chamado pelo botão "Atualizar dados" / "Sincronizar agora".
 *
 * Aplica EXATAMENTE os mesmos tratamentos do cron:
 * - Empresa SEMPRE "VIA SUDESTE".
 * - Situação corretamente normalizada (Ativo / Afastado / Desligado), inclusive detecção
 *   de afastamento por status ou por motivo_afastamento.
 * - Comparação campo a campo antes de salvar: NÃO marca registros como atualizados
 *   se nenhum campo mudou, evitando disparos repetidos de hooks de atualização.
 *
 * Convenções Skip Cloud: o callback roda em outra VM e não enxerga
 * identificadores de topo de arquivo — toda a lógica vive dentro do callback.
 */

routerAdd(
  'POST',
  '/backend/v1/sync-employees',
  (e) => {
    const trigger = 'manual'
    const nowStr = () => new Date().toISOString().replace('T', ' ')

    const runsCol = $app.findCollectionByNameOrId('sync_runs')
    const run = new Record(runsCol)
    run.set('started_at', nowStr())
    run.set('status', 'Em andamento')
    run.set('records_updated', 0)
    run.set('error', '')
    $app.save(run)

    try {
      const secretUrl = $os.getenv('VW_CONTROLE_CNH')
      if (!secretUrl) {
        throw new Error(
          'Secret VW_CONTROLE_CNH não configurada: impossível sincronizar colaboradores.',
        )
      }

      // ---- Rotina de Fetch com Teste e Detecção de Paginação -------------------
      const extractItems = (data) => {
        if (!data) return []
        if (Array.isArray(data)) return data
        if (typeof data === 'object') {
          const candidate =
            data.data ?? data.rows ?? data.records ?? data.items ?? data.value ?? data.results ?? []
          if (Array.isArray(candidate)) return candidate
        }
        return []
      }

      const appendParam = (url, paramName, paramVal) => {
        const sep = url.indexOf('?') !== -1 ? '&' : '?'
        return url + sep + encodeURIComponent(paramName) + '=' + encodeURIComponent(paramVal)
      }

      const getRowFingerprint = (row) => {
        if (!row || typeof row !== 'object') return ''
        return String(
          row.REGISTRO ||
            row.registro ||
            row.CHAPA ||
            row.chapa ||
            row.CPF ||
            row.cpf ||
            row.NOME ||
            row.nome ||
            JSON.stringify(row).slice(0, 50),
        ).trim()
      }

      // 1. Requisição base (página 1 / fatia inicial)
      const resInit = $http.send({ url: secretUrl, method: 'GET', timeout: 45 })
      if (resInit.statusCode >= 400) {
        throw new Error('A view externa respondeu HTTP ' + resInit.statusCode)
      }

      const initJson = resInit.json
      let payload = extractItems(initJson)
      if (!payload || payload.length === 0) {
        throw new Error('A view externa retornou vazia — nenhum dado foi alterado.')
      }

      const initialCount = payload.length
      const initialFirstFp = getRowFingerprint(payload[0])
      let paginationSupported = false
      let activeStrategy = null
      let paginationNotice = ''

      // Padrões de paginação a testar
      const paginationStrategies = [
        {
          name: 'page_pageSize',
          type: 'page',
          pageKey: 'page',
          sizeKey: 'pageSize',
          pageSize: 1000,
        },
        { name: 'page_perPage', type: 'page', pageKey: 'page', sizeKey: 'perPage', pageSize: 1000 },
        { name: 'page_limit', type: 'page', pageKey: 'page', sizeKey: 'limit', pageSize: 1000 },
        { name: 'page_only', type: 'page', pageKey: 'page', sizeKey: null, pageSize: null },
        { name: 'pagina_only', type: 'page', pageKey: 'pagina', sizeKey: null, pageSize: null },
        { name: 'p_only', type: 'page', pageKey: 'p', sizeKey: null, pageSize: null },
        {
          name: 'offset_limit',
          type: 'offset',
          offsetKey: 'offset',
          limitKey: 'limit',
          pageSize: 1000,
        },
        { name: 'skip_take', type: 'offset', offsetKey: 'skip', limitKey: 'take', pageSize: 1000 },
        {
          name: 'odata_skip_top',
          type: 'offset',
          offsetKey: '$skip',
          limitKey: '$top',
          pageSize: 1000,
        },
        {
          name: 'start_count',
          type: 'offset',
          offsetKey: 'start',
          limitKey: 'count',
          pageSize: 1000,
        },
      ]

      // 2. Prova de suporte a paginação: testa a segunda fatia / página 2
      for (const strat of paginationStrategies) {
        try {
          let testUrl = secretUrl
          if (strat.type === 'page') {
            testUrl = appendParam(testUrl, strat.pageKey, '2')
            if (strat.sizeKey && strat.pageSize) {
              testUrl = appendParam(testUrl, strat.sizeKey, String(strat.pageSize))
            }
          } else if (strat.type === 'offset') {
            testUrl = appendParam(testUrl, strat.offsetKey, String(strat.pageSize || initialCount))
            if (strat.limitKey && strat.pageSize) {
              testUrl = appendParam(testUrl, strat.limitKey, String(strat.pageSize))
            }
          }

          const testRes = $http.send({ url: testUrl, method: 'GET', timeout: 25 })
          if (testRes.statusCode === 200) {
            const testItems = extractItems(testRes.json)
            if (Array.isArray(testItems) && testItems.length > 0) {
              const testFirstFp = getRowFingerprint(testItems[0])
              // Se retornou itens e o primeiro item NÃO é idêntico ao primeiro da requisição inicial,
              // o endpoint respondeu a fatia seguinte com sucesso!
              if (testFirstFp && testFirstFp !== initialFirstFp) {
                paginationSupported = true
                activeStrategy = strat
                console.log(
                  'sync:employees (' +
                    trigger +
                    ') — Paginação detectada com estratégia: ' +
                    strat.name,
                )
                break
              }
            }
          }
        } catch (probeErr) {
          // Falha no probe individual não quebra o processo
          console.log('Falha ao testar estratégia ' + strat.name + ':', probeErr)
        }
      }

      // 3. Se a paginação for suportada, percorre todas as páginas concatenando os resultados
      if (paginationSupported && activeStrategy) {
        const allRows = []
        const seenFp = {}
        const MAX_PAGES = 50 // Limite de segurança de páginas para não travar o hook
        const strat = activeStrategy
        const pageSize = strat.pageSize || 1000

        let curPage = 1
        let curOffset = 0

        while (curPage <= MAX_PAGES) {
          let fetchUrl = secretUrl
          if (strat.type === 'page') {
            fetchUrl = appendParam(fetchUrl, strat.pageKey, String(curPage))
            if (strat.sizeKey && strat.pageSize) {
              fetchUrl = appendParam(fetchUrl, strat.sizeKey, String(strat.pageSize))
            }
          } else if (strat.type === 'offset') {
            fetchUrl = appendParam(fetchUrl, strat.offsetKey, String(curOffset))
            if (strat.limitKey && strat.pageSize) {
              fetchUrl = appendParam(fetchUrl, strat.limitKey, String(strat.pageSize))
            }
          }

          const pageRes = $http.send({ url: fetchUrl, method: 'GET', timeout: 35 })
          if (pageRes.statusCode >= 400) break

          const pageItems = extractItems(pageRes.json)
          if (!Array.isArray(pageItems) || pageItems.length === 0) break

          let newInThisSlice = 0
          for (const item of pageItems) {
            const fp = getRowFingerprint(item)
            if (fp) {
              if (!seenFp[fp]) {
                seenFp[fp] = true
                allRows.push(item)
                newInThisSlice++
              }
            } else {
              allRows.push(item)
              newInThisSlice++
            }
          }

          // Se nenhum registro novo veio nessa fatia, alcançamos o fim ou loop
          if (newInThisSlice === 0) break

          if (strat.type === 'page') {
            curPage++
            if (strat.pageSize && pageItems.length < strat.pageSize) break
          } else {
            curOffset += pageItems.length
            if (pageItems.length < pageSize) break
          }
        }

        if (allRows.length > 0) {
          payload = allRows
        }
      } else {
        // 4. Se o endpoint NÃO suportar nenhum parâmetro de paginação:
        // Documenta claramente no aviso do run para evidência da Secretaria/TI
        paginationNotice =
          'Aviso TI/Secretaria: O endpoint VW_CONTROLE_CNH não suporta os parâmetros padrão de paginação (page/pageSize, offset/limit, skip/take). Processada a fatia padrão (' +
          payload.length +
          ' registros).'
        console.log('sync:employees (' + trigger + ') — ' + paginationNotice)
      }

      // ---- normalização -------------------------------------------------------
      const FILIAIS = ['CURSINO', 'SAPOPEMBA', 'ITAQUERA', 'GUAIANASES']
      const FIELDS = [
        'chapa',
        'registro',
        'name',
        'company',
        'filial',
        'funcao',
        'funcao_anterior',
        'situacao',
        'cnh_numero',
        'cnh_categoria',
        'validade_cnh',
        'situacao_cnh',
        'motivo_afastamento',
        'inicio_afastamento',
        'previsao_retorno',
        'documento_fiscal',
        'validade_documento_fiscal',
        'cpf',
        'data_desligamento',
        'motivo_desligamento',
        'data_afastamento',
        'data_retorno_afastamento',
      ]

      const stripAccents = (s) =>
        String(s)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')

      const normalizeKey = (k) =>
        stripAccents(k)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')

      const normalizeRow = (row) => {
        const norm = {}
        for (const key in row) {
          const rawKey = stripAccents(key).toLowerCase().trim()
          norm[rawKey] = row[key]
          const cleanKey = normalizeKey(key)
          if (cleanKey && cleanKey !== rawKey) {
            norm[cleanKey] = row[key]
          }
        }
        return norm
      }

      const pick = (norm, names) => {
        for (const name of names) {
          const clean = normalizeKey(name)
          const v = norm[name] !== undefined ? norm[name] : norm[clean]
          if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
        }
        return ''
      }

      const parseDate = (v) => {
        if (!v) return ''
        const s = String(v).trim()
        if (!s) return ''
        const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
        if (br) {
          return (
            br[3] + '-' + br[2].padStart(2, '0') + '-' + br[1].padStart(2, '0') + ' 12:00:00.000Z'
          )
        }
        const d = new Date(s)
        if (isNaN(d.getTime())) return ''
        return d.toISOString().replace('T', ' ')
      }

      const normFilial = (norm) => {
        const value = stripAccents(pick(norm, ['filial', 'garagem', 'unidade']))
          .toUpperCase()
          .trim()
        return FILIAIS.indexOf(value) !== -1 ? value : ''
      }

      const normSituacao = (norm) => {
        // 1. Checagem direta de desligamento: data_desligamento preenchida ou motivo_desligamento preenchido
        const dtDeslig = pick(norm, [
          'data_desligamento',
          'datadesligamento',
          'data_de_desligamento',
          'dt_desligamento',
          'dtdesligamento',
          'desligamento',
        ])
        const motDeslig = pick(norm, [
          'motivodeslig',
          'motivo_deslig',
          'motivo_desligamento',
          'motivodesligamento',
          'motivo_do_desligamento',
        ])
        if (dtDeslig || motDeslig) return 'Desligado'

        // 2. Coluna SITUACAO da view: situação do colaborador (ATIVO / AFASTADO / DESLIGADO).
        const raw = pick(norm, [
          'situacao',
          'situacaocolaborador',
          'situacao_colaborador',
          'situacao_do_colaborador',
          'status_colaborador',
          'status',
        ])
        const value = stripAccents(raw).toLowerCase().trim().replace(/\s+/g, ' ')
        if (value) {
          if (value.indexOf('deslig') !== -1) return 'Desligado'
          if (
            value.indexOf('afast') !== -1 ||
            value.indexOf('licen') !== -1 ||
            value.indexOf('feria') !== -1 ||
            value.indexOf('suspend') !== -1
          ) {
            return 'Afastado'
          }
          if (value.indexOf('ativ') !== -1) return 'Ativo'
        }

        // 3. Fallback quando vazio/nulo: se houver motivo de afastamento, 'Afastado'; senão 'Ativo'
        const motivo = stripAccents(
          pick(norm, [
            'motivofast',
            'motivo_fast',
            'motivo_afastamento',
            'motivo_do_afastamento',
            'motivo',
            'motivoafastamento',
          ]),
        )
          .toLowerCase()
          .trim()
        if (motivo) return 'Afastado'

        return 'Ativo'
      }

      const normSituacaoCnh = (norm) => {
        const raw = pick(norm, [
          'statuscnh',
          'status_cnh',
          'situacao_cnh',
          'situacaocnh',
          'cnh_status',
          'cnhstatus',
          'situacao_da_cnh',
        ])
        const value = stripAccents(raw).toLowerCase().trim().replace(/\s+/g, ' ')
        if (!value) return ''
        if (
          value.indexOf('no prazo') !== -1 ||
          value.indexOf('prazo') !== -1 ||
          value.indexOf('valid') !== -1
        ) {
          return 'Válida'
        }
        if (value.indexOf('vencida cnh') !== -1) return 'Vencida CNH'
        if (value.indexOf('vencid') !== -1) return 'Vencida'
        if (value.indexOf('vencer') !== -1) return 'A vencer'
        if (value.indexOf('sem') !== -1) return 'Sem CNH'
        return ''
      }

      const normalizeFuncao = (value) => {
        const raw = String(value ?? '')
          .trim()
          .replace(/\s+/g, ' ')
        if (!raw) return ''
        const key = stripAccents(raw).toLowerCase()
        if (key === 'motorista') return 'Motorista'
        if (key === 'fiscal' || key === 'fiscal de viajem' || key === 'fiscal de viagem') {
          return 'Fiscal de Viajem'
        }
        if (key === 'cobrador') return 'Cobrador'
        return raw
          .toLowerCase()
          .split(' ')
          .map(function (word) {
            return word ? word.charAt(0).toUpperCase() + word.slice(1) : ''
          })
          .join(' ')
      }

      const mapRow = (norm) => {
        const registro = pick(norm, ['registro', 'registro_rh', 'numero_registro'])
        return {
          registro: registro,
          chapa: pick(norm, ['chapa', 'matricula']) || registro,
          name: pick(norm, ['nome', 'name', 'nome_colaborador', 'colaborador']),
          // Decisão de negócio: a empresa é SEMPRE "VIA SUDESTE"
          company: 'VIA SUDESTE',
          filial: normFilial(norm),
          funcao: normalizeFuncao(
            pick(norm, ['funcao_atual', 'funcaoatual', 'funcao', 'cargo', 'funcao_do_colaborador']),
          ),
          funcao_anterior: normalizeFuncao(
            pick(norm, ['funcao_anterior', 'funcaoanterior', 'funcao_antiga', 'funcaoantiga']),
          ),
          data_desligamento: parseDate(
            pick(norm, [
              'data_desligamento',
              'datadesligamento',
              'data_de_desligamento',
              'dt_desligamento',
              'dtdesligamento',
              'desligamento',
            ]),
          ),
          motivo_desligamento: pick(norm, [
            'motivodeslig',
            'motivo_deslig',
            'motivo_desligamento',
            'motivodesligamento',
            'motivo_do_desligamento',
          ]),
          situacao: normSituacao(norm),
          cnh_numero: pick(norm, ['cnh_numero', 'numero_cnh', 'registro_cnh', 'cnh']),
          cnh_categoria: pick(norm, [
            'catcnh',
            'cat_cnh',
            'cnh_categoria',
            'cnhcategoria',
            'categoria_cnh',
            'categoriacnh',
            'categoria',
          ]),
          validade_cnh: parseDate(
            pick(norm, [
              'vencimentocnh',
              'vencimento_cnh',
              'validade_cnh',
              'validade_da_cnh',
              'validade',
            ]),
          ),
          situacao_cnh: normSituacaoCnh(norm),
          motivo_afastamento: pick(norm, [
            'motivofast',
            'motivo_fast',
            'motivo_afastamento',
            'motivo_do_afastamento',
            'motivo',
            'motivoafastamento',
          ]),
          inicio_afastamento: parseDate(
            pick(norm, [
              'data_afastamento',
              'dataafastamento',
              'inicio_afastamento',
              'inicio_do_afastamento',
              'data_inicio_afastamento',
            ]),
          ),
          previsao_retorno: parseDate(
            pick(norm, [
              'data_retorno_afastamento',
              'dataretornoafastamento',
              'previsao_retorno',
              'previsao_de_retorno',
              'data_retorno',
            ]),
          ),
          data_afastamento: parseDate(
            pick(norm, [
              'data_afastamento',
              'dataafastamento',
              'dt_afastamento',
              'dtafastamento',
              'inicio_afastamento',
            ]),
          ),
          data_retorno_afastamento: parseDate(
            pick(norm, [
              'data_retorno_afastamento',
              'dataretornoafastamento',
              'retorno_afastamento',
              'retornoafastamento',
              'dt_retorno_afastamento',
              'previsao_retorno',
            ]),
          ),
          documento_fiscal: pick(norm, ['documento_fiscal', 'doc_fiscal', 'certificado_mope']),
          validade_documento_fiscal: parseDate(
            pick(norm, [
              'validade_documento_fiscal',
              'validade_doc_fiscal',
              'validade_do_documento_fiscal',
            ]),
          ),
          cpf: pick(norm, ['cpf', 'cpf_do_colaborador']),
        }
      }

      // Comparador para checar se houve mudança real
      const isValueChanged = (oldVal, newVal) => {
        const s1 = oldVal === null || oldVal === undefined ? '' : String(oldVal).trim()
        const s2 = newVal === null || newVal === undefined ? '' : String(newVal).trim()
        if (s1.length >= 10 && s2.length >= 10 && s1.slice(0, 10) === s2.slice(0, 10)) {
          return false
        }
        return s1 !== s2
      }

      // ---- índices existentes com paginação por lote para evitar context deadline com 18k+ ----
      const byRegistro = {}
      const byChapa = {}
      const byCpf = {}
      const allExistingIds = []
      const BATCH_LOAD_SIZE = 2000
      let offset = 0

      while (true) {
        const batch = $app.findRecordsByFilter('employees', '', 'id', BATCH_LOAD_SIZE, offset)
        if (!batch || batch.length === 0) break
        for (const rec of batch) {
          allExistingIds.push({
            id: rec.id,
            registro: String(rec.getString('registro') ?? '').trim(),
            chapa: String(rec.getString('chapa') ?? '').trim(),
            cpf: String(rec.getString('cpf') ?? '').trim(),
          })
          const r = String(rec.getString('registro') ?? '').trim()
          if (r && !byRegistro[r]) byRegistro[r] = rec
          const c = String(rec.getString('chapa') ?? '').trim()
          if (c && !byChapa[c]) byChapa[c] = rec
          const d = String(rec.getString('cpf') ?? '').trim()
          if (d && !byCpf[d]) byCpf[d] = rec
        }
        if (batch.length < BATCH_LOAD_SIZE) break
        offset += BATCH_LOAD_SIZE
      }

      const employeesCol = $app.findCollectionByNameOrId('employees')
      const seenRegistros = {}
      const seenChapas = {}
      const seenCpfs = {}
      let created = 0
      let updated = 0
      let unchanged = 0
      let removed = 0
      const rowErrors = []

      // ---- upsert dos registros da view ----------------------------------------
      for (const raw of payload) {
        const data = mapRow(normalizeRow(raw))
        if (!data.registro && !data.chapa && !data.cpf) {
          rowErrors.push('Registro sem registro/chapa/cpf: ' + JSON.stringify(raw).slice(0, 200))
          continue
        }
        if (!data.name) {
          rowErrors.push('Registro sem nome (chapa ' + (data.chapa || data.registro) + ')')
          continue
        }

        let record =
          (data.registro && byRegistro[data.registro]) ||
          (data.chapa && byChapa[data.chapa]) ||
          (data.cpf && byCpf[data.cpf]) ||
          null

        if (record) {
          let hasChanges = false
          for (const f of FIELDS) {
            const currentVal = record.getString(f)
            const targetVal = data[f]
            if (isValueChanged(currentVal, targetVal)) {
              hasChanges = true
              record.set(f, targetVal)
            }
          }
          if (hasChanges) {
            $app.save(record)
            updated++
          } else {
            unchanged++
          }
        } else {
          record = new Record(employeesCol)
          for (const f of FIELDS) record.set(f, data[f])
          $app.save(record)
          created++
        }

        if (data.registro) {
          seenRegistros[data.registro] = true
          byRegistro[data.registro] = record
        }
        if (data.chapa) {
          seenChapas[data.chapa] = true
          byChapa[data.chapa] = record
        }
        if (data.cpf) {
          seenCpfs[data.cpf] = true
          byCpf[data.cpf] = record
        }
      }

      // ---- espelhamento: remove quem NÃO veio na view (limpa os mocks/seed) ----
      for (const item of allExistingIds) {
        const r = item.registro
        const c = item.chapa
        const d = item.cpf
        const kept = (r && seenRegistros[r]) || (c && seenChapas[c]) || (d && seenCpfs[d])
        if (!kept) {
          try {
            const recToDelete = $app.findRecordById('employees', item.id)
            if (recToDelete) {
              $app.delete(recToDelete)
              removed++
            }
          } catch (_) {}
        }
      }

      run.set('status', 'Sucesso')
      run.set('records_updated', created + updated + removed)
      run.set('finished_at', nowStr())
      let runNotes = paginationNotice || ''
      if (rowErrors.length > 0) {
        const errSample = rowErrors.slice(0, 5).join(' | ')
        runNotes = runNotes ? runNotes + ' | ' + errSample : errSample
      }
      run.set('error', runNotes)
      $app.save(run)

      console.log(
        'sync:employees (' + trigger + ') — Sucesso:',
        created + updated + removed,
        'registros modificados (',
        created,
        'novos,',
        updated,
        'atualizados,',
        unchanged,
        'inalterados,',
        removed,
        'removidos )',
      )

      return e.json(200, {
        id: run.id,
        status: run.getString('status'),
        records_updated: run.getInt('records_updated'),
        error: run.getString('error'),
      })
    } catch (err) {
      run.set('status', 'Falha')
      run.set('finished_at', nowStr())
      run.set('error', String((err && err.message) || err))
      $app.save(run)
      console.log('sync:employees (' + trigger + ') — Falha:', String((err && err.message) || err))
      return e.json(500, {
        id: run.id,
        status: run.getString('status'),
        records_updated: run.getInt('records_updated'),
        error: run.getString('error'),
      })
    }
  },
  $apis.requireAuth(),
)
