'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Banknote, CalendarClock, CheckCircle2, CheckSquare, ChevronDown, ChevronRight, ExternalLink, FileText, Gauge, LayoutDashboard, Plus, Scale, Search, Upload } from 'lucide-react'
import { average, invoiceDelay, invoiceTone, penaltyEstimate, riskLevel, stricterMunicipalDeadline, transferDelay, transferStatus } from '@/lib/calculations'
import { assistanceProviders, assistentialProductions as seedAssistentialProductions, cislavExpenses, contracts as seedContracts, invoices as seedInvoices, municipalities as seedMunicipalities, publicSources, transfers as seedTransfers } from '@/lib/sample-data'
import { historicalGeneratedAt, historicalSummaries } from '@/lib/historical-data'
import { calculateBusinessDeadline, formatDate, overdueDays, parseDate } from '@/lib/date-utils'
import type { AssistanceProvider, AssistentialProduction, CislavExpense, Invoice, MunicipalInvoiceEvidence, MunicipalityTransfer } from '@/types'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const today = new Date()
const stateVersion = '2026-07-production-import'
const municipalAudit = [
  { id: 'carrancas', status: 'conciliado', source: 'API municipal validada', nfCount: 1, note: 'NFSe 5792 encontrada.' },
  { id: 'ibituruna', status: 'conciliado', source: 'API municipal validada', nfCount: 4, note: 'NFs 5719 e 5734 encontradas.' },
  { id: 'ijaci', status: 'divergente', source: 'API municipal validada', nfCount: 1, note: 'Prefeitura retornou R$ 2.100,90 acima da receita CISLAV de maio no filtro amplo.' },
  { id: 'ingai', status: 'conciliado', source: 'API municipal validada', nfCount: 7, note: 'NFs 5718, 5750 e 5782 encontradas.' },
  { id: 'itumirim', status: 'divergente', source: 'API municipal validada', nfCount: 2, note: 'Prefeitura retornou R$ 1.991,40 acima da receita CISLAV de maio no filtro amplo.' },
  { id: 'luminarias', status: 'divergente', source: 'API municipal validada', nfCount: 6, note: 'Prefeitura retornou R$ 1.675,80 acima da receita CISLAV de maio no filtro amplo.' },
  { id: 'nazareno', status: 'conciliado', source: 'API municipal validada', nfCount: 3, note: 'NFSe 5723 encontrada.' },
  { id: 'bom-sucesso', status: 'somente CISLAV', source: 'Portal Memory LAI sem extração confiável', nfCount: 0, note: 'Usa dados do CISLAV como fonte primária; sem conciliação municipal disponível.' },
  { id: 'itutinga', status: 'somente CISLAV', source: 'Portal municipal de despesas não localizado', nfCount: 0, note: 'Usa dados do CISLAV como fonte primária; sem conciliação municipal disponível.' },
  { id: 'lavras', status: 'importação CSV', source: 'Portal Cidadão / Analítico de Empenhos', nfCount: 5, note: 'Dados municipais importados por CSV/PDF do portal de Lavras.' },
  { id: 'nepomuceno', status: 'importação CSV', source: 'Portal Acesso à Informação / CSV padrão em coluna', nfCount: 6, note: 'Dados municipais importados do CSV; contratos de programa/rateio identificados em janeiro de 2026.' },
  { id: 'ribeirao-vermelho', status: 'somente CISLAV', source: 'Portal Memory LAI sem extração confiável', nfCount: 0, note: 'Usa dados do CISLAV como fonte primária; sem conciliação municipal disponível.' },
]
const historicalMonths = Array.from({ length: 29 }, (_, index) => {
  const date = new Date(2024, index, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
})
const years = ['ultimos12', 'todos', '2024', '2025', '2026']
const monthOptions = ['todos', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
const municipalityAliases: Record<string, { id: string; name: string }> = {
  'lavras-mg': { id: 'lavras', name: 'LAVRAS' },
  'ribeiraao-vermelho': { id: 'ribeirao-vermelho', name: 'RIBEIRÃO VERMELHO' },
  'riberao-vemelho': { id: 'ribeirao-vermelho', name: 'RIBEIRÃO VERMELHO' },
}
const normalizedHistoricalSummaries = Array.from(historicalSummaries.reduce((map, city) => {
  const canonical = municipalityAliases[city.municipalityId] ?? { id: city.municipalityId, name: city.municipality }
  const merged = map.get(canonical.id) ?? { municipalityId: canonical.id, municipality: canonical.name, months: {} }
  for (const [monthKey, month] of Object.entries(city.months)) {
    const entry = merged.months[monthKey] ??= {
      month: month.month,
      cislavTotal: 0,
      municipalTotal: 0,
      rateioTotal: 0,
      assistentialTotal: 0,
      rateioDelayDays: 0,
      assistentialDelayDays: 0,
      rateioRows: 0,
      assistentialRows: 0,
      nfs: [],
      sourceStatus: 'cislav_apenas' as const,
    }
    entry.cislavTotal = Number((entry.cislavTotal + month.cislavTotal).toFixed(2))
    entry.municipalTotal = Number((entry.municipalTotal + month.municipalTotal).toFixed(2))
    entry.rateioTotal = Number((entry.rateioTotal + month.rateioTotal).toFixed(2))
    entry.assistentialTotal = Number((entry.assistentialTotal + month.assistentialTotal).toFixed(2))
    entry.rateioDelayDays += month.rateioDelayDays
    entry.assistentialDelayDays += month.assistentialDelayDays
    entry.rateioRows += month.rateioRows
    entry.assistentialRows += month.assistentialRows
    entry.nfs.push(...month.nfs)
    entry.difference = Number((entry.municipalTotal - entry.cislavTotal).toFixed(2))
    entry.sourceStatus = entry.municipalTotal ? (Math.abs(entry.difference) < 0.01 ? 'conciliado' : 'divergente') : 'cislav_apenas'
  }
  map.set(canonical.id, merged)
  return map
}, new Map<string, (typeof historicalSummaries)[number]>()).values()).sort((a, b) => a.municipality.localeCompare(b.municipality, 'pt-BR'))
const historicalCityIds = new Set(normalizedHistoricalSummaries.map((item) => item.municipalityId))
const dashboardMunicipalities = [
  ...seedMunicipalities,
  ...normalizedHistoricalSummaries.filter((item) => !seedMunicipalities.some((city) => city.id === item.municipalityId)).map((item) => ({ id: item.municipalityId, name: item.municipality, state: 'MG' })),
].filter((city) => historicalCityIds.has(city.id) || seedMunicipalities.some((item) => item.id === city.id))

function transferKind(transfer: MunicipalityTransfer) {
  const text = `${transfer.sourceDocument ?? ''} ${transfer.notes ?? ''}`.toUpperCase()
  if (text.includes('RATEIO') || text.includes('RAEIO')) return 'rateio'
  return 'assistencial'
}

function monthFromDate(date: string) {
  return date.slice(0, 7)
}

function previousMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00`)
  date.setMonth(date.getMonth() - 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function normalizeText(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

function normalizeDocument(value = '') {
  return value.replace(/\D/g, '')
}

function extractDocumentFromText(value = '') {
  const match = value.match(/\d[\d.\-/\s]{10,}\d/)
  return match ? normalizeDocument(match[0]) : ''
}

function cleanProviderName(value = '') {
  return value.replace(/\s*\|\s*\d[\d.\-/\s]{10,}\d\s*$/, '').trim()
}

function normalizeHeader(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

function parseMoneyValue(value = '') {
  const cleaned = value.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseFlexibleDate(value = '') {
  const trimmed = value.trim()
  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return iso ? iso[0] : undefined
}

function detectDelimiter(line = '') {
  return [';', ',', '\t'].sort((a, b) => line.split(b).length - line.split(a).length)[0]
}

function parseDelimitedRows(text: string) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? ''
  const delimiter = detectDelimiter(firstLine)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (char === '"' && quoted && next === '"') {
      cell += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim())
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1
      row.push(cell.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function fieldByAliases(row: Record<string, string>, aliases: string[]) {
  return aliases.map((alias) => row[normalizeHeader(alias)]).find((value) => value !== undefined && value !== '') ?? ''
}

function inferProductionModel(headers: string[]): AssistentialProduction['sourceModel'] {
  const normalized = headers.map(normalizeHeader)
  if (normalized.includes('nomepaciente') && normalized.includes('codigosus')) return 'EP'
  if (normalized.includes('municipio') && normalized.includes('banco') && normalized.includes('agencia')) return 'EM'
  if (normalized.includes('procedimentoprincipal')) return 'PC'
  if (normalized.includes('subgrupo')) return 'SG'
  if (normalized.includes('municipio') && normalized.includes('fornecedor') && normalized.includes('valortotal')) return 'EF'
  if (normalized.includes('qtd') && normalized.includes('profissional')) return 'E'
  if (normalized.includes('qtd')) return 'S'
  return 'A'
}

function expenseDeadline(expense: CislavExpense) {
  const baseDate = expense.liquidationDate ?? expense.issueDate
  return calculateBusinessDeadline(parseDate(baseDate), 21)
}

function expenseOpenAmount(expense: CislavExpense) {
  return Math.max(0, (expense.liquidatedAmount ?? expense.committedAmount ?? 0) - (expense.paidAmount ?? 0))
}

function expenseDelay(expense: CislavExpense, reference = new Date()) {
  const comparison = expense.paymentDate ? parseDate(expense.paymentDate) : reference
  return overdueDays(expenseDeadline(expense), comparison)
}

function providerMatchesInvoice(provider: AssistanceProvider, invoice: Invoice) {
  const invoiceDocument = normalizeDocument(invoice.professionalDocument)
  if (invoiceDocument && normalizeDocument(provider.document) === invoiceDocument) return true
  const providerName = normalizeText(provider.name)
  const invoiceName = normalizeText(invoice.professionalName)
  return invoiceName.length >= 6 && (providerName.includes(invoiceName) || invoiceName.includes(providerName))
}

function expenseMatchesInvoice(expense: CislavExpense, invoice: Invoice) {
  const invoiceDocument = normalizeDocument(invoice.professionalDocument)
  const creditor = normalizeText(expense.creditorName)
  const professional = normalizeText(invoice.professionalName)
  const documentMatch = Boolean(invoiceDocument && normalizeDocument(expense.creditorDocument) === invoiceDocument)
  const nameMatch = professional.length >= 6 && (creditor.includes(professional) || professional.includes(creditor))
  const numberMatch = invoice.number && expense.invoiceNumber === invoice.number
  const issueMatch = !expense.invoiceIssueDate || expense.invoiceIssueDate === invoice.issueDate || monthFromDate(expense.issueDate) === monthFromDate(invoice.issueDate)
  return Boolean((documentMatch || nameMatch || numberMatch) && issueMatch)
}

function expenseExactMatch(expense: CislavExpense, invoice: Invoice) {
  const invoiceDocument = normalizeDocument(invoice.professionalDocument)
  const documentMatch = Boolean(invoiceDocument && normalizeDocument(expense.creditorDocument) === invoiceDocument)
  const numberMatch = Boolean(invoice.number && expense.invoiceNumber === invoice.number)
  const issueMatch = Boolean(expense.invoiceIssueDate && expense.invoiceIssueDate === invoice.issueDate)
  return (documentMatch || numberMatch) && (numberMatch || issueMatch)
}

function productionMatchesInvoice(production: AssistentialProduction, invoice: Invoice, serviceMonth: string) {
  const invoiceDocument = normalizeDocument(invoice.professionalDocument)
  const documentMatch = Boolean(invoiceDocument && (normalizeDocument(production.providerDocument) === invoiceDocument || extractDocumentFromText(production.providerName) === invoiceDocument))
  const provider = normalizeText(production.providerName)
  const professional = normalizeText(production.professionalName)
  const invoiceName = normalizeText(invoice.professionalName)
  const nameMatch = invoiceName.length >= 6 && (provider.includes(invoiceName) || invoiceName.includes(provider) || professional.includes(invoiceName) || invoiceName.includes(professional))
  const municipalityMatch = !production.municipalityId || invoice.municipalityIds.includes(production.municipalityId)
  const competenceMatch = production.competence === serviceMonth || production.competence === monthFromDate(invoice.issueDate)
  return Boolean((documentMatch || nameMatch) && municipalityMatch && competenceMatch)
}

function monthLabelFromHistory(history = '') {
  const normalized = history.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  const months = [
    ['JANEIRO', '01'], ['FEVEREIRO', '02'], ['MARCO', '03'], ['MARÇO', '03'], ['ABRIL', '04'], ['MAIO', '05'], ['JUNHO', '06'],
    ['JULHO', '07'], ['AGOSTO', '08'], ['SETEMBRO', '09'], ['OUTUBRO', '10'], ['NOVEMBRO', '11'], ['DEZEMBRO', '12'],
  ]
  const year = normalized.match(/20\d{2}/)?.[0]
  const found = months.find(([name]) => normalized.includes(name))
  return year && found ? `${year}-${found[1]}` : undefined
}

function statusClass(tone: string) {
  if (tone === 'red' || tone === 'overdue' || tone === 'critico') return 'bg-red-50 text-red-800 ring-red-200'
  if (tone === 'yellow' || tone === 'within_deadline' || tone === 'alto' || tone === 'moderado') return 'bg-amber-50 text-amber-900 ring-amber-200'
  if (tone === 'gray') return 'bg-slate-100 text-slate-600 ring-slate-200'
  return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
}
function Pill({ tone, children }: { tone: string; children: React.ReactNode }) { return <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-semibold ring-1 ${statusClass(tone)}`}>{children}</span> }
function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) { return <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">{icon}{title}</div>{children}</section> }

export default function Home() {
  const [invoices, setInvoices] = useState<Invoice[]>(seedInvoices)
  const [transfers, setTransfers] = useState<MunicipalityTransfer[]>(seedTransfers)
  const [selectedId, setSelectedId] = useState(seedInvoices[0]?.id ?? '')
  const [csv, setCsv] = useState('')
  const [productionCsv, setProductionCsv] = useState('')
  const [productions, setProductions] = useState<AssistentialProduction[]>(seedAssistentialProductions)
  const [productionImportFeedback, setProductionImportFeedback] = useState('')
  const [activeTab, setActiveTab] = useState<'nfse' | 'prefeituras'>('nfse')
  const [selectedYear, setSelectedYear] = useState('ultimos12')
  const [selectedMonth, setSelectedMonth] = useState('todos')
  const [expandedTransferGroups, setExpandedTransferGroups] = useState<string[]>([])
  const [providerSearchFeedback, setProviderSearchFeedback] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('cislav-monitor-state')
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.version === stateVersion) {
        setInvoices(parsed.invoices ?? seedInvoices); setTransfers(parsed.transfers ?? seedTransfers); setProductions(parsed.productions ?? seedAssistentialProductions); setSelectedId(parsed.invoices?.[0]?.id ?? seedInvoices[0]?.id ?? '')
      }
    }
  }, [])
  useEffect(() => { localStorage.setItem('cislav-monitor-state', JSON.stringify({ version: stateVersion, invoices, transfers, productions })) }, [invoices, transfers, productions])

  const selected = invoices.find((invoice) => invoice.id === selectedId) ?? invoices[0]
  const selectedCashMonth = selected ? monthFromDate(selected.issueDate) : ''
  const selectedServiceMonth = selectedCashMonth ? previousMonth(selectedCashMonth) : ''
  const selectedTransfers = selected ? transfers.filter((transfer) => selected.municipalityIds.includes(transfer.municipalityId)) : []
  const selectedCashTransfers = selected ? selectedTransfers.filter((transfer) => transfer.competence === selectedCashMonth) : []
  const selectedMunicipalInvoiceEvidence: MunicipalInvoiceEvidence[] = selected ? selected.municipalityIds.flatMap((municipalityId) => {
    const city = normalizedHistoricalSummaries.find((item) => item.municipalityId === municipalityId)
    const month = city?.months[selectedCashMonth]
    return (month?.nfs ?? []).filter((nf) => nf.notaFiscal || nf.emissao).map((nf) => ({
      municipalityId,
      municipality: city?.municipality ?? seedMunicipalities.find((item) => item.id === municipalityId)?.name ?? municipalityId,
      competence: selectedCashMonth,
      commitmentNumber: nf.empenho,
      invoiceNumber: nf.notaFiscal,
      issueDate: nf.emissao,
      dueDate: nf.vencimento,
      paymentDate: nf.pagamento,
      amount: nf.valor,
      source: nf.importSource === 'csv_lavras' || nf.importSource === 'csv_nepomuceno' ? 'importacao_csv' : 'api_municipal',
    }))
  }) : []
  const selectedMunicipalitiesWithoutInvoice = selected ? selected.municipalityIds.filter((municipalityId) => {
    const audit = municipalAudit.find((item) => item.id === municipalityId)
    return !selectedMunicipalInvoiceEvidence.some((item) => item.municipalityId === municipalityId) && audit?.status !== 'somente CISLAV'
  }) : []
  const metrics = useMemo(() => {
    const nfDelays = invoices.map((invoice) => invoiceDelay(invoice, today).calendar).filter((days) => days > 0)
    const transferDelays = transfers.map((transfer) => transferDelay(transfer, today))
    const overdueCount = invoices.filter((invoice) => invoiceDelay(invoice, today).calendar > 0 && invoice.paymentStatus !== 'paid').length + transfers.filter((transfer) => transferStatus(transfer, today) === 'overdue').length
    const total = invoices.length + transfers.length
    const avgNFDelay = average(nfDelays)
    const avgTransferDelay = average(transferDelays)
    return { avgNFDelay, avgTransferDelay, risk: riskLevel(avgNFDelay, avgTransferDelay, total ? overdueCount / total : 0) }
  }, [invoices, transfers])
  const transferTotals = useMemo(() => {
    return seedMunicipalities.map((city) => {
      const cityTransfers = transfers.filter((transfer) => transfer.municipalityId === city.id)
      const total = cityTransfers.reduce((sum, transfer) => sum + (transfer.paidAmount ?? transfer.expectedAmount ?? 0), 0)
      const dates = [...new Set(cityTransfers.map((transfer) => transfer.paidAt).filter(Boolean))].sort()
      return { city, total, count: cityTransfers.length, dates }
    }).filter((item) => item.count > 0).sort((a, b) => b.total - a.total)
  }, [transfers])
  const transferGroups = useMemo(() => {
    const groups = new Map<string, { key: string; municipalityId: string; cityName: string; competence: string; rows: MunicipalityTransfer[]; expected: number; paid: number; firstPaidAt?: string; lastPaidAt?: string; deadline: string; divergenceNote?: string }>()
    for (const transfer of transfers) {
      const city = seedMunicipalities.find((item) => item.id === transfer.municipalityId)
      const key = `${transfer.municipalityId}-${transfer.competence}`
      const group = groups.get(key) ?? {
        key,
        municipalityId: transfer.municipalityId,
        cityName: city?.name ?? transfer.municipalityId,
        competence: transfer.competence,
        rows: [],
        expected: 0,
        paid: 0,
        deadline: transfer.transferDeadline,
        divergenceNote: transfer.divergenceNote,
      }
      group.rows.push(transfer)
      group.expected += transfer.expectedAmount ?? 0
      group.paid += transfer.paidAmount ?? 0
      group.divergenceNote ??= transfer.divergenceNote
      group.deadline = group.deadline < transfer.transferDeadline ? group.deadline : transfer.transferDeadline
      const paidAt = transfer.paidAt
      if (paidAt) {
        group.firstPaidAt = !group.firstPaidAt || paidAt < group.firstPaidAt ? paidAt : group.firstPaidAt
        group.lastPaidAt = !group.lastPaidAt || paidAt > group.lastPaidAt ? paidAt : group.lastPaidAt
      }
      groups.set(key, group)
    }
    return Array.from(groups.values()).sort((a, b) => (a.firstPaidAt ?? a.competence).localeCompare(b.firstPaidAt ?? b.competence) || a.cityName.localeCompare(b.cityName, 'pt-BR'))
  }, [transfers])
  const monthlyCityStatus = useMemo(() => {
    const periodMonths = selectedYear === 'ultimos12' ? historicalMonths.slice(-12) : historicalMonths
    const visibleMonths = periodMonths.filter((month) => (selectedYear === 'ultimos12' || selectedYear === 'todos' || month.startsWith(selectedYear)) && (selectedMonth === 'todos' || month.endsWith(`-${selectedMonth}`)))
    return dashboardMunicipalities.map((city) => {
      const historical = normalizedHistoricalSummaries.find((item) => item.municipalityId === city.id)
      const months = visibleMonths.map((month) => {
        const item = historical?.months[month]
        if (!item) return { month, rateioStatus: 'sem dado', assistentialStatus: 'sem dado', assistentialTotalDelay: 0, rateioCount: 0, assistentialCount: 0, sourceStatus: 'sem dado' }
        const rateioStatus = item.rateioRows === 0 ? 'sem dado' : item.rateioDelayDays > 0 ? 'atrasado' : 'em dia'
        const assistentialStatus = item.assistentialRows === 0 ? 'sem dado' : item.assistentialDelayDays > 0 ? 'atrasado' : 'em dia'
        return { month, rateioStatus, assistentialStatus, assistentialTotalDelay: item.assistentialDelayDays, rateioCount: item.rateioRows, assistentialCount: item.assistentialRows, sourceStatus: item.sourceStatus }
      })
      const knownRateioMonths = months.filter((item) => item.rateioStatus !== 'sem dado')
      const cityRateioStatus = knownRateioMonths.some((item) => item.rateioStatus === 'atrasado') ? 'atrasado' : knownRateioMonths.some((item) => item.rateioStatus === 'no prazo') ? 'no prazo' : knownRateioMonths.length ? 'em dia' : 'sem dado'
      const assistentialDelayMonths = months.filter((item) => item.assistentialCount > 0)
      const avgAssistentialDelay = assistentialDelayMonths.length ? average(assistentialDelayMonths.map((item) => item.assistentialTotalDelay)) : 0
      return { city, months, cityRateioStatus, avgAssistentialDelay }
    })
  }, [selectedYear, selectedMonth])

  const selectedDelay = selected ? invoiceDelay(selected, today) : undefined
  const selectedTone = selected ? invoiceTone(selected, today) : undefined
  const penalty = selected ? penaltyEstimate(selected, today) : undefined
  const allLinkedPaid = selectedCashTransfers.length > 0 && selectedCashTransfers.every((transfer) => transferStatus(transfer, today) === 'paid')
  const selectedMunicipalityNames = selected?.municipalityIds.map((id) => seedMunicipalities.find((city) => city.id === id)?.name ?? id) ?? []
  const delayedLinkedTransfers = selectedCashTransfers.filter((transfer) => {
    const audit = municipalAudit.find((item) => item.id === transfer.municipalityId)
    const hasIssuedInvoice = selectedMunicipalInvoiceEvidence.some((item) => item.municipalityId === transfer.municipalityId)
    return transferStatus(transfer, today) === 'overdue' && (hasIssuedInvoice || audit?.status === 'somente CISLAV')
  })
  const divergentLinkedTransfers = selectedCashTransfers.filter((transfer) => transfer.divergenceNote)
  const responsibility = selectedDelay && selected && selectedDelay.calendar > 0 && selected.paymentStatus !== 'paid'
    ? delayedLinkedTransfers.length > 0
      ? { tone: 'yellow', title: 'Responsabilidade provável compartilhada', text: `Há atraso da NF e ${delayedLinkedTransfers.length} repasse(s) vinculado(s) também aparecem atrasados ou sem pagamento. Possíveis responsáveis: municípios vinculados com pendência e CISLAV pela gestão/repasse ao profissional.` }
      : { tone: 'red', title: 'Responsabilidade provável do CISLAV', text: 'A NF está atrasada e os repasses dos municípios selecionados aparecem pagos ou sem atraso cadastrado. Com os dados disponíveis, o gargalo fica no CISLAV.' }
    : { tone: 'green', title: 'Sem atraso da NF selecionada', text: 'A NF selecionada não está vencida pelos parâmetros cadastrados.' }
  const providerMatches = selected ? assistanceProviders.filter((provider) => providerMatchesInvoice(provider, selected)).slice(0, 5) : []
  const likelyProviders = selected && providerMatches.length === 0
    ? assistanceProviders.filter((provider) => {
      const professional = normalizeText(selected.professionalName)
      return professional.length >= 3 && normalizeText(provider.name).includes(professional.slice(0, 10))
    }).slice(0, 5)
    : providerMatches
  const expenseMatches = selected ? cislavExpenses.filter((expense) => expenseMatchesInvoice(expense, selected)).sort((a, b) => (b.invoiceIssueDate ?? b.issueDate).localeCompare(a.invoiceIssueDate ?? a.issueDate)) : []
  const exactExpenseMatches = selected ? expenseMatches.filter((expense) => expenseExactMatch(expense, selected)) : []
  const providerTimingStats = expenseMatches.length ? {
    issueToCommitment: average(expenseMatches.filter((expense) => expense.invoiceIssueDate).map((expense) => Math.max(0, Math.round((parseDate(expense.issueDate).getTime() - parseDate(expense.invoiceIssueDate as string).getTime()) / 86400000)))),
    commitmentToLiquidation: average(expenseMatches.filter((expense) => expense.liquidationDate).map((expense) => Math.max(0, Math.round((parseDate(expense.liquidationDate as string).getTime() - parseDate(expense.issueDate).getTime()) / 86400000)))),
    liquidationToPayment: average(expenseMatches.filter((expense) => expense.liquidationDate && expense.paymentDate).map((expense) => Math.max(0, Math.round((parseDate(expense.paymentDate as string).getTime() - parseDate(expense.liquidationDate as string).getTime()) / 86400000)))),
  } : undefined
  const selectedProductions = selected ? productions.filter((production) => productionMatchesInvoice(production, selected, selectedServiceMonth)) : []
  const selectedProductionTotal = selectedProductions.reduce((sum, production) => sum + production.totalAmount, 0)
  const selectedProductionMunicipalityIds = [...new Set(selectedProductions.map((production) => production.municipalityId).filter(Boolean) as string[])]
  const selectedProductionMunicipalities = [...new Set(selectedProductions.map((production) => production.municipalityName).filter(Boolean) as string[])]
  const productionDifference = selected ? selectedProductionTotal - selected.amount : 0
  const productionTone = selectedProductions.length === 0 ? 'gray' : Math.abs(productionDifference) <= Math.max(1, (selected?.amount ?? 0) * 0.01) ? 'green' : 'yellow'
  const productionTitle = selectedProductions.length === 0
    ? 'Sem produção assistencial importada para esta NF'
    : productionTone === 'green'
      ? 'Produção compatível com a NF'
      : selectedProductionTotal > (selected?.amount ?? 0)
        ? 'Produção importada maior que a NF'
        : 'Produção importada menor que a NF'
  const expenseAnalysis = selected ? (() => {
    if (expenseMatches.length === 0) {
      return likelyProviders.length
        ? { tone: 'yellow', title: 'Prestador provável, sem empenho localizado', text: 'O nome/documento parece compatível com a lista de prestadores assistenciais, mas ainda não há despesa importada do CISLAV que bata com a NF informada. Possível causa: NF ainda não empenhada/liquidada ou base de despesas incompleta.' }
        : { tone: 'gray', title: 'Sem evidência na base importada', text: 'Não há prestador provável nem despesa do CISLAV compatível com os dados informados. Confira CPF/CNPJ, razão social e número da NF, ou importe o analítico de despesas do período.' }
    }
    const openAmount = expenseMatches.reduce((sum, expense) => sum + expenseOpenAmount(expense), 0)
    const maxDelay = Math.max(...expenseMatches.map((expense) => expenseDelay(expense, today)))
    const allPaid = expenseMatches.every((expense) => expense.paymentDate || expenseOpenAmount(expense) === 0)
    if (exactExpenseMatches.length === 0) return { tone: 'yellow', title: 'Prestador encontrado, escolha uma NF do CISLAV', text: `Há ${expenseMatches.length} registro(s) do prestador/documento na base CISLAV, mas nenhum bate exatamente com número e emissão informados. Selecione uma NF listada para preencher com os dados oficiais ou siga manualmente se a NF ainda não foi atualizada pelo CISLAV.` }
    if (allPaid && maxDelay === 0) return { tone: 'green', title: 'Empenhada/liquidada e paga no prazo importado', text: 'Há despesa compatível na base CISLAV e o pagamento aparece concluído sem atraso calculado pela regra de 21 dias úteis após liquidação.' }
    if (allPaid && maxDelay > 0) return { tone: 'yellow', title: 'Paga, mas com atraso operacional', text: `A despesa compatível aparece paga, porém com até ${maxDelay} dia(s) de atraso sobre a regra operacional de 21 dias úteis após liquidação.` }
    const cashLinkedTotal = selectedCashTransfers.reduce((sum, transfer) => sum + (transfer.paidAmount ?? 0), 0)
    const likelyCause = cashLinkedTotal >= selected.amount && delayedLinkedTransfers.length === 0
      ? 'Os repasses municipais vinculados ao mês de emissão parecem suficientes/pagos; o motivo provável fica no fluxo interno do CISLAV, ordem de pagamento, saldo por fonte ou priorização administrativa.'
      : 'Há repasses municipais insuficientes, atrasados ou sem conciliação no mês de emissão; o atraso pode estar ligado à entrada de caixa assistencial, mas precisa respeitar a fonte de recurso.'
    return { tone: 'red', title: 'Empenhada/liquidada, mas com saldo em aberto', text: `Há ${money.format(openAmount)} em aberto nos registros compatíveis. ${likelyCause}` }
  })() : undefined

  function updateSelected<K extends keyof Invoice>(key: K, value: Invoice[K]) { if (!selected) return; setInvoices((items) => items.map((item) => item.id === selected.id ? { ...item, [key]: value, updatedAt: new Date().toISOString() } : item)) }
  function toggleMunicipality(municipalityId: string) {
    if (!selected) return
    const ids = selected.municipalityIds.includes(municipalityId) ? selected.municipalityIds.filter((id) => id !== municipalityId) : [...selected.municipalityIds, municipalityId]
    updateSelected('municipalityIds', ids.length ? ids : [municipalityId])
  }
  function selectAllMunicipalities() { if (selected) updateSelected('municipalityIds', seedMunicipalities.map((city) => city.id)) }
  function toggleTransferGroup(key: string) { setExpandedTransferGroups((items) => items.includes(key) ? items.filter((item) => item !== key) : [...items, key]) }
  function useExpenseAsInvoice(expense: CislavExpense) {
    if (!selected) return
    setInvoices((items) => items.map((item) => item.id === selected.id ? {
      ...item,
      number: expense.invoiceNumber ?? item.number,
      professionalName: expense.creditorName,
      professionalDocument: expense.creditorDocument ?? item.professionalDocument,
      issueDate: expense.invoiceIssueDate ?? expense.issueDate,
      acceptedDate: expense.liquidationDate ?? expense.invoiceIssueDate ?? expense.issueDate,
      amount: expense.liquidatedAmount ?? expense.committedAmount ?? item.amount,
      netAmount: expense.paidAmount ?? item.netAmount,
      paymentStatus: expense.paymentDate ? 'paid' : expenseOpenAmount(expense) > 0 ? 'partial' : item.paymentStatus,
      paymentDate: expense.paymentDate,
      serviceDescription: monthLabelFromHistory(expense.history) ? `Atendimentos/serviços de ${monthLabelFromHistory(expense.history)} conforme histórico CISLAV.` : expense.history,
      notes: `Preenchido por despesa CISLAV ${expense.commitmentNumber}. Fonte de recurso ${expense.fundingSource ?? 'não informada'}.`,
      updatedAt: new Date().toISOString(),
    } : item))
  }
  function searchProviderByDocument() {
    if (!selected) return
    const document = normalizeDocument(selected.professionalDocument)
    if (!document) {
      setProviderSearchFeedback('Informe o CPF/CNPJ do prestador para buscar na base importada.')
      return
    }
    const provider = assistanceProviders.find((item) => normalizeDocument(item.document) === document)
    const expenses = cislavExpenses.filter((item) => normalizeDocument(item.creditorDocument) === document)
    const productionRecords = productions.filter((item) => normalizeDocument(item.providerDocument) === document || extractDocumentFromText(item.providerName) === document)
    const productionProvider = productionRecords[0]
    if ((provider || productionProvider) && (!selected.professionalName || selected.professionalName === 'Profissional de saúde' || selected.professionalName === 'Novo profissional')) {
      updateSelected('professionalName', provider?.name ?? cleanProviderName(productionProvider.providerName))
    }
    const providerText = provider
      ? `prestador identificado: ${provider.name}`
      : productionProvider
        ? `prestador identificado na produção importada: ${cleanProviderName(productionProvider.providerName)}`
        : 'prestador ainda não identificado na lista provável ou produção importada'
    const expenseText = expenses.length ? `${expenses.length} NF/despesa do CISLAV encontrada(s) para este documento` : 'nenhuma despesa do CISLAV encontrada para este documento'
    const productionText = productionRecords.length ? `${productionRecords.length} linha(s) de produção assistencial encontrada(s)` : 'nenhuma produção assistencial importada para este documento'
    setProviderSearchFeedback(`${providerText}; ${expenseText}; ${productionText}. Confira os candidatos na seção de checagem abaixo.`)
  }
  function importAssistentialProduction() {
    const rows = parseDelimitedRows(productionCsv)
    if (rows.length < 2) {
      setProductionImportFeedback('Cole o CSV exportado do Faturamento antes de importar.')
      return
    }
    const headers = rows[0]
    const model = inferProductionModel(headers)
    const importedAt = new Date().toISOString()
    const records = rows.slice(1).map((cols, index) => {
      const row = Object.fromEntries(headers.map((header, headerIndex) => [normalizeHeader(header), cols[headerIndex] ?? '']))
      const providerRawName = fieldByAliases(row, ['Fornecedor', 'Prestador', 'Razão Social'])
      const providerName = cleanProviderName(providerRawName)
      const professionalName = fieldByAliases(row, ['Profissional'])
      const municipalityName = fieldByAliases(row, ['Município', 'Municipio'])
      const serviceDate = parseFlexibleDate(fieldByAliases(row, ['Data', 'DtAgCons', 'Data Atendimento']))
      const quantity = parseMoneyValue(fieldByAliases(row, ['QTD', 'Quantidade'])) || 1
      const unitAmount = parseMoneyValue(fieldByAliases(row, ['Valor Unitário', 'Valor Unitario', 'Valor']))
      const totalAmount = parseMoneyValue(fieldByAliases(row, ['Valor Total'])) || unitAmount * quantity
      const municipality = seedMunicipalities.find((city) => normalizeText(city.name) === normalizeText(municipalityName))
      const competence = serviceDate ? monthFromDate(serviceDate) : selectedServiceMonth || selectedCashMonth
      const providerDocument = normalizeDocument(fieldByAliases(row, ['CPF/CNPJ', 'CNPJ', 'Documento', 'CNPJ/CPF'])) || extractDocumentFromText(providerRawName)
      if (!providerName && !professionalName && !municipalityName && totalAmount === 0) return undefined
      return {
        id: `prod-${Date.now()}-${index}`,
        source: 'iconsorcio_export' as const,
        sourceModel: model,
        providerName: providerName || professionalName || 'Prestador não informado',
        providerDocument: providerDocument || undefined,
        professionalName: professionalName || undefined,
        municipalityName: municipality?.name ?? (municipalityName || undefined),
        municipalityId: municipality?.id,
        serviceDate,
        competence,
        procedureName: fieldByAliases(row, ['Procedimento', 'Procedimento Principal', 'Sub-Grupo']) || undefined,
        procedureCode: fieldByAliases(row, ['Código SUS', 'Codigo SUS']) || undefined,
        quantity,
        unitAmount: unitAmount || undefined,
        totalAmount,
        requestCode: fieldByAliases(row, ['Código', 'Codigo', 'CdSolCons']) || undefined,
        importedAt,
      } satisfies AssistentialProduction
    }).filter(Boolean) as AssistentialProduction[]
    if (!records.length) {
      setProductionImportFeedback('Não encontrei linhas válidas. Confira se o CSV tem cabeçalho e colunas como Fornecedor, Município, Data, QTD ou Valor Total.')
      return
    }
    setProductions((items) => [...records, ...items])
    setProductionCsv('')
    setProductionImportFeedback(`${records.length} linha(s) importada(s) do modelo ${model ?? 'não identificado'}. Os dados ficaram somente neste navegador.`)
  }
  function useProductionMunicipalities() {
    if (!selected || selectedProductionMunicipalityIds.length === 0) return
    updateSelected('municipalityIds', selectedProductionMunicipalityIds)
  }
  function addInvoice() { const id = `nf-${Date.now()}`; const invoice: Invoice = { id, number: `NF-${invoices.length + 1}`, professionalName: 'Novo profissional', issueDate: '2026-06-01', acceptedDate: '2026-06-01', contractualBusinessDays: 21, amount: 0, municipalityIds: ['lavras'], paymentStatus: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; setInvoices([invoice, ...invoices]); setSelectedId(id) }
  function importCsv() {
    const rows = csv.trim().split(/\n/).slice(1).map((line) => line.split(',')).filter((cols) => cols.length >= 6)
    const imported = rows.map((cols, index): MunicipalityTransfer => ({ id: `csv-${Date.now()}-${index}`, municipalityId: cols[0].trim(), competence: cols[1].trim(), expectedAmount: Number(cols[2] || 0), paidAmount: Number(cols[3] || 0) || undefined, transferDeadline: cols[4].trim(), paidAt: cols[5]?.trim() || undefined, sourceUrl: cols[6]?.trim(), sourceDocument: cols[7]?.trim(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }))
    setTransfers([...imported, ...transfers]); setCsv('')
  }

  return <main className="min-h-screen">
    <header className="border-b border-emerald-900/10 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5">
        <div><p className="text-sm font-semibold text-leaf">PWA local e auditável</p><h1 className="text-2xl font-bold tracking-normal text-ink">Monitoramento CISLAV</h1></div>
        <button onClick={addInvoice} className="focus-ring inline-flex items-center gap-2 rounded-md bg-leaf px-4 py-2 text-sm font-semibold text-white"><Plus size={18}/>Nova NF</button>
      </div>
    </header>

    <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-3">
        <Card title="Notas fiscais" icon={<FileText size={18}/>}>{invoices.map((invoice) => <button key={invoice.id} onClick={() => setSelectedId(invoice.id)} className={`mb-2 block w-full rounded-md border p-3 text-left text-sm ${selected?.id === invoice.id ? 'border-leaf bg-mint' : 'border-slate-200 bg-white'}`}><strong>{invoice.number}</strong><br/><span>{money.format(invoice.amount)}</span></button>)}</Card>
        <Card title="Fontes públicas" icon={<ExternalLink size={18}/>}>{publicSources.map((source) => <a key={source.url} className="mb-3 block rounded-md border border-slate-200 p-3 text-sm hover:bg-slate-50" href={source.url} target="_blank"><strong>{source.label}</strong><span className="mt-1 block text-xs text-slate-600">{source.note}</span></a>)}</Card>
      </aside>

      <section className="space-y-5">
        <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 bg-white p-2">
          <button onClick={() => setActiveTab('nfse')} className={`focus-ring inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${activeTab === 'nfse' ? 'bg-leaf text-white' : 'bg-slate-50 text-slate-700'}`}><FileText size={16}/>NFSe e responsabilidade</button>
          <button onClick={() => setActiveTab('prefeituras')} className={`focus-ring inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${activeTab === 'prefeituras' ? 'bg-leaf text-white' : 'bg-slate-50 text-slate-700'}`}><LayoutDashboard size={16}/>Dashboard prefeituras</button>
        </div>
        {activeTab === 'nfse' && <>
        <div className="grid gap-4 md:grid-cols-4">
          <Card title="NF atual" icon={<CalendarClock size={18}/>}><div className="text-xl font-bold">{selected?.number}</div><div className="text-sm text-slate-600">Limite: {formatDate(selectedDelay?.deadline)}</div>{selectedTone && <Pill tone={selectedTone.tone}>{selectedTone.label}</Pill>}</Card>
          <Card title="Atraso profissional" icon={<AlertTriangle size={18}/>}><div className="text-2xl font-bold">{selectedDelay?.calendar ?? 0} dias</div><p className="text-sm text-slate-600">{selectedDelay?.business ?? 0} dias úteis de atraso</p></Card>
          <Card title="Risco financeiro" icon={<Gauge size={18}/>}><div className="flex items-center gap-2"><span className="text-2xl font-bold">{metrics.risk.score}</span><Pill tone={metrics.risk.level}>{metrics.risk.level}</Pill></div><p className="text-sm text-slate-600">{metrics.risk.reason}</p></Card>
          <Card title="Médias" icon={<Banknote size={18}/>}><p className="text-sm">NFs: <strong>{metrics.avgNFDelay.toFixed(1)} dias</strong></p><p className="text-sm">Prefeituras: <strong>{metrics.avgTransferDelay.toFixed(1)} dias</strong></p></Card>
        </div>

        {selected && <Card title="Detalhes e cálculo da NF" icon={<FileText size={18}/>}>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">Número<input className="mt-1 w-full rounded-md border p-2" value={selected.number} onChange={(e) => updateSelected('number', e.target.value)}/></label>
            <label className="text-sm">CPF/CNPJ do prestador
              <div className="mt-1 flex gap-2">
                <input className="min-w-0 flex-1 rounded-md border p-2" value={selected.professionalDocument ?? ''} onChange={(e) => { updateSelected('professionalDocument', e.target.value); setProviderSearchFeedback('') }} placeholder="somente números ou formatado"/>
                <button type="button" onClick={searchProviderByDocument} className="focus-ring inline-flex items-center gap-2 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white"><Search size={16}/>Buscar</button>
              </div>
              {providerSearchFeedback && <span className="mt-1 block text-xs text-slate-600">{providerSearchFeedback}</span>}
            </label>
            <label className="text-sm">Prestador<input className="mt-1 w-full rounded-md border p-2" value={selected.professionalName} onChange={(e) => updateSelected('professionalName', e.target.value)} placeholder="Razão social ou nome"/></label>
            <label className="text-sm">Emissão<input type="date" className="mt-1 w-full rounded-md border p-2" value={selected.issueDate} onChange={(e) => updateSelected('issueDate', e.target.value)}/></label>
            <label className="text-sm">Aceite<input type="date" className="mt-1 w-full rounded-md border p-2" value={selected.acceptedDate} onChange={(e) => updateSelected('acceptedDate', e.target.value)}/></label>
            <label className="text-sm">Valor<input type="number" className="mt-1 w-full rounded-md border p-2" value={selected.amount} onChange={(e) => updateSelected('amount', Number(e.target.value))}/></label>
            <label className="text-sm">Prazo em dias úteis<input type="number" className="mt-1 w-full rounded-md border p-2" value={selected.contractualBusinessDays} onChange={(e) => updateSelected('contractualBusinessDays', Number(e.target.value))}/></label>
            <label className="text-sm">Multa %<input type="number" className="mt-1 w-full rounded-md border p-2" value={selected.penaltyRate ?? 0} onChange={(e) => updateSelected('penaltyRate', Number(e.target.value))}/></label>
            <label className="text-sm">Juros mensal %<input type="number" className="mt-1 w-full rounded-md border p-2" value={selected.monthlyInterestRate ?? 0} onChange={(e) => updateSelected('monthlyInterestRate', Number(e.target.value))}/></label>
          </div>
          <label className="mt-3 block text-sm">Base legal/contratual para multa e juros<textarea className="mt-1 min-h-20 w-full rounded-md border p-2" value={selected.legalBasis ?? ''} onChange={(e) => updateSelected('legalBasis', e.target.value)} placeholder="Cole a cláusula do contrato/aditivo ou referência do documento. Sem isso, o app não trata multa/juros como valor exigível."/></label>
          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-700">Municípios atendidos nesta NFSe</div>
              <button onClick={selectAllMunicipalities} className="focus-ring inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><CheckSquare size={16}/>Todos</button>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {seedMunicipalities.map((city) => {
                const checked = selected.municipalityIds.includes(city.id)
                return <label key={city.id} className={`flex items-center gap-2 rounded-md border p-2 text-sm ${checked ? 'border-leaf bg-mint' : 'border-slate-200 bg-white'}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleMunicipality(city.id)} />
                  <span>{city.name}</span>
                </label>
              })}
            </div>
            <div className="mt-2 text-xs text-slate-600">Selecionados: {selectedMunicipalityNames.join(', ')}</div>
          </div>
          <div className="mt-4 rounded-md bg-panel p-4 text-sm"><strong>Linha do tempo:</strong> NF emitida em {formatDate(selected.issueDate)}; aceita em {formatDate(selected.acceptedDate)}; contagem inicia no próximo dia útil; limite em {formatDate(selectedDelay?.deadline)}. {selectedTone?.message}</div>
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Competência e caixa:</strong> a NFSe emitida em {selectedCashMonth} representa atendimentos de {selectedServiceMonth}, mas o risco de fluxo de caixa é comparado com os repasses de {selectedCashMonth}, mês em que a NFSe entrou para cobrança. O aceite define apenas o prazo de pagamento ao profissional.</div>
        </Card>}

        {selected && <Card title="Produção assistencial importada" icon={<Upload size={18}/>}>
          <div className={`mb-3 rounded-md p-3 text-sm ring-1 ${statusClass(productionTone)}`}>
            <strong>{productionTitle}:</strong> {selectedProductions.length
              ? `${selectedProductions.length} linha(s), total de ${money.format(selectedProductionTotal)} para a competência assistencial ${selectedServiceMonth}. Diferença contra a NF: ${money.format(productionDifference)}.`
              : 'Exporte no sistema do prestador em Faturamento > Gerar Planilha e cole aqui o CSV. Use preferencialmente Sintético, Empenho por Município ou Extrato Prestador.'}
          </div>
          <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="mb-2 text-sm text-slate-600">Cole CSV com cabeçalho. O app reconhece colunas como Município, Fornecedor, Profissional, Data, Procedimento, QTD, Valor, Valor Unitário e Valor Total. Dados de pacientes não são exibidos.</p>
              <textarea value={productionCsv} onChange={(event) => { setProductionCsv(event.target.value); setProductionImportFeedback('') }} className="min-h-28 w-full rounded-md border p-2 font-mono text-xs" placeholder={'Município;Fornecedor;Profissional;Data;Procedimento;QTD;Valor Total\nLavras;Clinica Exemplo;Dra. Exemplo;15/04/2026;Consulta;10;10000,00'} />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button onClick={importAssistentialProduction} className="focus-ring inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white"><Upload size={16}/>Importar produção</button>
                {selectedProductionMunicipalityIds.length > 0 && <button onClick={useProductionMunicipalities} className="focus-ring rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">usar municípios da produção</button>}
                {productionImportFeedback && <span className="text-xs text-slate-600">{productionImportFeedback}</span>}
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-sm font-semibold text-slate-700">Resumo desta NF</div>
              <div className="grid gap-2 text-sm">
                <div className="rounded border border-slate-200 bg-white p-2"><span className="block text-xs font-semibold uppercase text-slate-500">Total produção</span><strong>{money.format(selectedProductionTotal)}</strong></div>
                <div className="rounded border border-slate-200 bg-white p-2"><span className="block text-xs font-semibold uppercase text-slate-500">Municípios na produção</span>{selectedProductionMunicipalities.length ? selectedProductionMunicipalities.join(', ') : 'sem produção compatível'}</div>
                <div className="rounded border border-slate-200 bg-white p-2"><span className="block text-xs font-semibold uppercase text-slate-500">Base importada</span>{productions.length} linha(s) de produção no navegador</div>
              </div>
              {selectedProductions.length > 0 && <div className="mt-3 max-h-52 overflow-auto rounded border border-slate-200 bg-white">
                {selectedProductions.slice(0, 8).map((production) => <div key={production.id} className="border-b border-slate-100 p-2 text-xs last:border-b-0">
                  <strong>{production.municipalityName ?? 'Município não informado'}</strong> · {formatDate(production.serviceDate)} · {money.format(production.totalAmount)}
                  <span className="block text-slate-600">{production.procedureName ?? 'Procedimento não informado'} · QTD {production.quantity}</span>
                </div>)}
              </div>}
              <p className="mt-3 text-xs text-slate-600">Produção assistencial valida prestação/competência/municípios. Pagamento continua sendo conferido pelas despesas públicas do CISLAV.</p>
            </div>
          </div>
        </Card>}

        {selected && <Card title="Checagem na base CISLAV" icon={<CheckSquare size={18}/>}>
          <div className={`mb-3 rounded-md p-3 text-sm ring-1 ${statusClass(expenseAnalysis?.tone ?? 'gray')}`}><strong>{expenseAnalysis?.title}:</strong> {expenseAnalysis?.text}</div>
          {providerTimingStats && <div className="mb-3 grid gap-2 md:grid-cols-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-semibold uppercase text-slate-500">Emissão até empenho</div><div className="text-lg font-bold">{providerTimingStats.issueToCommitment.toFixed(1)} dias</div></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-semibold uppercase text-slate-500">Empenho até liquidação</div><div className="text-lg font-bold">{providerTimingStats.commitmentToLiquidation.toFixed(1)} dias</div></div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-semibold uppercase text-slate-500">Liquidação até pagamento</div><div className="text-lg font-bold">{providerTimingStats.liquidationToPayment.toFixed(1)} dias</div></div>
          </div>}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-sm font-semibold text-slate-700">Prestadores prováveis assistenciais</div>
              {likelyProviders.length ? <div className="space-y-2">{likelyProviders.map((provider) => <div key={provider.id} className="rounded border border-slate-200 bg-white p-2 text-xs">
                <div className="flex items-center justify-between gap-2"><strong className="text-sm">{provider.name}</strong><Pill tone={provider.confidence === 'alta' ? 'green' : provider.confidence === 'media' ? 'yellow' : 'gray'}>{provider.confidence}</Pill></div>
                <div className="mt-1 text-slate-600">{provider.city ? `${provider.city} · ` : ''}{provider.evidence}</div>
              </div>)}</div> : <p className="text-sm text-slate-600">Nenhum prestador provável encontrado com os dados atuais.</p>}
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-sm font-semibold text-slate-700">Despesas CISLAV compatíveis</div>
              {expenseMatches.length ? <div className="space-y-2">{expenseMatches.map((expense) => {
                const delay = expenseDelay(expense, today)
                const open = expenseOpenAmount(expense)
                const exact = selected ? expenseExactMatch(expense, selected) : false
                return <div key={expense.id} className="rounded border border-slate-200 bg-white p-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{expense.commitmentNumber}</strong><div className="flex flex-wrap gap-1"><Pill tone={exact ? 'green' : 'yellow'}>{exact ? 'match da NF' : 'candidato'}</Pill><Pill tone={open > 0 ? 'red' : delay > 0 ? 'yellow' : 'green'}>{open > 0 ? 'saldo em aberto' : delay > 0 ? 'pago com atraso' : 'pago'}</Pill></div></div>
                  <div className="mt-1 text-slate-700">{expense.creditorName}</div>
                  <div className="mt-1 grid gap-1 text-slate-600 md:grid-cols-2">
                    <span>NF: {expense.invoiceNumber ?? '-'}</span>
                    <span>Emissão NF: {formatDate(expense.invoiceIssueDate)}</span>
                    <span>Empenho: {formatDate(expense.issueDate)}</span>
                    <span>Liquidação: {formatDate(expense.liquidationDate)}</span>
                    <span>Pagamento: {formatDate(expense.paymentDate)}</span>
                    <span>Fonte: {expense.fundingSource ?? '-'}</span>
                    <span>Pago: {money.format(expense.paidAmount ?? 0)}</span>
                    <span>Aberto: {money.format(open)}</span>
                  </div>
                  <div className="mt-1 text-slate-600">Limite operacional: {formatDate(expenseDeadline(expense))}; atraso calculado: {delay} dia(s).</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={() => useExpenseAsInvoice(expense)} className="focus-ring rounded-md bg-leaf px-3 py-1 text-xs font-semibold text-white">usar esta NF</button>
                    {expense.sourceUrl && <a className="inline-block rounded-md border border-slate-300 px-3 py-1 text-leaf underline" href={expense.sourceUrl} target="_blank">abrir fonte</a>}
                  </div>
                </div>
              })}</div> : <p className="text-sm text-slate-600">Nenhuma despesa importada bateu com CPF/CNPJ, razão social, número da NF ou mês de emissão.</p>}
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-600">Esta checagem usa uma base inicial. O ideal é o cron importar diariamente o relatório de despesas do CISLAV e preencher CPF/CNPJ, NF e histórico quando o portal disponibilizar esses campos na lupa/detalhe.</p>
        </Card>}

        <Card title="Multa, juros e obrigações" icon={<Scale size={18}/>}>
          <div className={`mb-3 rounded-md p-3 text-sm ring-1 ${statusClass(responsibility.tone)}`}><strong>{responsibility.title}:</strong> {responsibility.text}</div>
          {penalty?.enabled ? <p>A NF {selected?.number} está com {selectedDelay?.calendar} dias de atraso. Com base registrada, estimativa: multa de <strong>{money.format(penalty.penalty)}</strong> e juros proporcionais de <strong>{money.format(penalty.interest)}</strong>.</p> : <p>O app não afirma multa ou juros sem cláusula/documento registrado. Preencha a base contratual da NF para ativar a estimativa e mantenha a conferência jurídica/documental separada do cálculo.</p>}
          <p className="mt-2 text-sm text-slate-600">{allLinkedPaid ? `As prefeituras relacionadas a esta NF aparecem em dia no mês de emissão (${selectedCashMonth}), fortalecendo o argumento administrativo de que o pagamento ao profissional não deveria estar represado por falta de repasse municipal identificado.` : `Há repasses pendentes, atrasados ou sem evidência suficiente no mês de emissão (${selectedCashMonth}). O app separa atraso do consórcio e atraso municipal para qualificar a cobrança.`}</p>
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <strong>NFs do CISLAV contra prefeituras no mês de emissão:</strong> {selectedMunicipalInvoiceEvidence.length ? `${selectedMunicipalInvoiceEvidence.length} NF(s) encontrada(s) para os municípios selecionados.` : 'nenhuma NF municipal encontrada nos dados importados para os municípios selecionados.'}
            {selectedMunicipalitiesWithoutInvoice.length > 0 && <span className="mt-1 block text-amber-900">Sem NF municipal encontrada: {selectedMunicipalitiesWithoutInvoice.map((id) => seedMunicipalities.find((city) => city.id === id)?.name ?? id).join(', ')}. Nesses casos o app não deve tratar a prefeitura como atrasada só pela ausência de repasse.</span>}
            {selectedMunicipalInvoiceEvidence.length > 0 && <div className="mt-2 grid gap-2 md:grid-cols-2">{selectedMunicipalInvoiceEvidence.slice(0, 6).map((nf) => <div key={`${nf.municipalityId}-${nf.commitmentNumber}-${nf.invoiceNumber}`} className="rounded border border-slate-200 bg-white p-2 text-xs">
              <strong>{nf.municipality}</strong> · NF {nf.invoiceNumber ?? '-'} · {money.format(nf.amount)}
              <span className="block text-slate-600">Emissão {formatDate(nf.issueDate)} · vencimento {formatDate(nf.dueDate)} · pagamento {formatDate(nf.paymentDate)}</span>
            </div>)}</div>}
          </div>
          <p className="mt-2 text-sm text-slate-600">Contratos de rateio analisados indicam uso para despesas administrativas/operacionais e separam procedimentos assistenciais em instrumentos próprios. Por isso, o app não presume compensação automática de recursos de uma cidade para quitar obrigação de outra sem registro formal e base documental.</p>
          <p className="mt-2 text-sm text-slate-600">NFs do CISLAV contra prefeituras: quando o portal municipal expõe `notasFiscais`, o app usa emissão, vencimento e pagamento como evidência primária. Sem NF emitida/localizada, a prefeitura não deve ser marcada como atrasada apenas pela ausência de repasse.</p>
          {divergentLinkedTransfers.length > 0 && <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"><strong>Divergência nos dados vinculados:</strong> {divergentLinkedTransfers.map((transfer) => transfer.divergenceNote).filter(Boolean).join(' ')}</div>}
        </Card>

        <Card title="Cobertura da conciliação municipal" icon={<CheckSquare size={18}/>}>
          <p className="mb-3 text-sm text-slate-600">O mesmo caminho é tentado para todos. Quando o portal municipal é impraticável ou bloqueia extração, o app usa os dados do CISLAV como fonte primária e marca ausência de conciliação municipal.</p>
          <div className="grid gap-2 md:grid-cols-3">
            {municipalAudit.map((audit) => {
              const city = seedMunicipalities.find((item) => item.id === audit.id)
              const tone = audit.status === 'conciliado' || audit.status === 'importação CSV' ? 'green' : audit.status === 'divergente' ? 'red' : 'yellow'
              return <div key={audit.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2"><strong className="text-sm">{city?.name ?? audit.id}</strong><Pill tone={tone}>{audit.status}</Pill></div>
                <div className="mt-1 text-xs text-slate-600">{audit.source}</div>
                <div className="mt-1 text-xs text-slate-600">{audit.nfCount ? `${audit.nfCount} registro(s) municipal(is) encontrado(s)` : 'Sem dado municipal conciliável'}</div>
                <div className="mt-2 text-xs text-slate-700">{audit.note}</div>
              </div>
            })}
          </div>
        </Card>

        <Card title="Repasses municipais" icon={<Banknote size={18}/>}>
          <div className="mb-4 grid gap-2 md:grid-cols-3">
            {transferTotals.map((item) => <div key={item.city.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold uppercase text-slate-500">{item.city.name}</div>
              <div className="text-lg font-bold">{money.format(item.total)}</div>
              <div className="text-xs text-slate-600">{item.count} repasse(s): {item.dates.map((date) => formatDate(date)).join(', ')}</div>
            </div>)}
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1120px] border-collapse text-sm"><thead><tr className="border-b text-left"><th className="p-2">Município</th><th>Competência</th><th>Resumo</th><th>Previsto</th><th>Pago</th><th>Limite crítico</th><th>Repasse</th><th>Status</th><th>Atraso</th><th>Fonte</th></tr></thead><tbody>{transferGroups.map((group) => { const expanded = expandedTransferGroups.includes(group.key); const groupStatus = group.rows.some((transfer) => transferStatus(transfer, today) === 'overdue') ? 'overdue' : group.rows.every((transfer) => transferStatus(transfer, today) === 'paid') ? 'paid' : 'within_deadline'; const groupDelay = Math.max(...group.rows.map((transfer) => transferDelay(transfer, today))); const strictDeadline = selected ? group.rows.map((transfer) => stricterMunicipalDeadline(transfer, selected.acceptedDate)).sort((a, b) => a.getTime() - b.getTime())[0] : undefined; return <Fragment key={group.key}><tr className={`border-b align-top ${group.divergenceNote ? 'bg-red-50/60' : ''}`}><td className="p-2"><button onClick={() => toggleTransferGroup(group.key)} className="focus-ring inline-flex items-center gap-1 rounded px-1 py-1 text-left font-semibold text-slate-800">{expanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>} {group.cityName}</button>{group.divergenceNote && <span className="mt-1 block"><Pill tone="red">divergência</Pill></span>}</td><td>{group.competence}</td><td className="max-w-[320px] pr-3 text-xs text-slate-700">{group.rows.length} repasse(s) no mês<span className="mt-1 block text-slate-500">{group.rows.map((transfer) => transferKind(transfer)).filter((kind, index, list) => list.indexOf(kind) === index).join(' + ')}</span>{group.divergenceNote && <span className="mt-1 block font-semibold text-red-800">{group.divergenceNote}</span>}</td><td>{money.format(group.expected)}</td><td>{group.paid ? money.format(group.paid) : '-'}</td><td>{formatDate(strictDeadline)}</td><td>{formatDate(group.lastPaidAt)}</td><td><Pill tone={groupStatus}>{groupStatus === 'paid' ? 'pago' : groupStatus === 'within_deadline' ? 'no prazo' : 'atrasado'}</Pill></td><td>{groupDelay} dias</td><td>{group.rows[0]?.sourceUrl ? <a className="text-leaf underline" href={group.rows[0].sourceUrl} target="_blank">abrir</a> : '-'}</td></tr>{expanded && group.rows.map((transfer) => { const status = transferStatus(transfer, today); const detailDeadline = selected ? stricterMunicipalDeadline(transfer, selected.acceptedDate) : undefined; return <tr key={transfer.id} className="border-b bg-slate-50 align-top text-xs"><td className="p-2 pl-8 text-slate-600">{group.cityName}</td><td>{transfer.competence}</td><td className="max-w-[320px] pr-3 text-slate-700">{transfer.sourceDocument}<span className="mt-1 block text-slate-500">{transfer.notes}</span></td><td>{money.format(transfer.expectedAmount ?? 0)}</td><td>{transfer.paidAmount ? money.format(transfer.paidAmount) : '-'}</td><td>{formatDate(detailDeadline)}</td><td>{formatDate(transfer.paidAt)}</td><td><Pill tone={status}>{status === 'paid' ? 'pago' : status === 'within_deadline' ? 'no prazo' : 'atrasado'}</Pill></td><td>{transferDelay(transfer, today)} dias</td><td>{transfer.sourceUrl ? <a className="text-leaf underline" href={transfer.sourceUrl} target="_blank">abrir</a> : '-'}</td></tr> })}</Fragment> })}</tbody></table></div>
        </Card>
        </>}

        {activeTab === 'prefeituras' && <>
        <div className="grid gap-4 md:grid-cols-4">
          <Card title="Prefeituras" icon={<LayoutDashboard size={18}/>}><div className="text-2xl font-bold">{dashboardMunicipalities.length}</div><p className="text-sm text-slate-600">municípios no histórico</p></Card>
          <Card title="Meses" icon={<CalendarClock size={18}/>}><div className="text-2xl font-bold">{normalizedHistoricalSummaries.reduce((sum, city) => sum + Object.keys(city.months).length, 0)}</div><p className="text-sm text-slate-600">município/mês importados</p></Card>
          <Card title="Importado em" icon={<FileText size={18}/>}><div className="text-lg font-bold">{formatDate(historicalGeneratedAt.slice(0, 10))}</div><p className="text-sm text-slate-600">CISLAV + APIs municipais</p></Card>
          <Card title="Sem conciliação" icon={<AlertTriangle size={18}/>}><div className="text-2xl font-bold">{normalizedHistoricalSummaries.reduce((sum, city) => sum + Object.values(city.months).filter((month) => month.sourceStatus === 'cislav_apenas').length, 0)}</div><p className="text-sm text-slate-600">município/mês só CISLAV</p></Card>
        </div>
        <Card title="Status mensal por prefeitura desde 2024" icon={<LayoutDashboard size={18}/>}>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold text-slate-700">Período<select className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}>{years.map((year) => <option key={year} value={year}>{year === 'ultimos12' ? 'Últimos 12' : year === 'todos' ? 'Todos' : year}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Mês<select className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>{monthOptions.map((month) => <option key={month} value={month}>{month === 'todos' ? 'Todos' : month}</option>)}</select></label>
            <div className="flex flex-wrap gap-2 text-xs">
              <Pill tone="green">verde: em dia</Pill>
              <Pill tone="yellow">amarelo: no prazo</Pill>
              <Pill tone="red">vermelho: atrasado</Pill>
              <span className="inline-flex items-center rounded bg-slate-100 px-2 py-1 font-semibold text-slate-700 ring-1 ring-slate-200">cinza: sem dado importado</span>
              <Pill tone="yellow">somente CISLAV: sem conciliação municipal</Pill>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] border-collapse text-xs">
              <thead><tr className="border-b text-left"><th className="sticky left-0 z-10 min-w-40 bg-white p-2">Prefeitura</th><th className="sticky left-[160px] z-10 min-w-56 bg-white p-2">Resumo</th>{monthlyCityStatus[0]?.months.map((item) => <th key={item.month} className="min-w-20 whitespace-nowrap p-2 text-center">{item.month}</th>)}</tr></thead>
              <tbody>{monthlyCityStatus.map(({ city, months, cityRateioStatus, avgAssistentialDelay }) => <tr key={city.id} className="border-b"><td className="sticky left-0 z-10 min-w-40 whitespace-nowrap bg-white p-2 font-semibold">{city.name}</td><td className="sticky left-[160px] z-10 min-w-56 bg-white p-2">
                <div className="flex flex-col gap-1">
                  <Pill tone={cityRateioStatus === 'em dia' ? 'green' : cityRateioStatus === 'atrasado' ? 'red' : cityRateioStatus === 'no prazo' ? 'yellow' : 'gray'}>Rateio: {cityRateioStatus}</Pill>
                  {avgAssistentialDelay > 0 ? <span className="text-xs font-semibold text-red-800">Média assistencial: {avgAssistentialDelay.toFixed(1)} dias</span> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800"><CheckCircle2 size={14}/>Bom pagador</span>}
                </div>
              </td>{months.map((item) => {
                const rateioTone = item.rateioStatus === 'em dia' ? 'green' : item.rateioStatus === 'atrasado' ? 'red' : item.rateioStatus === 'no prazo' ? 'yellow' : 'gray'
                const assistTone = item.assistentialStatus === 'em dia' ? 'green' : item.assistentialStatus === 'atrasado' ? 'red' : 'gray'
                return <td key={item.month} className="p-1 align-top">
                  <div className={`rounded px-2 py-1 text-center ring-1 ${rateioTone === 'green' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : rateioTone === 'yellow' ? 'bg-amber-50 text-amber-900 ring-amber-200' : rateioTone === 'red' ? 'bg-red-50 text-red-800 ring-red-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}`}>R {item.rateioCount || '-'}</div>
                  <div className={`mt-1 rounded px-2 py-1 text-center ring-1 ${assistTone === 'green' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : assistTone === 'red' ? 'bg-red-50 text-red-800 ring-red-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}`}>A {item.assistentialTotalDelay ? `${item.assistentialTotalDelay}d` : item.assistentialCount || '-'}</div>
                </td>
              })}</tr>)}</tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-slate-600">Cada célula separa `R` de rateio e `A` de repasses assistenciais. Em `A`, o número com `d` representa o total de dias de atraso dos repasses daquele mês. A média fica apenas na coluna de resumo ao lado da prefeitura.</p>
        </Card>
        <Card title="Base legal para mora sem cláusula expressa" icon={<Scale size={18}/>}>
          <p className="text-sm text-slate-700">Ausência de percentual contratual de multa não significa ausência de consequência. A leitura operacional do app deve separar: multa contratual só se houver previsão; juros legais, correção monetária, perdas e danos e eventual responsabilização por inadimplemento podem decorrer da lei e da prova do atraso. A classificação como contrato leonino exige análise jurídica do desequilíbrio e das partes envolvidas; não é automática só porque a cláusula de multa/juros não foi escrita.</p>
        </Card>
        </>}

        <Card title="Importar CSV de repasses" icon={<Upload size={18}/>}>
          <p className="mb-2 text-sm text-slate-600">Formato: municipioId,competencia,valorPrevisto,valorPago,dataLimite,dataRepasse,fonte,documento</p>
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} className="min-h-24 w-full rounded-md border p-2 font-mono text-xs" placeholder="lavras,2026-06,5200,5200,2026-07-10,2026-07-08,https://...,Empenho 123"/>
          <button onClick={importCsv} className="focus-ring mt-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">Importar</button>
        </Card>

        <Card title="Contratos e documentos a conferir" icon={<Scale size={18}/>}>
          <div className="grid gap-3 md:grid-cols-2">{seedContracts.map((contract) => <a key={contract.id} href={contract.sourceUrl} target="_blank" className="rounded-md border border-slate-200 p-3 text-sm hover:bg-slate-50"><strong>{contract.title}</strong><span className="block text-slate-600">{contract.finding}</span><Pill tone={contract.supportsPenalty ? 'green' : 'yellow'}>{contract.supportsPenalty ? 'base de multa registrada' : 'conferir cláusula'}</Pill></a>)}</div>
        </Card>
      </section>
    </div>
  </main>
}
