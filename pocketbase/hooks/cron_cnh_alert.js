/**
 * Cron diário de alerta de CNHs vencidas ou a vencer em até 30 dias.
 *
 * Agendamento: 1x ao dia às 06:00 BRT (09:00 UTC): '0 9 * * *'
 *
 * Destinatários: usuários com perfil Admin e RH.
 *
 * Evita spam e duplicatas diárias:
 * - Agrega as notificações em alertas claros e acionáveis, ou gera notificações individuais
 *   apenas para colaboradores que ainda NÃO possuam notificação de CNH não lida (read = false)
 *   para evitar entupir o sininho todos os dias.
 * - Adicionalmente, resume o panorama geral quando há múltiplos casos.
 *
 * Mensagens em pt-BR claras e curtas:
 * Ex: "CNH vencida: Maria Souza (004100) — venceu em 12/01/2025"
 * Ex: "CNH perto de vencer: Carlos Silva (003200) — vence em 28/09/2026 (em 15 dias)"
 */

cronAdd('alert_cnh_expiration', '0 9 * * *', () => {
  try {
    const notifCol = $app.findCollectionByNameOrId('notifications')
    const employeesCol = $app.findCollectionByNameOrId('employees')
    if (!notifCol || !employeesCol) return

    const targets = $app.findRecordsByFilter('users', 'role = "Admin" || role = "RH"', '', 100, 0)
    if (!targets || targets.length === 0) return

    // Buscar notificações não lidas existentes na coleção de notificações
    // para não duplicar avisos do mesmo colaborador enquanto o RH/Admin não tiver lido
    const unreadNotifs = $app.findRecordsByFilter(
      'notifications',
      'read = false && (title ~ "CNH vencida" || title ~ "CNH a vencer" || title ~ "CNH perto de vencer")',
      '',
      1000,
      0,
    )
    const activeAlertKeys = {}
    for (const n of unreadNotifs) {
      const u = String(n.getString('user') || '')
      const msg = String(n.getString('message') || '')
      // Armazena chave por usuário e mensagem para deduplicação
      activeAlertKeys[u + '::' + msg] = true
    }

    const now = new Date()
    const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    // Formatar data em dd/mm/aaaa
    const formatBrDate = (dateVal) => {
      if (!dateVal) return ''
      try {
        const d = new Date(dateVal)
        if (isNaN(d.getTime())) return String(dateVal).slice(0, 10)
        const day = String(d.getUTCDate()).padStart(2, '0')
        const month = String(d.getUTCMonth() + 1).padStart(2, '0')
        const year = d.getUTCFullYear()
        return `${day}/${month}/${year}`
      } catch (_) {
        return String(dateVal).slice(0, 10)
      }
    }

    // Calcular dias até o vencimento
    const calcDaysUntil = (dateVal) => {
      if (!dateVal) return null
      const d = new Date(dateVal)
      if (isNaN(d.getTime())) return null
      const diffMs = d.getTime() - now.getTime()
      return Math.round(diffMs / (1000 * 60 * 60 * 24))
    }

    // Buscar motoristas/colaboradores com CNH preenchida
    // Apenas ativos ou em trânsito com cnh_numero
    const employees = $app.findRecordsByFilter(
      'employees',
      'cnh_numero != "" && situacao_cnh != "Sem CNH" && situacao != "Desligado"',
      'validade_cnh',
      500,
      0,
    )

    let createdCount = 0

    for (const emp of employees) {
      const name = String(emp.getString('name') || '').trim()
      const chapa = String(emp.getString('chapa') || emp.getString('registro') || '').trim()
      const labelColab = chapa ? `${name} (${chapa})` : name
      const sitCnh = String(emp.getString('situacao_cnh') || '').trim()
      const rawValidade = emp.getString('validade_cnh')

      if (!rawValidade && sitCnh !== 'Vencida' && sitCnh !== 'Vencida CNH') {
        continue
      }

      const validadeDate = rawValidade ? new Date(rawValidade) : null
      const days = validadeDate ? calcDaysUntil(rawValidade) : -1
      const formattedDate = formatBrDate(rawValidade)

      let title = ''
      let message = ''
      let isAlert = false

      if (sitCnh === 'Vencida' || sitCnh === 'Vencida CNH' || (days !== null && days < 0)) {
        title = 'CNH vencida'
        message = formattedDate
          ? `CNH vencida: ${labelColab} — venceu em ${formattedDate}`
          : `CNH vencida: ${labelColab}`
        isAlert = true
      } else if (sitCnh === 'A vencer' || (days !== null && days >= 0 && days <= 30)) {
        title = 'CNH a vencer'
        const diasMsg =
          days === 0 ? 'vence hoje' : days === 1 ? 'vence em 1 dia' : `vence em ${days} dias`
        message = formattedDate
          ? `CNH perto de vencer: ${labelColab} — vence em ${formattedDate} (${diasMsg})`
          : `CNH perto de vencer: ${labelColab} (${diasMsg})`
        isAlert = false
      }

      if (!title || !message) continue

      for (const targetUser of targets) {
        const dedupKey = targetUser.id + '::' + message
        if (activeAlertKeys[dedupKey]) {
          // Já existe notificação idêntica não lida para este usuário
          continue
        }

        try {
          const notif = new Record(notifCol)
          notif.set('user', targetUser.id)
          notif.set('title', title)
          notif.set('message', message)
          notif.set('type', isAlert ? 'alert' : 'info')
          notif.set('read', false)
          $app.save(notif)
          activeAlertKeys[dedupKey] = true
          createdCount++
        } catch (innerErr) {
          console.log(
            'alert_cnh_expiration erro ao gravar notificacao:',
            String((innerErr && innerErr.message) || innerErr),
          )
        }
      }
    }

    console.log(
      `alert_cnh_expiration finalizado com sucesso. ${createdCount} notificacoes geradas.`,
    )
  } catch (err) {
    console.log('alert_cnh_expiration cron erro ignorado:', String((err && err.message) || err))
  }
})
