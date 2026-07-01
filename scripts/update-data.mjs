import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

function run(command, args) {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('node', ['scripts/import-history-2024-2026.mjs'])

const lavrasCsv = process.env.LAVRAS_CSV_PATH ?? '/Users/pedrox/Downloads/analiticoEmpenhos (1).csv'
if (existsSync(lavrasCsv)) {
  run('node', ['scripts/import-lavras-csv.mjs', lavrasCsv])
} else {
  console.log(`Lavras CSV não encontrado em ${lavrasCsv}; mantendo histórico já importado.`)
}

const nepomucenoCsv = process.env.NEPOMUCENO_CSV_PATH ?? '/Users/pedrox/Downloads/Relatório padrão em coluna (Recomendado).csv'
if (existsSync(nepomucenoCsv)) {
  run('node', ['scripts/import-nepomuceno-csv.mjs', nepomucenoCsv])
} else {
  console.log(`Nepomuceno CSV não encontrado em ${nepomucenoCsv}; mantendo histórico já importado.`)
}

run('node', ['scripts/regenerate-historical-module.mjs'])
