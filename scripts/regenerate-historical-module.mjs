import { readFileSync, writeFileSync } from 'node:fs'

const history = JSON.parse(readFileSync('data/historico-repasses-2024-2026.json', 'utf8'))
const compact = history.summary.map((city) => ({
  municipalityId: city.municipalityId,
  municipality: city.municipality,
  months: city.months,
}))

const content = `import type { HistoricalMunicipalitySummary } from '@/types'

export const historicalGeneratedAt = '${history.generatedAt}'
export const historicalSummaries: HistoricalMunicipalitySummary[] = ${JSON.stringify(compact, null, 2)}
`

writeFileSync('lib/historical-data.ts', content)
console.log(JSON.stringify({ generatedAt: history.generatedAt, municipalities: compact.length }, null, 2))
