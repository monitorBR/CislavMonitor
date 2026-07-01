import { addDays, differenceInCalendarDays, isBefore } from 'date-fns'
import type { Invoice, MunicipalityTransfer, RiskLevel } from '@/types'
import { calculateBusinessDeadline, countBusinessDaysBetween, lastBusinessDayOfMonth, overdueDays, parseDate } from './date-utils'

export function invoiceDeadline(invoice: Invoice): Date { return calculateBusinessDeadline(parseDate(invoice.acceptedDate), invoice.contractualBusinessDays) }
export function invoiceDelay(invoice: Invoice, reference = new Date()) {
  const deadline = invoiceDeadline(invoice)
  const comparison = invoice.paymentDate ? parseDate(invoice.paymentDate) : reference
  const calendar = overdueDays(deadline, comparison)
  const business = countBusinessDaysBetween(deadline, comparison)
  return { deadline, calendar, business }
}
export function invoiceTone(invoice: Invoice, reference = new Date()) {
  const { deadline, business, calendar } = invoiceDelay(invoice, reference)
  if (invoice.paymentStatus === 'paid' && calendar === 0) return { tone: 'green', label: 'Paga no prazo', message: 'Esta NF foi paga dentro do prazo contratual.' }
  if (calendar > 0 && invoice.paymentStatus !== 'paid') return { tone: 'red', label: 'Atrasada', message: `Esta NF está com ${calendar} dias corridos e ${business} dias úteis de atraso.` }
  const remaining = countBusinessDaysBetween(reference, deadline)
  if (remaining <= 5) return { tone: 'yellow', label: 'Próxima do limite', message: 'Esta NF ainda está dentro do prazo, mas próxima do limite contratual.' }
  return { tone: 'green', label: 'Dentro do prazo', message: 'Esta NF ainda está dentro do prazo contratual.' }
}
export function transferDelay(transfer: MunicipalityTransfer, reference = new Date()) {
  const deadline = parseDate(transfer.transferDeadline)
  const comparison = transfer.paidAt ? parseDate(transfer.paidAt) : reference
  return Math.max(0, differenceInCalendarDays(comparison, deadline))
}
export function expectedMunicipalDeadline(transfer: MunicipalityTransfer, nfAcceptedDate?: string) {
  if (transfer.deadlineRule === 'ultimo_dia_util_competencia') return lastBusinessDayOfMonth(transfer.competence)
  if (transfer.deadlineRule === 'contrato_programa_15_corridos' && nfAcceptedDate) return addDays(parseDate(nfAcceptedDate), 15)
  if (transfer.deadlineRule === 'nf_21_dias_uteis' && nfAcceptedDate) return calculateBusinessDeadline(parseDate(nfAcceptedDate), 21)
  return parseDate(transfer.transferDeadline)
}
export function stricterMunicipalDeadline(transfer: MunicipalityTransfer, nfAcceptedDate?: string) {
  const manual = parseDate(transfer.transferDeadline)
  const competence = lastBusinessDayOfMonth(transfer.competence)
  const program = nfAcceptedDate ? addDays(parseDate(nfAcceptedDate), 15) : manual
  return [manual, competence, program].reduce((earliest, item) => isBefore(item, earliest) ? item : earliest)
}
export function transferStatus(transfer: MunicipalityTransfer, reference = new Date()) {
  if (transfer.paidAt || ((transfer.paidAmount ?? 0) >= (transfer.expectedAmount ?? Number.POSITIVE_INFINITY))) return 'paid'
  if (differenceInCalendarDays(reference, parseDate(transfer.transferDeadline)) <= 0) return 'within_deadline'
  return 'overdue'
}
export function penaltyEstimate(invoice: Invoice, reference = new Date()) {
  const delay = invoiceDelay(invoice, reference).calendar
  if (delay === 0 || !invoice.legalBasis) return { penalty: 0, interest: 0, enabled: false }
  const penalty = invoice.amount * ((invoice.penaltyRate ?? 0) / 100)
  const interest = invoice.amount * ((invoice.monthlyInterestRate ?? 0) / 100) * (delay / 30)
  return { penalty, interest, enabled: Boolean(invoice.penaltyRate || invoice.monthlyInterestRate) }
}
export function average(values: number[]) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0 }
export function riskLevel(avgNFDelay: number, avgTransferDelay: number, overdueRatio: number): { level: RiskLevel; score: number; reason: string } {
  const score = Math.round(avgNFDelay * 1.7 + avgTransferDelay * 1.1 + overdueRatio * 45)
  if (score >= 85) return { level: 'critico', score, reason: 'Atrasos recorrentes e alta proporção de obrigações vencidas.' }
  if (score >= 55) return { level: 'alto', score, reason: 'Fluxo pressionado, com atrasos relevantes na série cadastrada.' }
  if (score >= 25) return { level: 'moderado', score, reason: 'Há sinais de atenção, mas sem ruptura generalizada no histórico local.' }
  return { level: 'baixo', score, reason: 'Histórico local majoritariamente dentro do prazo.' }
}
