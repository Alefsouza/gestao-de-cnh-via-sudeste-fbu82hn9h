/**
 * Modelos de CARTAS oficiais enviadas pela Via Sudeste à SPTrans.
 *
 * Cada modelo gera um documento HTML completo em formato A4 (pronto para
 * impressão / "Salvar em PDF" pelo navegador), reproduzindo fielmente os
 * documentos originais fornecidos pelo usuário (PRAT, ATUALIZAÇÃO e
 * EXCLUSÃO): timbre completo com endereço da Filial 03, data/numeração,
 * destinatário, assunto, corpo, título da tabela e assinatura.
 *
 * Arquitetura aberta: para adicionar um novo modelo, basta acrescentar uma
 * entrada em CARTA_MODELOS e a função geradora correspondente aqui — o fluxo
 * de "Gerar Carta" (GerarCartaModal) passa a exibi-lo automaticamente.
 */

export type CartaModeloId =
  | 'inss_retorno'
  | 'inss_afastados'
  | 'prat'
  | 'atualizacao_cadastral'
  | 'exclusao_condubus'

export interface CartaModeloDef {
  id: CartaModeloId
  nome: string
  descricao: string
  /** Quantos colaboradores a carta aceita por vez. */
  multiplicidade: 'multi' | 'single'
}

export const CARTA_MODELOS: CartaModeloDef[] = [
  {
    id: 'inss_retorno',
    nome: 'Retorno de Afastamento pelo INSS',
    descricao:
      'Comunica o retorno do colaborador após afastamento previdenciário. Tabela: Reg., Função, Nome, CPF e GRUPO.',
    multiplicidade: 'multi',
  },
  {
    id: 'inss_afastados',
    nome: 'Afastados pelo INSS',
    descricao:
      'Comunica o afastamento previdenciário de colaboradores. Tabela: Função, Nome, RE, Data de Afastamento e CPF.',
    multiplicidade: 'multi',
  },
  {
    id: 'prat',
    nome: 'PRAT — Acidente de Trânsito',
    descricao:
      'Comunicação formal ao Coordenador CCI de acidente de trânsito (Artigo 36-A da Portaria 168/07-SMTGAB), com pedido de desbloqueio do condutor.',
    multiplicidade: 'single',
  },
  {
    id: 'atualizacao_cadastral',
    nome: 'Atualização Cadastral',
    descricao:
      'Comunica à SPTrans (A/C Cadastro de Frota) a atualização cadastral de operadores. Tabela: Reg., Função, Nome e CPF. Usada também para Inclusão e Mudança de Função.',
    multiplicidade: 'multi',
  },
  {
    id: 'exclusao_condubus',
    nome: 'Exclusão Cadastral — CONDUBUS',
    descricao:
      'Comunica à SPTrans (A/C Cadastro de Frota) a exclusão cadastral de operadores no sistema CONDUBUS. Tabela: Função, Nome e C.P.F.',
    multiplicidade: 'multi',
  },
]

export function getCartaModelo(id: CartaModeloId): CartaModeloDef {
  return CARTA_MODELOS.find((m) => m.id === id) ?? CARTA_MODELOS[0]
}

/** Rótulo do tipo de carta gravado na coleção `cartas`. */
export function labelTipoCartaParaModelo(id: CartaModeloId): string {
  switch (id) {
    case 'inss_retorno':
      return 'Retorno INSS'
    case 'inss_afastados':
      return 'Afastados INSS'
    case 'prat':
      return 'PRAT'
    case 'atualizacao_cadastral':
      return 'Atualização'
    case 'exclusao_condubus':
      return 'Exclusão'
    default:
      return id
  }
}

export interface CartaColaboradorDados {
  /** id do employee no banco, quando a linha veio do cadastro. */
  employeeId?: string
  nome: string
  /** Reg. (Retorno/Atualização) ou RE (Afastados). */
  registro: string
  funcao: string
  cpf: string
  /** Data de Afastamento (modelo "Afastados pelo INSS"). */
  dataAfastamento?: string
  /** GRUPO (modelo "Retorno de INSS") — geralmente a filial/garagem. */
  grupo?: string
}

