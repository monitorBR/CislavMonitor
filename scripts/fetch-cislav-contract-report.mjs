import { writeFileSync } from 'node:fs'

const pageUrl = 'https://pt.cislav.mg.gov.br/Contrato_e_Aditivos'
const html = await (await fetch(pageUrl)).text()
const tokenMatch = html.match(/SHA1_TOKEN=([a-f0-9]+)&INT_TOKEN=(\d+)/)
if (!tokenMatch) throw new Error('Nao foi possivel localizar token do relatorio de contratos.')
const [, sha1, intToken] = tokenMatch

const params = new URLSearchParams({
  INT_PAG: '1',
  CHAR_ID_EMP: '1',
  INT_EXR: '2026',
  INT_MES: '',
  Nome: '',
  ID8_LICI_COTR: '',
  ID11_COTR: '',
  ID8_CD_COTR: '',
  STR_N_ADTV_COTR: '',
  CPFCNPJ: '',
  Setor: '',
  LG_ATA_COTR: '',
  LG_ALT_PAG: 'S',
  URL: 'Contrato_e_Aditivos',
})

const startUrl = `https://pt.cislav.mg.gov.br/gerar_relatorio.php?Data=${Date.now()}&SHA1_TOKEN=${sha1}&INT_TOKEN=${intToken}`
const startResponse = await fetch(startUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: params,
})
const startText = await startResponse.text()
if (!startText.startsWith('001 - ')) throw new Error(`Falha ao iniciar relatorio: ${startText.slice(0, 500)}`)
const thread = startText.slice(6).trim()

let reportHtml = ''
for (let i = 0; i < 12; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  const pollUrl = `https://pt.cislav.mg.gov.br/gerar_relatorio.php?INT_THREAD=${encodeURIComponent(thread)}&SHA1_TOKEN=${sha1}&INT_TOKEN=${intToken}`
  const pollText = await (await fetch(pollUrl)).text()
  reportHtml = pollText
  if (!/Por favor, aguarde|Aguarde/i.test(pollText)) break
}

const waitThreadMatch = reportHtml.match(/Aguarda_Resultado_Thread\.php\?INT_THREAD=(\d+)/)
if (waitThreadMatch) {
  const waitThread = waitThreadMatch[1]
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const waitText = await (await fetch(`https://pt.cislav.mg.gov.br/Aguarda_Resultado_Thread.php?INT_THREAD=${waitThread}&DataHora=${Date.now()}`, { method: 'POST' })).text()
    if (waitText.startsWith('001 - ')) {
      const resultPath = waitText.slice(6).trim()
      reportHtml = await (await fetch(`https://pt.cislav.mg.gov.br/${resultPath.replace(/^\//, '')}`)).text()
      break
    }
    if (waitText.startsWith('000 - ')) {
      reportHtml = waitText
      break
    }
  }
}

writeFileSync('data/cislav-contratos-2026.html', reportHtml)
const text = reportHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
writeFileSync('data/cislav-contratos-2026.txt', text)
console.log(text.slice(0, 4000))
