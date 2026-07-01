import { addDays, differenceInCalendarDays, endOfMonth, format, isAfter, isBefore, isSameDay, parseISO, subDays } from 'date-fns'

export function parseDate(value: string): Date { return parseISO(`${value}T00:00:00`) }
export function formatDate(value?: string | Date): string { if (!value) return '-'; const date = typeof value === 'string' ? parseDate(value) : value; return format(date, 'dd/MM/yyyy') }
export function isBusinessDay(date: Date): boolean { const day = date.getDay(); return day !== 0 && day !== 6 }
export function calculateBusinessDeadline(acceptedDate: Date, businessDays: number, holidays: Date[] = []): Date {
  let current = acceptedDate
  let counted = 0
  while (counted < businessDays) {
    current = addDays(current, 1)
    const holiday = holidays.some((h) => isSameDay(h, current))
    if (isBusinessDay(current) && !holiday) counted += 1
  }
  return current
}
export function countBusinessDaysBetween(start: Date, end: Date): number {
  if (!isAfter(end, start)) return 0
  let current = addDays(start, 1)
  let total = 0
  while (isBefore(current, end) || isSameDay(current, end)) { if (isBusinessDay(current)) total += 1; current = addDays(current, 1) }
  return total
}
export function overdueDays(deadline: Date, reference: Date): number { return Math.max(0, differenceInCalendarDays(reference, deadline)) }
export function lastBusinessDayOfMonth(yearMonth: string): Date {
  const [year, month] = yearMonth.split('-').map(Number)
  let current = endOfMonth(new Date(year, month - 1, 1))
  while (!isBusinessDay(current)) current = subDays(current, 1)
  return current
}
