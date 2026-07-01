import { writeFileSync } from 'node:fs'

const BASE = 'https://pt.cislav.mg.gov.br/api/relatorios/receita'
const year = process.argv[2] ?? '2026'
const monthStart = process.argv[3] ?? '05'
const monthEnd = process.argv[4] ?? monthStart

function municipalityFromHistory(history) {
  const match = history.match(/PM\s+(.+)$/i)
  return match?.[1]?.trim().replace(/\s+/g, ' ') ?? 'NAO_IDENTIFICADO'
}

function isMunicipalTransfer(row) {
  const text = `${row.nome ?? ''} ${row.historico ?? ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  return text.includes('REPASSE FINANCEIRO') && text.includes('PM ')
}

const url = `${BASE}?unidade_gestora=1&exercicio=${year}&mes_inicial=${monthStart}&mes_final=${monthEnd}`
const response = await fetch(url)
if (!response.ok) throw new Error(`HTTP ${response.status} ao consultar ${url}`)
const json = await response.json()
const rows = json.resultado?.receitas ?? []
const transfers = rows.filter(isMunicipalTransfer).map((row) => ({
  data: row.data,
  municipio: municipalityFromHistory(row.historico),
  valor: row.valor,
  categoria: row.nome,
  historico: row.historico,
  fonteDeRecursos: row.fonteDeRecursos,
  idReceita: row.id,
  sourceUrl: url,
}))

const summaryByMunicipality = Object.values(transfers.reduce((acc, row) => {
  acc[row.municipio] ??= { municipio: row.municipio, total: 0, quantidade: 0, datas: [] }
  acc[row.municipio].total += Number(row.valor ?? 0)
  acc[row.municipio].quantidade += 1
  acc[row.municipio].datas.push(row.data)
  return acc
}, {})).sort((a, b) => a.municipio.localeCompare(b.municipio, 'pt-BR'))

const payload = { generatedAt: new Date().toISOString(), sourceUrl: url, period: { year, monthStart, monthEnd }, totalRows: rows.length, transferRows: transfers.length, summaryByMunicipality, transfers }
writeFileSync(`data/cislav-repasses-${year}-${monthStart}-${monthEnd}.json`, JSON.stringify(payload, null, 2))
const csv = ['municipio,data,valor,categoria,historico,fonteDeRecursos,idReceita,sourceUrl', ...transfers.map((row) => [row.municipio, row.data, row.valor, row.categoria, row.historico, row.fonteDeRecursos, row.idReceita, row.sourceUrl].map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))].join('\n')
writeFileSync(`data/cislav-repasses-${year}-${monthStart}-${monthEnd}.csv`, csv)
console.log(JSON.stringify({ sourceUrl: url, totalRows: rows.length, transferRows: transfers.length, municipalities: summaryByMunicipality }, null, 2))
