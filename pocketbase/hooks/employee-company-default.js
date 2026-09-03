/**
 * Empresa padrão "VIA SUDESTE": qualquer colaborador criado em `employees`
 * por fora do sync (API, seed manual, etc.) recebe `company = "VIA SUDESTE"`
 * quando o campo vier vazio — a view externa VW_CONTROLE_CNH não envia
 * empresa, e a decisão de negócio é que a empresa é sempre a Via Sudeste.
 *
 * Convenções Skip Cloud: o callback roda em outra VM e não enxerga
 * identificadores de topo de arquivo — toda a lógica vive no callback.
 */

onRecordCreate((e) => {
  const company = String(e.record.getString('company') ?? '').trim()
  if (!company) {
    e.record.set('company', 'VIA SUDESTE')
  }
  e.next()
}, 'employees')
