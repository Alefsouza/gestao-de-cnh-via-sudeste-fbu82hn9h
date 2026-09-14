/**
 * Hook disparado antes de criar um item em processo_timeline.
 *
 * Garante que ações exclusivas do Tráfego ("Operador notificado", "Foto Bloqueada", "Impossibilitado de trabalhar")
 * ou qualquer andamento registrado por perfil Tráfego só ocorram em processos do tipo "Atualização".
 * Processos de Mudança de Função, Inclusão, Exclusão e demais tipos NÃO seguem o fluxo do Tráfego.
 *
 * Regras Skip Cloud / PocketBase v0.36:
 * - Toda a lógica vive dentro dos callbacks inline.
 * - Usa $app para operações no banco.
 */

onRecordCreateRequest((e) => {
  const record = e.record
  if (!record) return e.next()

  const etapa = String(record.getString('etapa') || '').trim()
  const acoesTrafego = [
    'Tráfego informado',
    'Operador notificado',
    'Foto Bloqueada',
    'Impossibilitado de trabalhar',
  ]

  let isAcaoTrafego = false
  for (let i = 0; i < acoesTrafego.length; i++) {
    if (acoesTrafego[i] === etapa) {
      isAcaoTrafego = true
      break
    }
  }

  let isPerfilTrafego = false
  if (e.auth) {
    const role = String(e.auth.getString('role') || '')
      .trim()
      .toLowerCase()
    if (role === 'tráfego' || role === 'trafego') {
      isPerfilTrafego = true
    }
  }

  // Se a ação for típica do Tráfego OU o usuário autenticado for do Tráfego,
  // valida se o processo vinculado é exclusivamente do tipo "Atualização"
  if (isAcaoTrafego || isPerfilTrafego) {
    const processoId = String(record.getString('processo') || '').trim()
    if (processoId) {
      try {
        const proc = $app.findFirstRecordByData('processos_cadastrais', 'id', processoId)
        if (proc) {
          const tipoProc = String(proc.getString('processo') || '').trim()
          if (tipoProc !== 'Atualização') {
            throw new BadRequestError(
              'Acesso negado: o perfil Tráfego valida exclusivamente processos do tipo "Atualização". Processos de ' +
                (tipoProc || 'outro tipo') +
                ' não seguem o fluxo do Tráfego.',
            )
          }
        }
      } catch (findErr) {
        if (findErr && findErr.status === 400) {
          throw findErr
        }
        if (findErr && String(findErr.message || '').indexOf('Acesso negado') !== -1) {
          throw findErr
        }
      }
    }
  }

  return e.next()
}, 'processo_timeline')
