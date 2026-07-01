'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Banknote, CalendarClock, CheckCircle2, CheckSquare, ChevronDown, ChevronRight, ExternalLink, FileText, Gauge, LayoutDashboard, Plus, Scale, Upload } from 'lucide-react'
import { average, invoiceDelay, invoiceTone, penaltyEstimate, riskLevel, stricterMunicipalDeadline, transferDelay, transferStatus } from '@/lib/calculations'
import { contracts as seedContracts, invoices as seedInvoices, municipalities as seedMunicipalities, publicSources, transfers as seedTransfers } from '@/lib/sample-data'
import { historicalGeneratedAt, historicalSummaries } from '@/lib/historical-data'
import { formatDate } from '@/lib/date-utils'
import type { Invoice, MunicipalityTransfer } from '@/types'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const today = new Date()
const stateVersion = '2026-06-cash-impact-by-issue-month'
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
  const [activeTab, setActiveTab] = useState<'nfse' | 'prefeituras'>('nfse')
  const [selectedYear, setSelectedYear] = useState('ultimos12')
  const [selectedMonth, setSelectedMonth] = useState('todos')
  const [expandedTransferGroups, setExpandedTransferGroups] = useState<string[]>([])

  useEffect(() => {
    const stored = localStorage.getItem('cislav-monitor-state')
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.version === stateVersion) {
        setInvoices(parsed.invoices ?? seedInvoices); setTransfers(parsed.transfers ?? seedTransfers); setSelectedId(parsed.invoices?.[0]?.id ?? seedInvoices[0]?.id ?? '')
      }
    }
  }, [])
  useEffect(() => { localStorage.setItem('cislav-monitor-state', JSON.stringify({ version: stateVersion, invoices, transfers })) }, [invoices, transfers])

  const selected = invoices.find((invoice) => invoice.id === selectedId) ?? invoices[0]
  const selectedCashMonth = selected ? monthFromDate(selected.issueDate) : ''
  const selectedServiceMonth = selectedCashMonth ? previousMonth(selectedCashMonth) : ''
  const selectedTransfers = selected ? transfers.filter((transfer) => selected.municipalityIds.includes(transfer.municipalityId)) : []
  const selectedCashTransfers = selected ? selectedTransfers.filter((transfer) => transfer.competence === selectedCashMonth) : []
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
  const delayedLinkedTransfers = selectedCashTransfers.filter((transfer) => transferStatus(transfer, today) === 'overdue')
  const divergentLinkedTransfers = selectedCashTransfers.filter((transfer) => transfer.divergenceNote)
  const responsibility = selectedDelay && selected && selectedDelay.calendar > 0 && selected.paymentStatus !== 'paid'
    ? delayedLinkedTransfers.length > 0
      ? { tone: 'yellow', title: 'Responsabilidade provável compartilhada', text: `Há atraso da NF e ${delayedLinkedTransfers.length} repasse(s) vinculado(s) também aparecem atrasados ou sem pagamento. Possíveis responsáveis: municípios vinculados com pendência e CISLAV pela gestão/repasse ao profissional.` }
      : { tone: 'red', title: 'Responsabilidade provável do CISLAV', text: 'A NF está atrasada e os repasses dos municípios selecionados aparecem pagos ou sem atraso cadastrado. Com os dados disponíveis, o gargalo fica no CISLAV.' }
    : { tone: 'green', title: 'Sem atraso da NF selecionada', text: 'A NF selecionada não está vencida pelos parâmetros cadastrados.' }

  function updateSelected<K extends keyof Invoice>(key: K, value: Invoice[K]) { if (!selected) return; setInvoices((items) => items.map((item) => item.id === selected.id ? { ...item, [key]: value, updatedAt: new Date().toISOString() } : item)) }
  function toggleMunicipality(municipalityId: string) {
    if (!selected) return
    const ids = selected.municipalityIds.includes(municipalityId) ? selected.municipalityIds.filter((id) => id !== municipalityId) : [...selected.municipalityIds, municipalityId]
    updateSelected('municipalityIds', ids.length ? ids : [municipalityId])
  }
  function selectAllMunicipalities() { if (selected) updateSelected('municipalityIds', seedMunicipalities.map((city) => city.id)) }
  function toggleTransferGroup(key: string) { setExpandedTransferGroups((items) => items.includes(key) ? items.filter((item) => item !== key) : [...items, key]) }
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

        <Card title="Multa, juros e obrigações" icon={<Scale size={18}/>}>
          <div className={`mb-3 rounded-md p-3 text-sm ring-1 ${statusClass(responsibility.tone)}`}><strong>{responsibility.title}:</strong> {responsibility.text}</div>
          {penalty?.enabled ? <p>A NF {selected?.number} está com {selectedDelay?.calendar} dias de atraso. Com base registrada, estimativa: multa de <strong>{money.format(penalty.penalty)}</strong> e juros proporcionais de <strong>{money.format(penalty.interest)}</strong>.</p> : <p>O app não afirma multa ou juros sem cláusula/documento registrado. Preencha a base contratual da NF para ativar a estimativa e mantenha a conferência jurídica/documental separada do cálculo.</p>}
          <p className="mt-2 text-sm text-slate-600">{allLinkedPaid ? `As prefeituras relacionadas a esta NF aparecem em dia no mês de emissão (${selectedCashMonth}), fortalecendo o argumento administrativo de que o pagamento ao profissional não deveria estar represado por falta de repasse municipal identificado.` : `Há repasses pendentes, atrasados ou sem evidência suficiente no mês de emissão (${selectedCashMonth}). O app separa atraso do consórcio e atraso municipal para qualificar a cobrança.`}</p>
          <p className="mt-2 text-sm text-slate-600">Contratos de rateio analisados indicam uso para despesas administrativas/operacionais e separam procedimentos assistenciais em instrumentos próprios. Por isso, o app não presume compensação automática de recursos de uma cidade para quitar obrigação de outra sem registro formal e base documental.</p>
          <p className="mt-2 text-sm text-slate-600">NFs do CISLAV contra prefeituras: os portais municipais podem expor esse dado dentro das despesas. Em Carrancas, a API retornou `notasFiscais` com NFSe 5792, emissão 18/05/2026, vinculada ao contrato de programa.</p>
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
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Carrancas: a receita do CISLAV registra R$ 225.225,56 em maio, com R$ 4.151,48 em rateio no dia 15/05 e R$ 221.074,08 em programa no dia 29/05. O print do portal municipal mostra R$ 224.591,63; a API municipal por nome completo também retorna uma linha adicional de R$ 633,93 que pode não aparecer nesse filtro visual.</div>
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
