import { readFileSync, writeFileSync } from 'node:fs'

const csvPath = process.argv[2] ?? '/Users/pedrox/Downloads/Relatório padrão em coluna (Recomendado).csv'
const historyPath = 'data/historico-repasses-2024-2026.json'
const municipalityId = 'nepomuceno'
const municipality = 'NEPOMUCENO'
const importSource = 'nepomuceno_csv'

function parseDelimited(text, delimiter = ';') {
  const rows = []
  let row = []
  let current = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '"' && next === '"') {
      current += '"'
      i += 1
      continue
    }
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === delimiter && !quoted) {
      row.push(current.trim())
      current = ''
      continue
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1
      row.push(current.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      current = ''
      continue
    }
    current += char
  }
  row.push(current.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function brl(value) {
  return Number(String(value ?? '0').replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.')) || 0
}

function isoDate(value) {
  const match = String(value ?? '').match(/(\d{2})[/-](\d{2})[/-](\d{4})/)
  if (!match || match[3] === '1800') return ''
  return `${match[3]}-${match[2]}-${match[1]}`
}

function monthKey(date) {
  return String(date).slice(0, 7)
}

function normalize(text = '') {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
}

function kindFromText(text = '') {
  return normalize(text).includes('RATEIO') ? 'rateio' : 'assistencial'
}

function addMonths(date, months) {
  const copy = new Date(`${date}T00:00:00`)
  copy.setMonth(copy.getMonth() + months)
  return copy.toISOString().slice(0, 10)
}

function deadlineFor(record) {
  if (record.kind === 'assistencial') return addMonths(record.data, 1)
  return record.data
}

function delayDays(paidAt, deadline) {
  if (!paidAt || !deadline || paidAt <= deadline) return 0
  return Math.ceil((new Date(`${paidAt}T00:00:00`) - new Date(`${deadline}T00:00:00`)) / 86400000)
}

const rows = parseDelimited(readFileSync(csvPath, 'utf8'))
const header = rows.shift()
if (!header?.length) throw new Error(`CSV de Nepomuceno vazio: ${csvPath}`)
const index = Object.fromEntries(header.map((name, position) => [name.trim(), position]))
const col = (row, name) => row[index[name]] ?? ''

const records = rows
  .map((row) => {
    const data = isoDate(col(row, 'Data do empenho'))
    const text = `${col(row, 'Histórico do empenho')} ${col(row, 'Elemento')} ${col(row, 'Modalidade de aplicação')}`
    const kind = kindFromText(text)
    const paid = brl(col(row, 'Valor pago R$'))
    const liquidated = brl(col(row, 'Valor liquidado R$'))
    const committed = brl(col(row, 'Valor do empenho'))
    const amount = paid || liquidated || committed
    const deadline = data ? deadlineFor({ data, kind }) : ''
    return {
      empenho: col(row, 'Número do empenho'),
      data,
      month: monthKey(data),
      kind,
      amount,
      paid,
      liquidated,
      committed,
      aPagar: brl(col(row, 'Saldo a pagar R$')),
      history: col(row, 'Histórico do empenho'),
      contract: col(row, 'Número do contrato'),
      contractDate: isoDate(col(row, 'Data do contrato')),
      expense: col(row, 'Descrição da despesa'),
      deadline,
      delayDays: delayDays(paid ? data : '', deadline),
    }
  })
  .filter((record) => record.data && record.amount > 0)

const history = JSON.parse(readFileSync(historyPath, 'utf8'))
let nepomuceno = history.summary.find((city) => city.municipalityId === municipalityId)
if (!nepomuceno) {
  nepomuceno = { municipalityId, municipality, months: {} }
  history.summary.push(nepomuceno)
}

for (const entry of Object.values(nepomuceno.months)) {
  entry.municipalTotal = 0
  entry.nfs = (entry.nfs ?? []).filter((nf) => nf.importSource !== importSource)
}

for (const record of records) {
  const entry = nepomuceno.months[record.month] ??= {
    month: record.month,
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
  entry.municipalTotal = Number((entry.municipalTotal + record.amount).toFixed(2))
  entry.nfs.push({
    municipio: municipality,
    empenho: record.empenho,
    valor: record.amount,
    pagamento: record.paid ? record.data : undefined,
    emissao: record.data,
    vencimento: record.deadline,
    contrato: record.contract,
    contratoInicio: record.contractDate,
    historico: record.history,
    importSource,
  })
}

for (const entry of Object.values(nepomuceno.months)) {
  entry.difference = Number(((entry.municipalTotal ?? 0) - (entry.cislavTotal ?? 0)).toFixed(2))
  entry.sourceStatus = entry.municipalTotal ? (Math.abs(entry.difference) < 0.01 ? 'conciliado' : 'divergente') : 'cislav_apenas'
}

history.summary.sort((a, b) => a.municipality.localeCompare(b.municipality, 'pt-BR'))
history.nepomucenoImport = { generatedAt: new Date().toISOString(), source: csvPath, records }
writeFileSync(historyPath, JSON.stringify(history, null, 2))
console.log(JSON.stringify({ imported: records.length, records }, null, 2))
