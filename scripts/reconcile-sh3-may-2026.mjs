import { readFileSync, writeFileSync } from 'node:fs'

const year = '2026'
const month = '05'
const cislavData = JSON.parse(readFileSync(`data/cislav-repasses-${year}-${month}-${month}.json`, 'utf8'))
const hosts = {
  CARRANCAS: 'https://ptn.carrancas.mg.gov.br',
  IBITURUNA: 'https://pt.ibituruna.mg.gov.br',
  'IJACÍ': 'https://transparencia.ijaci.mg.gov.br',
  'INGAÍ': 'https://pt.ingai.mg.gov.br',
  ITUMIRIM: 'https://pt.itumirim.mg.gov.br',
  LUMINÁRIAS: 'https://pt.luminarias.mg.gov.br',
  NAZARENO: 'https://pt.nazareno.mg.gov.br',
}
const creditorQueries = [
  'CISLAV',
  'CONSORCIO INTERMUNICIPAL DE SAUDE',
  'CONSORCIO INTERMUNICIPAL DE SAUDE DOS MUNICIP',
  'CONSÓRCIO INTERMUNICIPAL DE SAÚDE',
]

function normalizeName(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
}
function endOfMonth(year, month) { return `${year}-${month}-31` }
function sum(rows) { return rows.reduce((total, row) => total + Number(row.valor ?? row.dadosPrincipais?.valor ?? 0), 0) }

const report = []
for (const [municipio, host] of Object.entries(hosts)) {
  const attempts = []
  const byEmpenho = new Map()
  let error = ''
  for (const creditor of creditorQueries) {
    const url = `${host}/api/relatorios/despesa?unidade_gestora=1&exercicio=${year}&data_de_pagamento_inicial=${year}-${month}-01&data_de_pagamento_final=${endOfMonth(year, month)}&credor=${encodeURIComponent(creditor)}`
    try {
      const response = await fetch(url)
      const json = await response.json()
      const rows = json.resultado?.despesas ?? []
      attempts.push({ creditor, url, status: response.status, count: rows.length })
      for (const row of rows) {
        const key = row.dadosPrincipais?.empenho ?? `${municipio}-${row.dadosPrincipais?.valor}-${row.dadosPrincipais?.dataDePagamento}-${byEmpenho.size}`
        byEmpenho.set(key, row)
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      attempts.push({ creditor, url, status: 'erro', count: 0, error })
    }
  }
  const municipalRows = [...byEmpenho.values()]
  const cislavRows = cislavData.transfers.filter((row) => normalizeName(row.municipio) === normalizeName(municipio))
  const cislavTotal = sum(cislavRows)
  const municipalTotal = municipalRows.reduce((total, row) => total + Number(row.dadosPrincipais?.valor ?? 0), 0)
  const cislavDates = [...new Set(cislavRows.map((row) => row.data))].sort()
  const municipalDates = [...new Set(municipalRows.map((row) => row.dadosPrincipais?.dataDePagamento).filter(Boolean))].sort()
  const notasFiscais = municipalRows.flatMap((row) => (row.notasFiscais ?? []).map((nf) => ({
    municipio,
    empenho: row.dadosPrincipais?.empenho,
    valor: row.dadosPrincipais?.valor,
    pagamento: row.dadosPrincipais?.dataDePagamento,
    notaFiscal: nf.notaFiscal,
    serie: nf.serie,
    emissao: nf.emissao,
    vencimento: nf.vencimento,
  })))
  report.push({
    municipio,
    host,
    attempts,
    error,
    cislav: { total: Number(cislavTotal.toFixed(2)), quantidade: cislavRows.length, datas: cislavDates, rows: cislavRows },
    prefeitura: { total: Number(municipalTotal.toFixed(2)), quantidade: municipalRows.length, datas: municipalDates, notasFiscais, rows: municipalRows.map((row) => ({ dadosPrincipais: row.dadosPrincipais, notasFiscais: row.notasFiscais ?? [] })) },
    diferenca: Number((municipalTotal - cislavTotal).toFixed(2)),
    status: error ? 'erro_api_municipal' : Math.abs(municipalTotal - cislavTotal) < 0.01 ? 'conciliado_por_total' : 'divergente_por_total',
  })
}

writeFileSync(`data/conciliacao-sh3-${year}-${month}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2))
console.log(JSON.stringify(report.map(({ municipio, status, cislav, prefeitura, diferenca }) => ({ municipio, status, cislavTotal: cislav.total, prefeituraTotal: prefeitura.total, diferenca, cislavDatas: cislav.datas, prefeituraDatas: prefeitura.datas, notasFiscais: prefeitura.notasFiscais })), null, 2))
