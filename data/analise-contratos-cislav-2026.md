# Analise dos contratos CISLAV 2026

Verificado em 2026-06-30.

## Fontes consultadas

- Manual/API do portal de transparencia: https://pt.cislav.mg.gov.br/api/relatorios/manual_relatorios
- Receita CISLAV maio/2026: https://pt.cislav.mg.gov.br/api/relatorios/receita?unidade_gestora=1&exercicio=2026&mes_inicial=05&mes_final=05
- Busca institucional por rateio: https://cislav.mg.gov.br/ws_consulta/Buscar.php?STR_BSC=rateio
- Busca institucional por programa: https://cislav.mg.gov.br/ws_consulta/Buscar.php?STR_BSC=programa
- Estatuto Social: https://cislav.mg.gov.br/Especifico_Cliente/03735788000172/Arquivos///Leis/Estatuto_Cislav_Novo.pdf

## Documentos baixados

Os PDFs foram salvos em `data/docs-cislav-2026/` e convertidos para `.txt` para pesquisa. Foram baixados contratos de rateio/programa 2026 de Bom Sucesso, Ibituruna, Ijaci, Itumirim, Lavras, Luminarias, Nazareno, Nepomuceno e Ribeirao Vermelho, alem do Estatuto.

## Regras encontradas

1. Contratos de programa 2026

Nos contratos de programa analisados, a clausula de valores e pagamentos preve:

- pagamento pelo municipio ao CISLAV em ate 15 dias corridos apos a prestacao do servico em conformidade e recebimento da nota fiscal pelo municipio;
- pagamento diretamente na conta da contratada indicada no contrato;
- pagamentos em conta diversa nao sao considerados quitados;
- em atraso, atualizacao monetaria pelo IPCA pro rata die e juros moratorios de 1% ao mes, incidentes do dia seguinte ao vencimento ate o efetivo pagamento;
- possibilidade de suspensao dos servicos quando houver inadimplemento superior a 30 dias e retomada condicionada ao pagamento dos debitos.

Essa regra foi identificada, por exemplo, nos textos extraidos de `programa-2026-itumirim.txt`, `programa-2026-ibituruna.txt`, `programa-2026-nazareno.txt` e `programa-2026-nepomuceno.txt`.

2. Contratos de rateio 2026

Nos contratos de rateio analisados:

- o pagamento deve ocorrer exclusivamente por deposito em conta bancaria do CISLAV, identificado por competencia e municipio;
- atraso gera atualizacao monetaria;
- atraso superior a 60 dias permite procedimento administrativo simplificado e eventual suspensao de prestacoes;
- inadimplencia superior a 120 dias pode levar ao desligamento do municipio, mediante decisao motivada da Assembleia Geral;
- os recursos do rateio cobrem despesas administrativas e operacionais do CISLAV;
- o contrato de rateio nao se confunde com custos de procedimentos assistenciais, que devem ser tratados em instrumentos proprios;
- saldo financeiro remanescente pode ser considerado para compensacao financeira apenas se apurado, reconhecido pelos setores competentes e formalmente registrado, sem gerar compensacao automatica.

3. Uso de recursos de uma cidade para quitar outra

Pelos trechos analisados, nao foi encontrada autorizacao expressa para o CISLAV usar automaticamente recursos pagos por uma cidade para quitar obrigacoes assistenciais de outra e depois alegar falta de caixa por inadimplencia cruzada.

O achado mais relevante aponta o contrario como cautela operacional: rateio cobre despesas administrativas/operacionais, procedimentos assistenciais ficam em instrumentos proprios, e compensacoes exigem apuracao/reconhecimento/registro formal. Portanto, no app a conciliacao deve manter trilhas separadas por municipio, competencia, fonte de recurso e instrumento contratual.

## Regra operacional aplicada no app

- NF de profissional: o app mantem a regra parametrizavel de 21 dias uteis apos aprovacao/aceite da NFS, porque essa regra depende da contratacao especifica do profissional/fornecedor.
- Repasses municipais de competencia maio/2026: o app compara o repasse com o ultimo dia util da competencia, que em maio/2026 foi 29/05/2026.
- Contratos de programa: quando houver NF recebida pelo municipio, o app tambem considera a regra encontrada de 15 dias corridos.
- O campo "limite critico" mostra a data mais restritiva entre limite cadastrado, ultimo dia util da competencia e regra de 15 dias corridos quando aplicavel.

## Pendencias de auditoria

- Validar todos os municipios conveniados que nao tiveram API municipal SH3 localizada por padroes simples.
- Extrair as NFs/aceites reais de maio/2026 para aplicar a regra de 15 dias corridos ou 21 dias uteis com data de aceite comprovada.
- Conferir a contratacao especifica dos profissionais/fornecedores para saber se ha multa alem dos juros/correcao. Nos contratos de programa Municipio -> CISLAV, a regra achada foi IPCA + juros de 1% ao mes.
