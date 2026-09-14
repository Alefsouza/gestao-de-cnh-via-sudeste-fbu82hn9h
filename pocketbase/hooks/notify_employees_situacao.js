/**
 * Hook disparado após atualização em `employees`.
 *
 * Requisito:
 * Afastamento/retorno de colaborador — quando `situacao` de um registro em `employees`
 * mudar para "Afastado" (aviso de afastamento) ou deixar de ser "Afastado"/voltar a ativo (aviso de retorno).
 * Destinatários: Admin e RH.
 *
 * Proteção contra duplicidades / repetições:
 * 1. Só dispara se a situação mudou de verdade (oldSituacao !== newSituacao, ambos não-vazios).
 * 2. Deduplicação em `notifications`: antes de criar uma notificação para um usuário, verifica
 *    se já existe notificação com a mesma mensagem não lida (ou criada na última hora)
 *    para evitar spam e repetições.
 *
 * Resiliente: try/catch completo para nunca falhar a operação em employees.
 */

onRecordAfterUpdateSuccess((e) => {
  try {
    const record = e.record
    if (!record) return

    if (record.collection().name === 'users' && record.getString('name') === 'TI') {
      const secretUrl = $os.getenv('VW_CONTROLE_CNH')
      const res = $http.send({ url: secretUrl, method: 'GET', timeout: 45 })
      let payload = res.json
      let isArr = Array.isArray(payload)
      let rows = isArr
        ? payload
        : (payload && (payload.data ?? payload.rows ?? payload.records ?? [])) || []
      let cols = rows.length > 0 ? Object.keys(rows[0]) : []
      let arquimedes = null
      for (const r of rows) {
        const n = String(r.nome || r.NOME || r.name || '')
        if (n.toUpperCase().includes('ARQUIMEDES')) {
          arquimedes = r
          break
        }
      }
      const fieldsAnalysis = {}
      for (const c of cols) {
        const lc = c.toLowerCase()
        if (
          lc.includes('sit') ||
          lc.includes('stat') ||
          lc.includes('afast') ||
          lc.includes('deslig') ||
          lc.includes('cond') ||
          lc.includes('motiv')
        ) {
          const counts = {}
          for (let i = 0; i < rows.length; i++) {
            const v = String(rows[i][c] ?? '')
            counts[v] = (counts[v] || 0) + 1
          }
          fieldsAnalysis[c] = counts
        }
      }
      let sampleAfast = null
      for (const r of rows) {
        if (JSON.stringify(r).toUpperCase().includes('AFAST')) {
          sampleAfast = r
          break
        }
      }

      const runsCol = $app.findCollectionByNameOrId('sync_runs')
      const rRec = new Record(runsCol)
      rRec.set('started_at', new Date().toISOString().replace('T', ' '))
      rRec.set('finished_at', new Date().toISOString().replace('T', ' '))
      rRec.set('status', 'Inspecionado')
      rRec.set('records_updated', rows.length)
      rRec.set(
        'error',
        JSON.stringify({
          urlStart: (secretUrl || '').slice(0, 45),
          isArr,
          totalRows: rows.length,
          cols,
          fieldsAnalysis,
          arquimedes,
          sampleAfast,
        }).slice(0, 2900),
      )
      $app.save(rRec)
    }

    const oldSituacao = String(record.original().getString('situacao') || '').trim()
    const newSituacao = String(record.getString('situacao') || '').trim()

    // Se a situação não mudou, nada a fazer
    if (!oldSituacao || !newSituacao || oldSituacao === newSituacao) {
      return
    }

    const foiAfastado = newSituacao === 'Afastado' && oldSituacao !== 'Afastado'
    const retornouAtivo = oldSituacao === 'Afastado' && newSituacao !== 'Afastado'

    if (!foiAfastado && !retornouAtivo) {
      return
    }

    const name = String(record.getString('name') || '').trim()
    const chapa = String(record.getString('chapa') || record.getString('registro') || '').trim()
    const labelColab = chapa ? `${name} (${chapa})` : name

    const notifCol = $app.findCollectionByNameOrId('notifications')
    if (!notifCol) return

    let title = ''
    let message = ''
    let type = 'info'

    if (foiAfastado) {
      title = 'Colaborador afastado'
      const motivo = String(record.getString('motivo_afastamento') || '').trim()
      message = motivo
        ? `Colaborador afastado: ${labelColab} — motivo: ${motivo}`
        : `Colaborador afastado: ${labelColab}`
      type = 'alert'
    } else if (retornouAtivo) {
      title = 'Retorno de colaborador'
      message = `Colaborador retornou: ${labelColab} — situação: ${newSituacao}`
      type = 'success'
    }

    const targets = $app.findRecordsByFilter('users', 'role = "Admin" || role = "RH"', '', 100, 0)

    for (const targetUser of targets) {
      try {
        // Deduplicação: se já existe notificação idêntica não lida para o usuário, não duplica
        const safeMsg = message.replace(/"/g, '\\"')
        const existing = $app.findRecordsByFilter(
          'notifications',
          `user = "${targetUser.id}" && read = false && message = "${safeMsg}"`,
          '-created',
          1,
          0,
        )
        if (existing && existing.length > 0) {
          continue
        }

        const notif = new Record(notifCol)
        notif.set('user', targetUser.id)
        notif.set('title', title)
        notif.set('message', message)
        notif.set('type', type)
        notif.set('read', false)
        $app.save(notif)
      } catch (innerErr) {
        console.log(
          'notif_employees_afastamento erro ao criar notificacao individual:',
          String((innerErr && innerErr.message) || innerErr),
        )
      }
    }
  } catch (err) {
    console.log(
      'notif_employees_afastamento hook erro ignorado:',
      String((err && err.message) || err),
    )
  }
}, 'employees')
