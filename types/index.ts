export type InvoicePaymentStatus = 'pending' | 'paid' | 'partial' | 'disputed'
export type TransferStatus = 'paid' | 'within_deadline' | 'overdue' | 'unknown'
export type RiskLevel = 'baixo' | 'moderado' | 'alto' | 'critico'

export interface Municipality {
  id: string
  name: string
  state: string
  cityHallDocument?: string
  transparencyUrl?: string
  contractsUrl?: string
  expensesUrl?: string
  notes?: string
}

export interface Invoice {
  id: string
  number: string
  professionalName: string
  professionalDocument?: string
  issueDate: string
  acceptedDate: string
  contractualBusinessDays: number
  amount: number
  netAmount?: number
  serviceDescription?: string
  municipalityIds: string[]
  paymentStatus: InvoicePaymentStatus
  paymentDate?: string
  notes?: string
  penaltyRate?: number
  monthlyInterestRate?: number
  legalBasis?: string
  createdAt: string
  updatedAt: string
}

export interface MunicipalityTransfer {
  id: string
  municipalityId: string
  competence: string
  expectedAmount?: number
  paidAmount?: number
  transferDeadline: string
  deadlineRule?: 'ultimo_dia_util_competencia' | 'contrato_programa_15_corridos' | 'nf_21_dias_uteis' | 'manual'
  paidAt?: string
  sourceUrl?: string
  sourceDocument?: string
  notes?: string
  cislavRecordedAmount?: number
  municipalRecordedAmount?: number
  divergenceNote?: string
  createdAt: string
  updatedAt: string
}

export interface AssistanceProvider {
  id: string
  name: string
  document?: string
  city?: string
  source: 'relatorio_fornecedores_ativos' | 'despesa_cislav' | 'manual'
  evidence: string
  confidence: 'alta' | 'media' | 'baixa'
  activeOn?: string
}

export interface CislavExpense {
  id: string
  commitmentNumber: string
  creditorName: string
  creditorDocument?: string
  type: string
  biddingProcess?: string
  fundingSource?: string
  issueDate: string
  liquidationDate?: string
  paymentDate?: string
  committedAmount?: number
  liquidatedAmount?: number
  paidAmount?: number
  invoiceNumber?: string
  invoiceIssueDate?: string
  history?: string
  sourceUrl?: string
}

export interface ContractReference {
  id: string
  title: string
  kind: 'rateio' | 'prestacao_servico' | 'programa' | 'outro'
  relatedTo?: string
  sourceUrl: string
  finding: string
  verifiedAt: string
  supportsPenalty: boolean
  penaltyNotes?: string
}

export interface HistoricalMonthSummary {
  month: string
  cislavTotal: number
  municipalTotal: number
  rateioTotal: number
  assistentialTotal: number
  rateioDelayDays: number
  assistentialDelayDays: number
  rateioRows: number
  assistentialRows: number
  difference?: number
  sourceStatus: 'conciliado' | 'divergente' | 'cislav_apenas'
  nfs: Array<{
    municipio: string
    empenho?: string
    valor: number
    pagamento?: string
    notaFiscal?: string
    serie?: string
    emissao?: string
    vencimento?: string
    contrato?: string
    contratoInicio?: string
    contratoFim?: string
    historico?: string
    importSource?: string
  }>
}

export interface HistoricalMunicipalitySummary {
  municipalityId: string
  municipality: string
  months: Record<string, HistoricalMonthSummary>
}
