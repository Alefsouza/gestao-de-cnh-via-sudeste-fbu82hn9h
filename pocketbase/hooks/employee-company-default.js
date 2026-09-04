/**
 * Hook disparado após criação ou atualização em `employees`.
 *
 * Garante que a empresa seja sempre "VIA SUDESTE":
 * - Em onRecordCreate: se company estiver vazio, preenche com "VIA SUDESTE".
 * - Em onRecordUpdate: se company estiver vazio, preenche com "VIA SUDESTE".
 *
 * Como a view externa (VW_CONTROLE_CNH) não envia empresa, a regra de negócio do projeto
 * define que a empresa é SEMPRE "VIA SUDESTE".
 */

onRecordCreate((e) => {
  const company = String(e.record.getString('company') ?? '').trim()
  if (!company) {
    e.record.set('company', 'VIA SUDESTE')
  }
  e.next()
}, 'employees')

onRecordUpdate((e) => {
  const company = String(e.record.getString('company') ?? '').trim()
  if (!company) {
    e.record.set('company', 'VIA SUDESTE')
  }
  e.next()
}, 'employees')
