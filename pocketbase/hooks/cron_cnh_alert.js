/**
 * Cron diário de alerta de CNHs vencidas ou a vencer em até 30 dias.
 *
 * Agendamento: 1x ao dia às 06:00 BRT (09:00 UTC): '0 9 * * *'
 *
 * Destinatários: usuários com perfil Admin e RH.
 *
 * 1. Notificações in-app (sininho) para usuários com perfil Admin e RH:
 *    - CNHs já vencidas
 *    - CNHs a vencer em até 30 dias
 *    - Deduplicação: não repete se já houver notificação não lida.
 *
 * 2. E-mail consolidado institucional 15 dias antes do vencimento:
 *    - Identifica colaboradores cuja CNH vence no marco de 15 dias corridos (janela 14 a 16 dias).
 *    - Deduplicação/Idempotência: registra em cnh_email_logs com (matricula, validade_cnh, tipo_aviso='15_dias')
 *      para nunca enviar o mesmo marco mais de uma vez para o mesmo colaborador e vencimento.
 *    - Envia UM ÚNICO e-mail consolidado para os usuários Admin e RH com e-mail válido.
 *    - Se nenhum colaborador estiver no marco de 15 dias naquele dia, nenhum e-mail sai.
 *
 * NOTA DE ARQUITETURA POCKETBASE:
 * Cada callback roda em uma VM isolada da pool. Funções utilitárias e lógica devem
 * ser declaradas internamente no escopo de cada callback.
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
      activeAlertKeys[u + '::' + msg] = true
    }

    const now = new Date()

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

    // Normalizar string de data YYYY-MM-DD para chaves de log
    const toDateKey = (dateVal) => {
      if (!dateVal) return ''
      try {
        const d = new Date(dateVal)
        if (isNaN(d.getTime())) return String(dateVal).slice(0, 10)
        return d.toISOString().slice(0, 10)
      } catch (_) {
        return String(dateVal).slice(0, 10)
      }
    }

    // Calcular dias até o vencimento a partir do início do dia UTC
    const calcDaysUntil = (dateVal) => {
      if (!dateVal) return null
      const d = new Date(dateVal)
      if (isNaN(d.getTime())) return null

      // Zerar horas para calcular dias civis exatos
      const dUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      const diffMs = dUtc - nowUtc
      return Math.round(diffMs / (1000 * 60 * 60 * 24))
    }

    const escapeHtml = (str) => {
      if (str === null || str === undefined) return ''
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    }

    const buildEmailTemplate = (colaboradores, isTest) => {
      const qtd = colaboradores.length
      const plural = qtd > 1

      let rowsHtml = ''
      for (let i = 0; i < colaboradores.length; i++) {
        const c = colaboradores[i]
        const bgRow = i % 2 === 0 ? '#ffffff' : '#f9fafb'
        const diasTxt =
          c.diasRestantes !== undefined && c.diasRestantes !== null
            ? ` (~${c.diasRestantes} dias)`
            : ''
        const metaInfo = [c.funcao, c.filial].filter(Boolean).join(' · ')

        rowsHtml += `
          <tr style="background-color: ${bgRow}; border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px 14px; font-size: 14px; color: #111827; font-weight: 600;">
              ${escapeHtml(c.name)}
              ${metaInfo ? `<div style="font-size: 11px; font-weight: 400; color: #6b7280; margin-top: 2px;">${escapeHtml(metaInfo)}</div>` : ''}
            </td>
            <td style="padding: 12px 14px; font-size: 14px; color: #374151; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 600;">
              ${escapeHtml(c.re)}
            </td>
            <td style="padding: 12px 14px; font-size: 14px; color: #b91c1c; font-weight: 700; white-space: nowrap;">
              ${escapeHtml(c.validadeBr)}
              <span style="font-size: 11px; font-weight: 500; color: #dc2626; display: block;">${diasTxt}</span>
            </td>
          </tr>
        `
      }

      const testBanner = isTest
        ? `
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; margin-bottom: 20px;">
            <tr>
              <td style="padding: 12px 16px; font-size: 13px; color: #92400e; font-weight: 600; text-align: center;">
                🧪 E-MAIL DE TESTE DO SISTEMA — Validação do disparo automático e layout institucional
              </td>
            </tr>
          </table>
        `
        : ''

      return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alerta CNH Via Sudeste</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Container Principal -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.04); border: 1px solid #e5e7eb;">
          
          <!-- Cabeçalho Institucional Verde Via Sudeste -->
          <tr>
            <td style="background: linear-gradient(135deg, #15803d 0%, #16a34a 100%); background-color: #16a34a; padding: 26px 28px; text-align: left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #bbf7d0; margin-bottom: 4px;">
                      VIA SUDESTE TRANSPORTES
                    </div>
                    <h1 style="margin: 0; font-size: 21px; line-height: 26px; font-weight: 700; color: #ffffff;">
                      Alerta: CNH${plural ? 's' : ''} vencendo em 15 dias
                    </h1>
                    <div style="font-size: 13px; color: #dcfce7; margin-top: 6px;">
                      Gestão de CNH &middot; Portal Recursos Humanos
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Corpo Principal -->
          <tr>
            <td style="padding: 26px 28px;">
              ${testBanner}

              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 22px; color: #374151;">
                Olá, equipe de Recursos Humanos e Administração,
              </p>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 22px; color: #4b5563;">
                Identificamos <strong>${qtd} colaborador${plural ? 'es' : ''}</strong> cuja Carteira Nacional de Habilitação (CNH) atinge o marco de <strong>15 dias corridos para o vencimento</strong>. Favor verificar com antecedência a regularização ou abertura de processo cadastral.
              </p>

              <!-- Tabela de Colaboradores -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                <thead>
                  <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left;">
                    <th style="padding: 10px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #475569;">
                      Colaborador
                    </th>
                    <th style="padding: 10px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #475569;">
                      RE
                    </th>
                    <th style="padding: 10px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #475569;">
                      Vencimento CNH
                    </th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>

              <!-- Caixa Informativa de Ação -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 4px; margin-bottom: 22px;">
                <tr>
                  <td style="padding: 14px 16px;">
                    <div style="font-size: 13px; line-height: 20px; color: #166534; font-weight: 600; margin-bottom: 2px;">
                      Orientações de regularização:
                    </div>
                    <div style="font-size: 12px; line-height: 18px; color: #15803d;">
                      Acompanhe pelo sistema Gestão de CNH se o colaborador já iniciou o processo de renovação ou entrega da documentação atualizada para evitar bloqueio operacional no tráfego.
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 13px; line-height: 20px; color: #6b7280;">
                Este e-mail é gerado de forma automática e consolidada a cada dia civil pelo monitor de CNHs.
              </p>
            </td>
          </tr>

          <!-- Rodapé Institucional -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 28px; border-top: 1px solid #e5e7eb; text-align: center;">
              <div style="font-size: 12px; font-weight: 600; color: #4b5563; margin-bottom: 4px;">
                Via Sudeste Transportes Urbanos Ltda.
              </div>
              <div style="font-size: 11px; color: #9ca3af; line-height: 16px;">
                Portal RH &middot; Sistema de Gestão de CNH &middot; Mensagem automática, não responda este e-mail.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `
    }

    // Buscar motoristas/colaboradores com CNH preenchida (ativos ou afastados, exceto Desligado)
    const employees = $app.findRecordsByFilter(
      'employees',
      'cnh_numero != "" && situacao_cnh != "Sem CNH" && situacao != "Desligado"',
      'validade_cnh',
      1000,
      0,
    )

    let createdNotifCount = 0
    const employees15Dias = []

    // -------------------------------------------------------------
    // 1. Processar alertas do sininho e filtrar marco de 15 dias
    // -------------------------------------------------------------
    for (const emp of employees) {
      const name = String(emp.getString('name') || '').trim()
      const registro = String(emp.getString('registro') || '').trim()
      const chapa = String(emp.getString('chapa') || registro).trim()
      const re = registro || chapa || 'N/I'
      const labelColab = re !== 'N/I' ? `${name} (${re})` : name
      const sitCnh = String(emp.getString('situacao_cnh') || '').trim()
      const rawValidade = emp.getString('validade_cnh')
      const filial = String(emp.getString('filial') || '').trim()
      const funcao = String(emp.getString('funcao') || '').trim()

      if (!rawValidade && sitCnh !== 'Vencida' && sitCnh !== 'Vencida CNH') {
        continue
      }

      const days = rawValidade ? calcDaysUntil(rawValidade) : -1
      const formattedDate = formatBrDate(rawValidade)

      // Checagem para e-mail de 15 dias:
      // Janela de 14 a 16 dias com foco no marco de 15 dias corridos
      if (days !== null && days >= 14 && days <= 16) {
        employees15Dias.push({
          id: emp.id,
          name: name,
          re: re,
          validadeRaw: rawValidade,
          validadeKey: toDateKey(rawValidade),
          validadeBr: formattedDate,
          diasRestantes: days,
          filial: filial,
          funcao: funcao,
        })
      }

      // Notificação in-app (comportamento original preservado)
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
          createdNotifCount++
        } catch (innerErr) {
          console.log(
            'alert_cnh_expiration erro ao gravar notificacao:',
            String((innerErr && innerErr.message) || innerErr),
          )
        }
      }
    }

    console.log(
      `alert_cnh_expiration: ${createdNotifCount} notificacoes in-app geradas. Analisando envio de e-mails de 15 dias...`,
    )

    // -------------------------------------------------------------
    // 2. Processar E-mail consolidado de 15 dias (se houver colaboradores)
    // -------------------------------------------------------------
    if (employees15Dias.length > 0) {
      const cnhLogsCol = $app.findCollectionByNameOrId('cnh_email_logs')
      const finalColabs = []

      for (const c of employees15Dias) {
        // Verificar idempotência na coleção cnh_email_logs
        if (cnhLogsCol) {
          const mat = String(c.re || '').trim()
          const dt = String(c.validadeKey || '').trim()
          if (mat && dt) {
            const jaEnviado = $app.findRecordsByFilter(
              'cnh_email_logs',
              `matricula = "${mat}" && validade_cnh = "${dt}" && tipo_aviso = "15_dias"`,
              '',
              1,
              0,
            )
            if (jaEnviado && jaEnviado.length > 0) {
              console.log(
                `E-mail de 15 dias ja enviado anteriormente para RE ${mat} (${c.name}) vencimento ${dt}. Ignorando.`,
              )
              continue
            }
          }
        }
        finalColabs.push(c)
      }

      if (finalColabs.length === 0) {
        console.log(
          'alert_cnh_expiration: Todos os colaboradores do marco de 15 dias ja receberam o e-mail anteriormente. Sem novos envios.',
        )
      } else {
        // Resolver destinatários (Admin e RH com e-mail preenchido)
        const emailMap = {}
        for (const u of targets) {
          const mail = String(u.getString('email') || '')
            .trim()
            .toLowerCase()
          if (mail && mail.indexOf('@') !== -1) {
            emailMap[mail] = true
          }
        }
        const recipientAddresses = Object.keys(emailMap)

        if (recipientAddresses.length === 0) {
          console.log('alert_cnh_expiration: Nenhum destinatario com e-mail valido encontrado.')
        } else {
          const plural = finalColabs.length > 1
          const subject = `⚠ Via Sudeste — CNH${plural ? 's' : ''} vencendo em 15 dias (${finalColabs.length} colaborador${plural ? 'es' : ''})`
          const htmlContent = buildEmailTemplate(finalColabs, false)

          const senderAddress = $app.settings().meta.senderAddress || 'no-reply@viasudeste.com'
          const senderName = 'Via Sudeste — Gestão de CNH'

          const mailTo = recipientAddresses.map((addr) => ({ address: addr }))

          const mailMessage = new MailerMessage({
            from: { address: senderAddress, name: senderName },
            to: mailTo,
            subject: subject,
            html: htmlContent,
          })

          $app.newMailClient().send(mailMessage)
          console.log(
            `alert_cnh_expiration: E-mail consolidado de CNH (15 dias) enviado com sucesso para ${recipientAddresses.join(', ')} contendo ${finalColabs.length} colaborador(es).`,
          )

          // Registrar no cnh_email_logs para idempotência
          if (cnhLogsCol) {
            for (const colab of finalColabs) {
              try {
                const logRec = new Record(cnhLogsCol)
                if (colab.id) logRec.set('employee', colab.id)
                logRec.set('matricula', String(colab.re || ''))
                logRec.set('colaborador_nome', String(colab.name || ''))
                logRec.set('validade_cnh', String(colab.validadeKey || ''))
                logRec.set('tipo_aviso', '15_dias')
                logRec.set('recipients', recipientAddresses.join(', '))
                logRec.set('status', 'enviado')
                $app.save(logRec)
              } catch (logErr) {
                console.log('Erro ao gravar cnh_email_logs:', logErr)
              }
            }
          }
        }
      }
    } else {
      console.log(
        'alert_cnh_expiration: Nenhum colaborador no marco de 15 dias hoje. Nenhum e-mail enviado.',
      )
    }
  } catch (err) {
    console.log('alert_cnh_expiration cron erro ignorado:', String((err && err.message) || err))
  }
})

/**
 * Gatilho via hook de criação em cnh_email_logs:
 * Permite que um registro criado com tipo_aviso='teste' dispare imediatamente
 * o e-mail de teste com template real sem precisar aguardar o cron das 06:00 BRT.
 */
