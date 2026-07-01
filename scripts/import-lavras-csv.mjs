import { readFileSync, writeFileSync } from 'node:fs'

const csvPath = process.argv[2] ?? '/Users/pedrox/Downloads/analiticoEmpenhos (1).csv'
const historyPath = 'data/historico-repasses-2024-2026.json'

function parseCsvLine(line) {
  const out = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"' && line[i + 1] === '"') { current += '"'; i += 1; continue }
    if (char === '"') { quoted = !quoted; continue }
    if (char === ',' && !quoted) { out.push(current); current = ''; continue }
    current += char
  }
  out.push(current)
  return out
}
function brl(value) {
  return Number(String(value ?? '0').replace(/\./g, '').replace(',', '.')) || 0
}
function isoDate(value) {
  const match = String(value ?? '').match(/(\d{2})[/-](\d{2})[/-](\d{4})/)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : ''
}
function monthKey(value) {
  return isoDate(value).slice(0, 7)
}
function kindFromText(text = '') {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  if (normalized.includes('RATEIO')) return 'rateio'
  return 'assistencial'
}
function addMonths(date, months) {
  const copy = new Date(`${date}T00:00:00`)
  copy.setMonth(copy.getMonth() + months)
  return copy.toISOString().slice(0, 10)
}
function delayDays(paidAt, deadline, contractEnd) {
  const finalDate = paidAt || contractEnd || new Date().toISOString().slice(0, 10)
  const capped = contractEnd && finalDate > contractEnd ? contractEnd : finalDate
  if (!deadline || capped <= deadline) return 0
  return Math.ceil((new Date(`${capped}T00:00:00`) - new Date(`${deadline}T00:00:00`)) / 86400000)
}

const lines = readFileSync(csvPath, 'utf8').split(/\r?\n/)
const records = []
for (let i = 0; i < lines.length; i += 1) {
  const cols = parseCsvLine(lines[i])
  if (!/^\d+$/.test(cols[0] ?? '')) continue
  const next = parseCsvLine(lines[i + 1] ?? '')
  const process = parseCsvLine(lines[i + 2] ?? '')
  const processText = process.join(' ')
  const start = processText.match(/Início:\s*(\d{2}-\d{2}-\d{4})/i)?.[1]?.replaceAll('-', '/')
  const end = processText.match(/Fim:\s*(\d{2}-\d{2}-\d{4})/i)?.[1]?.replaceAll('-', '/')
  const contract = processText.match(/Contrato:\s*([0-9/]+)/i)?.[1] ?? processText.match(/Convênio:\s*([0-9/]+)/i)?.[1]
  const data = cols[2]
  const paid = brl(cols[13])
  const liquidated = brl(cols[11])
  const amount = paid || liquidated || brl(cols[9])
  const history = next.join(' ')
  const kind = kindFromText(`${history} ${processText}`)
  const issueDate = isoDate(data)
  const deadline = kind === 'assistencial' ? addMonths(issueDate, 1) : isoDate(data)
  records.push({
    empenho: cols[0],
    data: issueDate,
    month: monthKey(data),
    kind,
    amount,
    paid,
    liquidated,
    aPagar: brl(cols[18]),
    history,
    contract,
    contractStart: isoDate(start),
    contractEnd: isoDate(end),
    deadline,
    delayDays: delayDays(paid ? issueDate : '', deadline, isoDate(end)),
  })
}

const history = JSON.parse(readFileSync(historyPath, 'utf8'))
let lavras = history.summary.find((city) => city.municipalityId === 'lavras')
if (!lavras) {
  lavras = { municipalityId: 'lavras', municipality: 'LAVRAS', months: {} }
  history.summary.push(lavras)
}
for (const record of records) {
  const entry = lavras.months[record.month] ??= {
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
  if (record.kind === 'rateio') {
    entry.rateioTotal = Number((entry.rateioTotal + record.amount).toFixed(2))
    entry.rateioRows += 1
    entry.rateioDelayDays += record.delayDays
  } else {
    entry.assistentialTotal = Number((entry.assistentialTotal + record.amount).toFixed(2))
    entry.assistentialRows += 1
    entry.assistentialDelayDays += record.delayDays
  }
  entry.nfs.push({
    municipio: 'LAVRAS',
    empenho: record.empenho,
    valor: record.amount,
    pagamento: record.paid ? record.data : undefined,
    emissao: record.data,
    vencimento: record.deadline,
    contrato: record.contract,
    contratoInicio: record.contractStart,
    contratoFim: record.contractEnd,
  })
  entry.difference = Number((entry.municipalTotal - entry.cislavTotal).toFixed(2))
  entry.sourceStatus = entry.cislavTotal && Math.abs(entry.difference) < 0.01 ? 'conciliado' : 'divergente'
}

history.summary.sort((a, b) => a.municipality.localeCompare(b.municipality, 'pt-BR'))
history.lavrasImport = { generatedAt: new Date().toISOString(), source: csvPath, records }
writeFileSync(historyPath, JSON.stringify(history, null, 2))
console.log(JSON.stringify({ imported: records.length, records }, null, 2))
