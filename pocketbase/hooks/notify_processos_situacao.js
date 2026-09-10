/**
 * Hook disparado antes e depois de atualizar um registro em processos_cadastrais.
 *
 * Requisito:
 * Mudança de situação em `processos_cadastrais` — quando o campo `situacao` de um registro
 * for alterado (ex.: Tráfego mudando para "Foto Bloqueada" ou "Impossibilitado de Trabalhar"),
 * criar notificação com o nome/registro do colaborador, a situação anterior e a nova.
 * Destinatários: usuários Admin e RH (não enviar para o próprio autor da alteração; Tráfego não recebe).
 *
 * Regras Skip Cloud / PocketBase v0.36:
 * - Toda a lógica vive dentro dos callbacks inline (sem escopo externo).
 * - Usa $app para operações no banco.
 * - Resiliente: try/catch total para não interromper a operação principal.
 */

onRecordUpdateRequest((e) => {
  try {
    const record = e.record
    if (!record) return e.next()

    const oldSituacao = String(record.original().getString('situacao') || '').trim()
    const newSituacao = String(record.getString('situacao') || '').trim()

    // Passa adiante a requisição para salvar no banco
    e.next()

    // Só dispara se houve alteração real na situação
    if (!oldSituacao || !newSituacao || oldSituacao === newSituacao) {
      return
    }

    const colaborador = String(record.getString('colaborador') || '').trim()
    const matricula = String(record.getString('matricula') || '').trim()
    const authId = e.auth ? String(e.auth.id || '') : ''

    const notifCol = $app.findCollectionByNameOrId('notifications')
    if (!notifCol) return

    // Buscar usuários Admin e RH
    const targets = $app.findRecordsByFilter('users', 'role = "Admin" || role = "RH"', '', 100, 0)

    const obs = String(record.getString('observacoes') || '').trim()
    const labelColab = matricula ? `${colaborador} (${matricula})` : colaborador
    const title = 'Situação de processo alterada'
    let message = `Situação alterada: ${labelColab} → ${newSituacao} (anterior: ${oldSituacao})`
    if (obs) {
      message += ` — OBS: ${obs}`
    }

    // Determinar tipo da notificação: alert para bloqueios, info para demais
    const type =
      newSituacao === 'Foto Bloqueada' ||
      newSituacao === 'Impossibilitado de Trabalhar' ||
      newSituacao === 'Bloqueado'
        ? 'alert'
        : 'info'

    for (const targetUser of targets) {
      // Não enviar para o próprio autor da alteração
      if (authId && targetUser.id === authId) {
        continue
      }
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
          'notif_processos erro ao criar notificacao individual:',
          String((innerErr && innerErr.message) || innerErr),
        )
      }
    }
  } catch (err) {
    console.log('notif_processos hook erro ignorado:', String((err && err.message) || err))
    return e.next()
  }
}, 'processos_cadastrais')
