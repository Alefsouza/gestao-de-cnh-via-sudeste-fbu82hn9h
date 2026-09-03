// Empresa padrão "VIA SUDESTE" na collection `employees`.
//
// A view externa VW_CONTROLE_CNH (secret `VW_CONTROLE_CNH`) NÃO envia a
// empresa, então todos os registros gravados pelo sync ficavam com `company`
// vazio. Decisão de negócio: a empresa é SEMPRE "VIA SUDESTE".
//
// Este migration:
// 1. Backfill: preenche os registros existentes com `company` vazio/null.
// 2. Default no banco: tenta aplicar DEFAULT 'VIA SUDESTE' à coluna `company`
//    (ALTER COLUMN ... SET DEFAULT, SQLite >= 3.35). Se a build do SQLite do
//    backend não suportar, o default fica garantido na camada de aplicação:
//    o mapeamento do sync (sync-employees-lib.js e cópias embutidas) grava o
//    valor fixo e o hook `employee-company-default.js` preenche qualquer
//    criação por fora do sync.
//
// O migration é idempotente: o backfill só toca linhas vazias/null.

migrate(
  (app) => {
    // 1. Backfill dos registros existentes sem empresa
    app
      .db()
      .newQuery(
        "UPDATE employees SET company = {:company} WHERE company IS NULL OR TRIM(company) = ''",
      )
      .bind({ company: 'VIA SUDESTE' })
      .execute()
    console.log('migration 0009: backfill company = "VIA SUDESTE" aplicado')

    // 2. Default da coluna (best-effort: depende da versão do SQLite)
    try {
      app
        .db()
        .newQuery("ALTER TABLE employees ALTER COLUMN company SET DEFAULT 'VIA SUDESTE'")
        .execute()
      console.log('migration 0009: DEFAULT "VIA SUDESTE" aplicado à coluna company')
    } catch (err) {
      console.log(
        'migration 0009: SQLite sem suporte a ALTER COLUMN SET DEFAULT —',
        'o padrão fica garantido no hook employee-company-default.js e no sync:',
        String((err && err.message) || err),
      )
    }
  },
  (app) => {
    // Reverte o default da coluna, quando ele foi aplicado (best-effort)
    try {
      app.db().newQuery("ALTER TABLE employees ALTER COLUMN company SET DEFAULT ''").execute()
    } catch (_) {}
  },
)
