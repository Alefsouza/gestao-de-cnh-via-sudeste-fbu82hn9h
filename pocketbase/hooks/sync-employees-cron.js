/**
 * Cron de sincronização: roda a cada 5 minutos e espelha a view externa
 * (secret VW_CONTROLE_CNH) na collection `employees`.
 *
 * A rotina real vive AQUI DENTRO (o corpo inteiro está no callback do cron),
 * e é a MESMA rotina embutida na rota manual `sync-employees-run.js`
 * (POST /backend/v1/sync-employees, o botão "Atualizar matriz").
 *
 * Convenções Skip Cloud: o callback roda em outra VM e não enxerga
 * identificadores de topo de arquivo — toda a lógica vive dentro do callback.
 */

cronAdd('sync_employees', '*/5 * * * *', () => {
  const trigger = 'cron'
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

    const res = $http.send({ url: secretUrl, method: 'GET', timeout: 30 })
    if (res.statusCode >= 400) {
      throw new Error('A view externa respondeu HTTP ' + res.statusCode)
    }

    let payload = res.json
    if (payload && !Array.isArray(payload)) {
      payload = payload.data ?? payload.rows ?? payload.records ?? payload.items ?? []
    }
    if (!Array.isArray(payload) || payload.length === 0) {
      throw new Error('A view externa retornou vazia — nenhum dado foi alterado.')
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
      // 1. Coluna SITUACAO da VW_CONTROLE_CNH: situação do colaborador (ATIVO / AFASTADO).
      // Normalizada para "Ativo" e "Afastado" (ou "Desligado").
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

      // Fallback quando vazio/nulo: se houver motivo de afastamento, 'Afastado'; senão 'Ativo' como padrão oficial
      const motivo = stripAccents(
        pick(norm, ['motivo_afastamento', 'motivo_do_afastamento', 'motivo', 'motivoafastamento']),
      )
        .toLowerCase()
        .trim()
      if (motivo) return 'Afastado'

      return 'Ativo'
    }

    const normSituacaoCnh = (norm) => {
      // 2. Coluna STATUSCNH da VW_CONTROLE_CNH: status da CNH ("NO PRAZO" / "VENCIDA").
      // Normalizada para "Válida" (quando "NO PRAZO") e "Vencida" (quando "VENCIDA").
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

    /**
     * Normalização de função: trim + colapso de espaços + capitalização
     * canônica. Regras mínimas exigidas:
     *   MOTORISTA / motorista / Motorista → "Motorista"
     *   FISCAL / FISCAL DE VIAJEM / FISCAL DE VIAGEM (e variações) →
     *     "Fiscal de Viajem"
     *   COBRADOR / COBRADOR (com espaço) → "Cobrador"
     */
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
        // A view externa (VW_CONTROLE_CNH) NÃO envia `chapa` — apenas `registro`
        // (ex.: {"registro":"000013", ...}). Como `chapa` é obrigatório em
        // `employees`, ela herda o valor de `registro` quando vem em branco.
        // Se `registro` também vier em branco, o tratamento de erro existente
        // no loop de upsert já registra a linha sem registro/chapa/cpf.
        chapa: pick(norm, ['chapa', 'matricula']) || registro,
        name: pick(norm, ['nome', 'name', 'nome_colaborador', 'colaborador']),
        // A view externa (VW_CONTROLE_CNH) NÃO envia a empresa — decisão de
        // negócio: a empresa é SEMPRE "VIA SUDESTE", fixa para todos os
        // registros (upsert), sem depender de campo vindo da view.
        company: 'VIA SUDESTE',
        filial: normFilial(norm),
        funcao: normalizeFuncao(pick(norm, ['funcao', 'cargo', 'funcao_do_colaborador'])),
        situacao: normSituacao(norm),
        cnh_numero: pick(norm, ['cnh_numero', 'numero_cnh', 'registro_cnh', 'cnh']),
        cnh_categoria: pick(norm, [
          'catcnh',
          'cat_cnh',
          'cnh_categoria',
          'categoria_cnh',
          'categoria',
        ]),
        validade_cnh: parseDate(
          pick(norm, [
            'validade_cnh',
            'validade_da_cnh',
            'vencimento_cnh',
            'vencimentocnh',
            'validade',
          ]),
        ),
        situacao_cnh: normSituacaoCnh(norm),
        motivo_afastamento: pick(norm, ['motivo_afastamento', 'motivo_do_afastamento', 'motivo']),
        inicio_afastamento: parseDate(
          pick(norm, ['inicio_afastamento', 'inicio_do_afastamento', 'data_inicio_afastamento']),
        ),
        previsao_retorno: parseDate(
          pick(norm, ['previsao_retorno', 'previsao_de_retorno', 'data_retorno']),
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

    // ---- índices existentes (dedup por registro, depois chapa e cpf) ---------
    const existingAll = $app.findRecordsByFilter('employees', '', '', 0, 0)
    const byRegistro = {}
    const byChapa = {}
    const byCpf = {}
    for (const rec of existingAll) {
      const r = String(rec.getString('registro') ?? '').trim()
      if (r) byRegistro[r] = rec
      const c = String(rec.getString('chapa') ?? '').trim()
      if (c) byChapa[c] = rec
      const d = String(rec.getString('cpf') ?? '').trim()
      if (d) byCpf[d] = rec
    }

    const employeesCol = $app.findCollectionByNameOrId('employees')
    const seenRegistros = {}
    const seenChapas = {}
    const seenCpfs = {}
    let created = 0
    let updated = 0
    let removed = 0
    const rowErrors = []

    if (payload.length > 0) {
      console.log('sync:sample_keys:', Object.keys(payload[0]).join(', '))
      console.log('sync:sample_row_0:', JSON.stringify(payload[0]))
      if (payload.length > 8) {
        console.log('sync:sample_row_8:', JSON.stringify(payload[8]))
      }
    }

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
        for (const f of FIELDS) record.set(f, data[f])
        $app.save(record)
        updated++
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
    for (const rec of existingAll) {
      const r = String(rec.getString('registro') ?? '').trim()
      const c = String(rec.getString('chapa') ?? '').trim()
      const d = String(rec.getString('cpf') ?? '').trim()
      const kept = (r && seenRegistros[r]) || (c && seenChapas[c]) || (d && seenCpfs[d])
      if (!kept) {
        $app.delete(rec)
        removed++
      }
    }

    run.set('status', 'Sucesso')
    run.set('records_updated', created + updated + removed)
    run.set('finished_at', nowStr())
    run.set('error', rowErrors.length > 0 ? rowErrors.slice(0, 5).join(' | ') : '')
    $app.save(run)
    console.log(
      'sync:employees (' + trigger + ') — Sucesso:',
      created + updated + removed,
      'registros (',
      created,
      'novos,',
      updated,
      'atualizados,',
      removed,
      'removidos )',
    )
  } catch (err) {
    run.set('status', 'Falha')
    run.set('finished_at', nowStr())
    run.set('error', String((err && err.message) || err))
    $app.save(run)
    console.log('sync:employees (' + trigger + ') — Falha:', String((err && err.message) || err))
  }
})
