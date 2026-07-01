# Descoberta de APIs e conciliação - Maio/2026

Data da verificação: 2026-06-30.

## APIs públicas encontradas

O portal do CISLAV possui API pública gratuita documentada em:

- https://pt.cislav.mg.gov.br/api/relatorios/manual_relatorios

Endpoints úteis:

- Receitas do CISLAV: `GET /api/relatorios/receita?unidade_gestora=1&exercicio=2026&mes_inicial=05&mes_final=05`
- Despesas municipais em portais SH3: `GET /api/relatorios/despesa?unidade_gestora=1&exercicio=2026&data_de_pagamento_inicial=2026-05-01&data_de_pagamento_final=2026-05-31&credor=CISLAV`

O portal declara retorno JSON padronizado com `erros`, `mensagens` e `resultado`.

## Repasses identificados no CISLAV em Maio/2026

Arquivo gerado:

- `data/cislav-repasses-2026-05-05.json`
- `data/cislav-repasses-2026-05-05.csv`

Resultado da coleta no CISLAV:

- 318 receitas no mês.
- 25 receitas classificadas como repasses municipais por histórico contendo `REPASSE FINANCEIRO` e `PM`.
- Municípios encontrados: Bom Sucesso, Carrancas, Ibituruna, Ijaci, Ingaí, Itumirim, Itutinga, Lavras, Luminárias, Nazareno, Nepomuceno e Ribeirão Vermelho.

## Conciliação em portais municipais SH3

Arquivo gerado:

- `data/conciliacao-sh3-2026-05.json`

Municípios com API SH3 pública localizada e conciliada:

| Município | Portal municipal | Total CISLAV | Total prefeitura | Diferença | Datas conciliadas |
|---|---|---:|---:|---:|---|
| Ibituruna | https://pt.ibituruna.mg.gov.br | 79.755,62 | 79.755,62 | 0,00 | 2026-05-08 |
| Ijaci | https://transparencia.ijaci.mg.gov.br | 151.896,40 | 151.896,40 | 0,00 | 2026-05-14 |
| Ingaí | https://pt.ingai.mg.gov.br | 48.674,96 | 48.674,96 | 0,00 | 2026-05-08, 2026-05-19, 2026-05-20 |
| Itumirim | https://pt.itumirim.mg.gov.br | 116.750,08 | 116.750,08 | 0,00 | 2026-05-11, 2026-05-20 |
| Luminárias | https://pt.luminarias.mg.gov.br | 195.903,05 | 195.903,05 | 0,00 | 2026-05-05, 2026-05-12, 2026-05-21 |
| Nazareno | https://pt.nazareno.mg.gov.br | 4.151,48 | 4.151,48 | 0,00 | 2026-05-05 |

Conclusão parcial: para esses seis municípios, Maio/2026 está coerente entre despesa municipal paga ao CISLAV e receita registrada pelo CISLAV, por total e por datas de pagamento/arrecadação.

## Pendências

Portais ainda sem conector automático confirmado:

- Bom Sucesso: site oficial aponta para Memory/iLAI e dados abertos do TCE-MG, não para SH3.
- Carrancas: host SH3 não localizado nos padrões testados.
- Itutinga: site institucional usa SH3, mas o host/rota de transparência API precisa descoberta específica.
- Lavras: site oficial redireciona para `https://sistemas.lavras.mg.gov.br/portalcidadao`; precisa conector próprio.
- Nepomuceno: host SH3 não localizado nos padrões testados.
- Ribeirão Vermelho: host SH3 não localizado nos padrões testados.

Próximo passo recomendado: criar conectores por fornecedor de portal:

1. SH3 API, já validado.
2. Memory/iLAI, para Bom Sucesso.
3. Portal Cidadão de Lavras.
4. Consulta agregada TCE-MG, se o endpoint público consumido pelo frontend for identificado.
