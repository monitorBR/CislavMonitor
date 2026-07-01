import { writeFileSync } from 'node:fs'

const cislavReceitaUrl = 'https://pt.cislav.mg.gov.br/api/relatorios/receita'
const years = [2024, 2025, 2026]
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

async function fetchJson(url, timeoutMs = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    const json = await response.json()
    return { response, json }
  } finally {
    clearTimeout(timer)
  }
}

function municipalityFromHistory(history = '') {
  const match = history.match(/PM\s+(.+)$/i)
  return match?.[1]?.trim().replace(/^DE\s+/i, '').replace(/\s+/g, ' ') ?? 'NAO_IDENTIFICADO'
}
function normalizeName(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
}
function slug(name) {
  return normalizeName(name).toLowerCase().replace(/ç/g, 'c').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
function isMunicipalTransfer(row) {
  const text = `${row.nome ?? ''} ${row.historico ?? ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  return text.includes('REPASSE FINANCEIRO') && text.includes('PM ')
}
function kindFromText(text = '') {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  if (normalized.includes('RATEIO') || normalized.includes('RAEIO')) return 'rateio'
  return 'assistencial'
}
function endOfMonth(year, month) {
  return new Date(year, month, 0).toISOString().slice(0, 10)
}
function monthKey(date) {
  return String(date).slice(0, 7)
}
function addSummary(summary, cityName, month, side, kind, value, paidAt, deadline, extra = {}) {
  const cityId = slug(cityName)
  summary[cityId] ??= { municipalityId: cityId, municipality: cityName, months: {} }
  const entry = summary[cityId].months[month] ??= {
    month,
    cislavTotal: 0,
    municipalTotal: 0,
    rateioTotal: 0,
    assistentialTotal: 0,
    rateioDelayDays: 0,
    assistentialDelayDays: 0,
    rateioRows: 0,
    assistentialRows: 0,
    nfs: [],
    sourceStatus: 'cislav_apenas',
  }
  if (side === 'cislav') entry.cislavTotal += value
  if (side === 'municipal') entry.municipalTotal += value
  if (kind === 'rateio') {
    entry.rateioTotal += value
    entry.rateioRows += side === 'cislav' ? 1 : 0
    if (paidAt && deadline && paidAt > deadline) entry.rateioDelayDays += Math.ceil((new Date(`${paidAt}T00:00:00`) - new Date(`${deadline}T00:00:00`)) / 86400000)
  } else {
    entry.assistentialTotal += value
    entry.assistentialRows += side === 'cislav' ? 1 : 0
    if (paidAt && deadline && paidAt > deadline) entry.assistentialDelayDays += Math.ceil((new Date(`${paidAt}T00:00:00`) - new Date(`${deadline}T00:00:00`)) / 86400000)
  }
  if (extra.nfs?.length) entry.nfs.push(...extra.nfs)
}

const cislavRows = []
const summary = {}

for (const year of years) {
  const url = `${cislavReceitaUrl}?unidade_gestora=1&exercicio=${year}&mes_inicial=01&mes_final=12`
  const { response, json } = await fetchJson(url, 60000)
  if (!response.ok) throw new Error(`Erro CISLAV ${year}: HTTP ${response.status}`)
  const rows = (json.resultado?.receitas ?? []).filter(isMunicipalTransfer).map((row) => ({
    data: row.data,
    month: monthKey(row.data),
    municipio: municipalityFromHistory(row.historico),
    valor: Number(row.valor ?? 0),
    kind: kindFromText(row.historico),
    categoria: row.nome,
    historico: row.historico,
    fonteDeRecursos: row.fonteDeRecursos,
    idReceita: row.id,
    sourceUrl: url,
  }))
  cislavRows.push(...rows)
  for (const row of rows) addSummary(summary, row.municipio, row.month, 'cislav', row.kind, row.valor, row.data, `${row.month}-${String(new Date(Number(row.month.slice(0, 4)), Number(row.month.slice(5, 7)), 0).getDate()).padStart(2, '0')}`)
}

async function fetchMunicipalYear(municipio, host, year) {
    const byEmpenho = new Map()
    const attempts = await Promise.all(creditorQueries.map(async (creditor) => {
      const url = `${host}/api/relatorios/despesa?unidade_gestora=1&exercicio=${year}&data_de_pagamento_inicial=${year}-01-01&data_de_pagamento_final=${endOfMonth(year, 12)}&credor=${encodeURIComponent(creditor)}`
      try {
        const { response, json } = await fetchJson(url, 8000)
        const rows = json.resultado?.despesas ?? []
        for (const row of rows) {
          const key = row.dadosPrincipais?.empenho ?? `${municipio}-${row.dadosPrincipais?.valor}-${row.dadosPrincipais?.dataDePagamento}-${byEmpenho.size}`
          byEmpenho.set(key, row)
        }
        return { creditor, url, status: response.status, count: rows.length }
      } catch (error) {
        return { creditor, url, status: 'erro', count: 0, error: error instanceof Error ? error.message : String(error) }
      }
    }))
    const rows = [...byEmpenho.values()]
    for (const row of rows) {
      const dp = row.dadosPrincipais ?? {}
      const paidAt = dp.dataDePagamento
      if (!paidAt) continue
      const month = monthKey(paidAt)
      const kind = kindFromText(`${dp.categoriaEconomica ?? ''} ${dp.historico ?? ''}`)
      const nfs = (row.notasFiscais ?? []).map((nf) => ({
        municipio,
        empenho: dp.empenho,
        valor: Number(dp.valor ?? 0),
        pagamento: paidAt,
        notaFiscal: nf.notaFiscal,
        serie: nf.serie,
        emissao: nf.emissao,
        vencimento: nf.vencimento,
      }))
      const deadline = nfs.find((nf) => nf.vencimento)?.vencimento ?? `${month}-${String(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()).padStart(2, '0')}`
      addSummary(summary, municipio, month, 'municipal', kind, Number(dp.valor ?? 0), paidAt, deadline, { nfs })
    }
    return { municipio, host, year, attempts, rows: rows.length }
}

const municipalReports = await Promise.all(
  Object.entries(hosts).flatMap(([municipio, host]) => years.map((year) => fetchMunicipalYear(municipio, host, year)))
)

for (const city of Object.values(summary)) {
  for (const month of Object.values(city.months)) {
    month.cislavTotal = Number(month.cislavTotal.toFixed(2))
    month.municipalTotal = Number(month.municipalTotal.toFixed(2))
    month.rateioTotal = Number(month.rateioTotal.toFixed(2))
    month.assistentialTotal = Number(month.assistentialTotal.toFixed(2))
    month.difference = Number((month.municipalTotal - month.cislavTotal).toFixed(2))
    month.sourceStatus = month.municipalTotal ? (Math.abs(month.difference) < 0.01 ? 'conciliado' : 'divergente') : 'cislav_apenas'
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  period: { start: '2024-01', end: '2026-12' },
  cislavRows,
  municipalReports,
  summary: Object.values(summary).sort((a, b) => a.municipality.localeCompare(b.municipality, 'pt-BR')),
}

writeFileSync('data/historico-repasses-2024-2026.json', JSON.stringify(payload, null, 2))
console.log(JSON.stringify({
  generatedAt: payload.generatedAt,
  cislavRows: cislavRows.length,
  municipalities: payload.summary.length,
  months: payload.summary.reduce((sum, city) => sum + Object.keys(city.months).length, 0),
  municipalReports: municipalReports.length,
}, null, 2))
