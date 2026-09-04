/**
 * Hook disparado após atualização em `employees`.
 *
 * Requisito:
 * Afastamento/retorno de colaborador — quando `situacao` de um registro em `employees`
 * mudar para "Afastado" (aviso de afastamento) ou deixar de ser "Afastado"/voltar a ativo (aviso de retorno).
 * Destinatários: Admin e RH.
 *
 * Pode acontecer tanto via requisição de usuário autenticado quanto via sincronização automática/rotinas de backend.
 * Por isso usamos `onRecordAfterUpdateSuccess`, que roda em qualquer update com sucesso da collection employees.
 *
 * Mensagens em pt-BR, ex.:
 * "Colaborador afastado: José Lima (005502)"
 * "Colaborador retornou: José Lima (005502) — situação: Ativo"
 *
 * Resiliente: try/catch completo para nunca falhar a operação em employees.
 */

onRecordAfterUpdateSuccess((e) => {
  try {
    const record = e.record
    if (!record) return

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