onRecordCreate((e) => {
  try {
    const rec = e.record
    const tipo = rec.getString('tipo_aviso')
    if (tipo !== 'teste') {
      return e.next()
    }

    const customDest = rec.getString('recipients') || 'alef.silva@viasudeste.com'
    const targets = customDest
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    console.log(`Disparando envio teste de e-mail CNH solicitado para: ${targets.join(', ')}`)

    const escapeHtml = (str) => {
      if (str === null || str === undefined) return ''
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    }

    const buildEmailTemplate = (colaboradores, isTest) => {
      const qtd = colaboradores.length
      const plural = qtd > 1

      let rowsHtml = ''
      for (let i = 0; i < colaboradores.length; i++) {
        const c = colaboradores[i]
        const bgRow = i % 2 === 0 ? '#ffffff' : '#f9fafb'
        const diasTxt =
          c.diasRestantes !== undefined && c.diasRestantes !== null
            ? ` (~${c.diasRestantes} dias)`
            : ''
        const metaInfo = [c.funcao, c.filial].filter(Boolean).join(' · ')

        rowsHtml += `
          <tr style="background-color: ${bgRow}; border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px 14px; font-size: 14px; color: #111827; font-weight: 600;">
              ${escapeHtml(c.name)}
              ${metaInfo ? `<div style="font-size: 11px; font-weight: 400; color: #6b7280; margin-top: 2px;">${escapeHtml(metaInfo)}</div>` : ''}
            </td>
            <td style="padding: 12px 14px; font-size: 14px; color: #374151; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 600;">
              ${escapeHtml(c.re)}
            </td>
            <td style="padding: 12px 14px; font-size: 14px; color: #b91c1c; font-weight: 700; white-space: nowrap;">
              ${escapeHtml(c.validadeBr)}
              <span style="font-size: 11px; font-weight: 500; color: #dc2626; display: block;">${diasTxt}</span>
            </td>
          </tr>
        `
      }

      const testBanner = isTest
        ? `
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; margin-bottom: 20px;">
            <tr>
              <td style="padding: 12px 16px; font-size: 13px; color: #92400e; font-weight: 600; text-align: center;">
                🧪 E-MAIL DE TESTE DO SISTEMA — Validação do disparo automático e layout institucional
              </td>
            </tr>
          </table>
        `
        : ''

      return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alerta CNH Via Sudeste</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Container Principal -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.04); border: 1px solid #e5e7eb;">
          
          <!-- Cabeçalho Institucional Verde Via Sudeste -->
          <tr>
            <td style="background: linear-gradient(135deg, #15803d 0%, #16a34a 100%); background-color: #16a34a; padding: 26px 28px; text-align: left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #bbf7d0; margin-bottom: 4px;">
                      VIA SUDESTE TRANSPORTES
                    </div>
                    <h1 style="margin: 0; font-size: 21px; line-height: 26px; font-weight: 700; color: #ffffff;">
                      Alerta: CNH${plural ? 's' : ''} vencendo em 15 dias
                    </h1>
                    <div style="font-size: 13px; color: #dcfce7; margin-top: 6px;">
                      Gestão de CNH &middot; Portal Recursos Humanos
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Corpo Principal -->
          <tr>
            <td style="padding: 26px 28px;">
              ${testBanner}

              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 22px; color: #374151;">
                Olá, equipe de Recursos Humanos e Administração,
              </p>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 22px; color: #4b5563;">
                Identificamos <strong>${qtd} colaborador${plural ? 'es' : ''}</strong> cuja Carteira Nacional de Habilitação (CNH) atinge o marco de <strong>15 dias corridos para o vencimento</strong>. Favor verificar com antecedência a regularização ou abertura de processo cadastral.
              </p>

              <!-- Tabela de Colaboradores -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                <thead>
                  <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left;">
                    <th style="padding: 10px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #475569;">
                      Colaborador
                    </th>
                    <th style="padding: 10px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #475569;">
                      RE
                    </th>
                    <th style="padding: 10px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #475569;">
                      Vencimento CNH
                    </th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>

              <!-- Caixa Informativa de Ação -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 4px; margin-bottom: 22px;">
                <tr>
                  <td style="padding: 14px 16px;">
                    <div style="font-size: 13px; line-height: 20px; color: #166534; font-weight: 600; margin-bottom: 2px;">
                      Orientações de regularização:
                    </div>
                    <div style="font-size: 12px; line-height: 18px; color: #15803d;">
                      Acompanhe pelo sistema Gestão de CNH se o colaborador já iniciou o processo de renovação ou entrega da documentação atualizada para evitar bloqueio operacional no tráfego.
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 13px; line-height: 20px; color: #6b7280;">
                Este e-mail é gerado de forma automática e consolidada a cada dia civil pelo monitor de CNHs.
              </p>
            </td>
          </tr>

          <!-- Rodapé Institucional -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 28px; border-top: 1px solid #e5e7eb; text-align: center;">
              <div style="font-size: 12px; font-weight: 600; color: #4b5563; margin-bottom: 4px;">
                Via Sudeste Transportes Urbanos Ltda.
              </div>
              <div style="font-size: 11px; color: #9ca3af; line-height: 16px;">
                Portal RH &middot; Sistema de Gestão de CNH &middot; Mensagem automática, não responda este e-mail.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `
    }

    // Montar 3 colaboradores de exemplo representativos com base no sistema da Via Sudeste
    const exemplos = [
      {
        name: 'CARLOS ALBERTO DE SOUZA',
        re: '003210',
        validadeBr: '05/11/2026',
        validadeKey: '2026-11-05',
        diasRestantes: 15,
        filial: 'CURSINO',
        funcao: 'Motorista',
      },
      {
        name: 'MARIA APARECIDA DOS SANTOS',
        re: '004521',
        validadeBr: '05/11/2026',
        validadeKey: '2026-11-05',
        diasRestantes: 15,
        filial: 'SAPOPEMBA',
        funcao: 'Motorista',
      },
      {
        name: 'JOSE NILTON DE JESUS GOMES',
        re: '000454',
        validadeBr: '05/11/2026',
        validadeKey: '2026-11-05',
        diasRestantes: 15,
        filial: 'CURSINO',
        funcao: 'Motorista',
      },
    ]

    const subject = `[TESTE] Via Sudeste — CNHs vencendo em 15 dias (3 colaboradores)`
    const htmlContent = buildEmailTemplate(exemplos, true)

    const senderAddress = $app.settings().meta.senderAddress || 'no-reply@viasudeste.com'
    const senderName = 'Via Sudeste — Gestão de CNH'

    const mailTo = targets.map((addr) => ({ address: addr }))

    const mailMessage = new MailerMessage({
      from: { address: senderAddress, name: senderName },
      to: mailTo,
      subject: subject,
      html: htmlContent,
    })

    $app.newMailClient().send(mailMessage)
    console.log(`Envio teste de e-mail CNH concluído com sucesso para ${targets.join(', ')}.`)

    rec.set('status', 'enviado_sucesso')
  } catch (err) {
    console.log('Erro no gatilho de teste de email cnh:', String((err && err.message) || err))
    e.record.set('status', 'falha: ' + String((err && err.message) || err))
  }
  return e.next()
}, 'cnh_email_logs')