export interface CartaGeradaDados {
  modelo: CartaModeloId
  /** Número da carta, ex.: "289/26", "RH 276/22" ou "333/26" (texto livre). */
  numeroCarta: string
  colaboradores: CartaColaboradorDados[]
  /** Data de retorno ao trabalho (modelo Retorno). */
  dataRetorno?: string
  /** Prefixo do veículo (modelo PRAT). */
  prefixoVeiculo?: string
  /** Data do sinistro (modelo PRAT). */
  dataSinistro?: string
  /** Nome de quem emite — preenchido pelo usuário logado. */
  emitente?: string
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

/** Data curta pt-BR: DD/MM/AAAA a partir de ISO ou texto. */
function toBrDate(value?: string | null): string {
  if (!value) return ''
  const raw = String(value).trim()
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

/** "São Paulo, 5 de fevereiro de 2026." (como no original, sem zero à esquerda). */
function dataExtensoHoje(): string {
  const d = new Date()
  return `São Paulo, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}.`
}

function esc(value?: string | null): string {
  const s = String(value ?? '')
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Normaliza o CPF para exibição (000.000.000-00) sem depender de lib externa. */
function formatarCpf(value?: string | null): string {
  const cleaned = String(value ?? '').replace(/\D/g, '')
  if (cleaned.length === 11) {
    return cleaned.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  }
  return String(value ?? '').trim()
}

/* ------------------------------------------------------------------ */
/* Base do documento (timbre, data, destinatário, assinatura, print)   */
/* ------------------------------------------------------------------ */

const ESTILO_BASE = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f1f5f1; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a2418; }
  .page {
    width: 210mm; min-height: 297mm; margin: 0 auto;
    padding: 14mm 20mm 20mm 20mm; background: #ffffff;
  }
  @media print {
    html, body { background: #ffffff; }
    .page { width: auto; min-height: auto; margin: 0; box-shadow: none; }
    .no-print { display: none !important; }
  }
  .timbre { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .marca-nome { font-weight: 800; font-size: 20px; color: #1e7d3c; letter-spacing: 1px; }
  .marca-sub { font-size: 9px; color: #5b6b58; letter-spacing: 3px; text-transform: uppercase; margin-top: 2px; }
  .timbre-end { font-size: 9px; color: #5b6b58; text-align: right; line-height: 1.5; }
  .timbre-linha { border: 0; border-top: 2px solid #1e7d3c; margin: 8px 0 0 0; }
  .numero-carta { margin-top: 14px; font-size: 12px; font-weight: 700; text-align: right; }
  .data-doc { margin-top: 4px; font-size: 12px; text-align: right; color: #1a2418; }
  .data-doc .num { font-weight: 700; }
  .destinatario { margin-top: 26px; font-size: 12px; line-height: 1.5; }
  .assunto { margin-top: 16px; font-size: 12px; }
  .corpo { margin-top: 18px; font-size: 12px; line-height: 1.7; text-align: justify; }
  .corpo p { margin: 0 0 10px 0; }
  .tabela-titulo { font-weight: 700; font-size: 11px; text-align: center; letter-spacing: 0.3px; margin: 14px 0 6px 0; }
  table.dados { width: 100%; border-collapse: collapse; margin: 8px 0 14px 0; font-size: 10.5px; }
  table.dados th, table.dados td { border: 1px solid #4b5563; padding: 5px 7px; text-align: left; vertical-align: top; }
  table.dados th { background: #eef4ee; font-weight: 700; }
  .fecho { margin-top: 26px; font-size: 12px; line-height: 1.6; }
  .assinatura { margin-top: 42px; width: 78mm; }
  .assinatura-linha { border-top: 1px solid #1a2418; }
  .assinatura-nome { font-weight: 700; font-size: 12px; margin-top: 4px; }
  .assinatura-empresa { font-size: 10.5px; color: #5b6b58; }
  .rodape { margin-top: 34px; border-top: 1px solid #d5ded5; padding-top: 6px; font-size: 8px; color: #8a968a; text-align: center; line-height: 1.5; }
`

/** Bloco de endereço do timbre — igual ao original (Filial 03). */
const ENDERECO_TIMBRE = [
  'Avenida do Cursino, nº5797 / Vila Moraes',
  'São Paulo • SP',
  'CEP 04169-000 • Filial 03',
  'Tel (11) 2133 5665',
  'www.viasudeste.com',
].join('<br />')

/** Timbre completo do original: nome da empresa + bloco de endereço. */
function timbre(): string {
  return `
  <div class="timbre">
    <div class="marca">
      <div>
        <div class="marca-nome">VIA SUDESTE</div>
        <div class="marca-sub">Transporte Urbano</div>
      </div>
    </div>
    <div class="timbre-end">${ENDERECO_TIMBRE}</div>
  </div>
  <hr class="timbre-linha" />`
}

/**
 * Data e numeração na MESMA linha, como nos originais de RH:
 * "São Paulo, 5 de novembro de 2026. RH 332/26".
 */
function dataComNumeroLinha(numeroCarta: string, prefixo: string): string {
  const numero = `${prefixoNumero(numeroCarta, prefixo)}${(numeroCarta || '').trim()}`
  return `
  <div class="data-doc">${esc(dataExtensoHoje())} <span class="num">${esc(numero)}</span></div>`
}

function destinatarioSptrans(ac: string): string {
  return `
  <div class="destinatario">
    À<br />
    <strong>São Paulo Transporte S/A – SPTRANS</strong><br />
    A/C: ${esc(ac)}
  </div>`
}

function assinatura(): string {
  return `
  <div class="fecho">
    <p>Atenciosamente,</p>
    <div class="assinatura">
      <div class="assinatura-linha"></div>
      <div class="assinatura-nome">Leandro Pires Ferraz</div>
      <div class="assinatura-empresa">Via Sudeste Transportes</div>
    </div>
  </div>
  <div class="rodape">Avenida do Cursino, nº5797 / Vila Moraes • São Paulo • SP • CEP 04169-000 • Filial 03 • Tel (11) 2133 5665 • www.viasudeste.com</div>`
}

function documentoHtml(conteudo: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Carta Via Sudeste</title>
<style>${ESTILO_BASE}</style>
</head>
<body>
  <div class="page">${conteudo}</div>
</body>
</html>`
}

/* ------------------------------------------------------------------ */
/* Modelo 1 — Retorno de afastamento pelo INSS                         */
/* ------------------------------------------------------------------ */

function corpoInssRetorno(dados: CartaGeradaDados): string {
  const dataRetorno = toBrDate(dados.dataRetorno)
  const linhas = dados.colaboradores
    .map(
      (c) => `
      <tr>
        <td style="width:14%">${esc(c.registro)}</td>
        <td style="width:20%">${esc(c.funcao)}</td>
        <td style="width:32%">${esc(c.nome)}</td>
        <td style="width:20%">${esc(formatarCpf(c.cpf))}</td>
        <td style="width:14%">${esc(c.grupo)}</td>
      </tr>`,
    )
    .join('')

  return `
  ${timbre()}
  <div class="numero-carta">${esc((dados.numeroCarta || '').trim())}</div>
  <div class="data-doc">${esc(dataExtensoHoje())}</div>
  <div class="destinatario">
    À<br />
    <strong>São Paulo Transporte S/A – SPTRANS</strong>
  </div>
  <div class="corpo">
    <p>Prezados Senhores,</p>
    <p>
      Vimos pela presente comunicar a V.Sas. que o${
        dados.colaboradores.length > 1 ? 's' : ''
      } colaborador${dados.colaboradores.length > 1 ? 'es' : ''} abaixo relacionado${
        dados.colaboradores.length > 1 ? 's' : ''
      }, afastado${dados.colaboradores.length > 1 ? 's' : ''} junto ao INSS, retornou${
        dados.colaboradores.length > 1 ? 'ram' : ''
      } às suas atividades de trabalho no dia <strong>${esc(dataRetorno || '____/____/______')}</strong>,
      encontrando-se apto${
        dados.colaboradores.length > 1 ? 's' : ''
      } ao pleno exercício de suas funções.
    </p>
    <table class="dados">
      <thead>
        <tr>
          <th>Reg.</th>
          <th>Função</th>
          <th>Nome</th>
          <th>CPF</th>
          <th>GRUPO</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
    <p>Colocamo-nos à disposição para quaisquer esclarecimentos adicionais que se façam necessários.</p>
  </div>
  ${assinatura()}`
}

/* ------------------------------------------------------------------ */
/* Modelo 2 — Afastados pelo INSS (vários colaboradores)               */
/* ------------------------------------------------------------------ */

function corpoInssAfastados(dados: CartaGeradaDados): string {
  const linhas = dados.colaboradores
    .map(
      (c) => `
      <tr>
        <td style="width:22%">${esc(c.funcao)}</td>
        <td style="width:28%">${esc(c.nome)}</td>
        <td style="width:12%">${esc(c.registro)}</td>
        <td style="width:18%">${esc(toBrDate(c.dataAfastamento))}</td>
        <td style="width:20%">${esc(formatarCpf(c.cpf))}</td>
      </tr>`,
    )
    .join('')

  return `
  ${timbre()}
  <div class="numero-carta">${esc((dados.numeroCarta || '').trim())}</div>
  <div class="data-doc">${esc(dataExtensoHoje())}</div>
  <div class="destinatario">
    À<br />
    <strong>São Paulo Transporte S/A – SPTRANS</strong>
  </div>
  <div class="corpo">
    <p>Prezados Senhores,</p>
    <p>
      Vimos pela presente comunicar a V.Sas. o afastamento previdenciário junto ao INSS d${
        dados.colaboradores.length > 1 ? 'os' : 'o'
      } colaborador${dados.colaboradores.length > 1 ? 'es' : ''} abaixo relacionado${
        dados.colaboradores.length > 1 ? 's' : ''
      }, a partir das datas indicadas na tabela a seguir.
    </p>
    <table class="dados">
      <thead>
        <tr>
          <th>Função</th>
          <th>Nome</th>
          <th>RE</th>
          <th>Data de Afastamento</th>
          <th>CPF</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
    <p>Colocamo-nos à disposição para quaisquer esclarecimentos adicionais que se façam necessários.</p>
  </div>
  ${assinatura()}`
}

/* ------------------------------------------------------------------ */
/* Modelo 3 — PRAT (acidente de trânsito)                              */
/* Estrutura própria do original: destinatário nominal (Coordenador    */
/* CCI), Assunto, saudação, Artigo 36-A da Portaria 168/07-SMTGAB,     */
/* parágrafo do desbloqueio do condutor e fecho de cumprimento.        */
/* ------------------------------------------------------------------ */

function corpoPrat(dados: CartaGeradaDados): string {
  const c = dados.colaboradores[0] ?? {
    nome: '',
    cpf: '',
    registro: '',
    funcao: '',
  }
  const dataSinistro = toBrDate(dados.dataSinistro)
  const prefixo = (dados.prefixoVeiculo ?? '').trim()

  return `
  ${timbre()}
  <div class="numero-carta">Carta nº ${esc((dados.numeroCarta || '').trim())}</div>
  <div class="data-doc">${esc(dataExtensoHoje())}</div>
  <div class="destinatario">
    À<br />
    <strong>Sr. Vicente Barella</strong><br />
    Coordenador CCI – SPTrans
  </div>
  <div class="assunto"><strong>Assunto:</strong> Acidente de trânsito</div>
  <div class="corpo">
    <p>Prezado Senhor,</p>
    <p>
      Em conformidade com o Artigo 36-A da Portaria 168/07-SMTGAB, informamos a V.Sas. que no dia
      <strong>${esc(dataSinistro || '____/____/______')}</strong>, o condutor
      <strong>${esc(c.nome)}</strong>, portador do CPF nº <strong>${esc(formatarCpf(c.cpf))}</strong>,
      registro ${esc(c.registro || '—')}, função ${esc(c.funcao || '—')},
      envolvido em ocorrência de sinistro com o veículo de prefixo
      <strong>${esc(prefixo || '______')}</strong>, encontra-se afastado de suas atividades.
    </p>
    <p>
      Conforme determinação da Portaria em supra, encaminhamos em anexo os documentos exigidos
      referentes ao condutor acima mencionado (laudo de exame psicotécnico, certificado de direção
      defensiva e atestado de sanidade física e mental) e foi solicitado o desbloqueio do condutor
      junto ao sistema, para que o mesmo retome suas atividades operacionais.
    </p>
    <p>
      Aproveitamos a oportunidade para cumprimentá-lo e nos colocamos à disposição para quaisquer
      esclarecimentos que se façam necessários.
    </p>
  </div>
  ${assinatura()}`
}

/* ------------------------------------------------------------------ */
/* Modelo 4 — Atualização Cadastral (RH 332/26)                        */
/* Também serve de base para Inclusão e Mudança de Função              */
/* (mesmo formato de tabela de operadores).                            */
/* ------------------------------------------------------------------ */

function corpoAtualizacaoCadastral(dados: CartaGeradaDados): string {
  const linhas = dados.colaboradores
    .map(
      (c) => `
      <tr>
        <td style="width:14%">${esc(c.registro)}</td>
        <td style="width:22%">${esc(c.funcao)}</td>
        <td style="width:40%">${esc(c.nome)}</td>
        <td style="width:24%">${esc(formatarCpf(c.cpf))}</td>
      </tr>`,
    )
    .join('')

  return `
  ${timbre()}
  ${dataComNumeroLinha(dados.numeroCarta, 'RH ')}
  ${destinatarioSptrans('Cadastro de Frota')}
  <div class="assunto"><strong>Assunto:</strong> Atualização cadastral de operadores</div>
  <div class="corpo">
    <p>Seguem os dados dos operadores para atualização cadastral.</p>
    <p class="tabela-titulo">DADOS PARA ATUALIZAÇÃO DE MOTORISTAS, COBRADORES E FISCAIS</p>
    <table class="dados">
      <thead>
        <tr>
          <th>Reg.</th>
          <th>Função</th>
          <th>Nome</th>
          <th>CPF</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
    <p>Colocamo-nos à disposição para quaisquer esclarecimentos adicionais que se façam necessários.</p>
  </div>
  ${assinatura()}`
}

/* ------------------------------------------------------------------ */
/* Modelo 5 — Exclusão Cadastral CONDUBUS (RH 304/26)                  */
/* ------------------------------------------------------------------ */

function corpoExclusaoCondubus(dados: CartaGeradaDados): string {
  const linhas = dados.colaboradores
    .map(
      (c) => `
      <tr>
        <td style="width:26%">${esc(c.funcao)}</td>
        <td style="width:46%">${esc(c.nome)}</td>
        <td style="width:28%">${esc(formatarCpf(c.cpf))}</td>
      </tr>`,
    )
    .join('')

  return `
  ${timbre()}
  ${dataComNumeroLinha(dados.numeroCarta, 'RH ')}
  ${destinatarioSptrans('Cadastro de Frota')}
  <div class="assunto"><strong>Assunto:</strong> Exclusão cadastral de operadores</div>
  <div class="corpo">
    <p>Seguem os dados dos operadores para exclusão cadastral.</p>
    <p class="tabela-titulo">DADOS PARA EXCLUSÃO DE MOTORISTAS, COBRADORES E FISCAIS</p>
    <table class="dados">
      <thead>
        <tr>
          <th>Função</th>
          <th>Nome</th>
          <th>C.P.F.</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
    <p>Colocamo-nos à disposição para quaisquer esclarecimentos adicionais que se façam necessários.</p>
  </div>
  ${assinatura()}`
}

/* ------------------------------------------------------------------ */
/* Gerador principal                                                   */
/* ------------------------------------------------------------------ */

/** Prefixo do número ("RH "), evitando duplicar quando já vem na numeração. */
function prefixoNumero(numeroCarta: string, prefixo: string): string {
  return /^RH\s?\d/i.test((numeroCarta || '').trim()) ? '' : prefixo
}

/** Gera o documento HTML completo (A4, pronto para imprimir/salvar em PDF). */
export function gerarCartaHtml(dados: CartaGeradaDados): string {
  switch (dados.modelo) {
    case 'inss_retorno':
      return documentoHtml(corpoInssRetorno(dados))
    case 'inss_afastados':
      return documentoHtml(corpoInssAfastados(dados))
    case 'prat':
      return documentoHtml(corpoPrat(dados))
    case 'atualizacao_cadastral':
      return documentoHtml(corpoAtualizacaoCadastral(dados))
    case 'exclusao_condubus':
      return documentoHtml(corpoExclusaoCondubus(dados))
    default:
      return documentoHtml(corpoInssRetorno(dados))
  }
}

/** Nome de arquivo sugerido para o PDF salvo. */
export function nomeArquivoCarta(dados: CartaGeradaDados): string {
  const slug = dados.numeroCarta.replace(/[^\w/-]+/g, '').replace(/\//g, '-') || 'carta'
  return `carta-${labelTipoCartaParaModelo(dados.modelo).toLowerCase().replace(/\s+/g, '-')}-${slug}`
}
