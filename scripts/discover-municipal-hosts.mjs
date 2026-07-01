const slugs = ['bom-sucesso','carrancas','ibituruna','ijaci','ingai','itumirim','itutinga','lavras','luminarias','nazareno','nepomuceno','ribeirao-vermelho']
const candidatesFor = (slug) => [
  `https://pt.${slug}.mg.gov.br/api/relatorios/manual_relatorios`,
  `https://transparencia.${slug}.mg.gov.br/api/relatorios/manual_relatorios`,
  `https://www.${slug}.mg.gov.br/api/relatorios/manual_relatorios`,
]
for (const slug of slugs) {
  const found = []
  for (const url of candidatesFor(slug)) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 7000)
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      const text = await response.text()
      if (response.ok && /Manual da API de Relat/.test(text)) found.push(url.replace('/api/relatorios/manual_relatorios', ''))
    } catch {}
  }
  console.log(`${slug}: ${found.length ? found.join(', ') : 'sem host SH3 nos candidatos testados'}`)
}
