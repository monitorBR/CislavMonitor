# Plano para Codex — PWA Monitoramento CISLAV

## Objetivo do produto

Criar um PWA chamado **Monitoramento CISLAV** para ajudar profissionais prestadores de serviço a acompanhar prazos de pagamento de notas fiscais e verificar se os municípios relacionados aos pacientes atendidos já fizeram repasses ao Consórcio Intermunicipal de Saúde dos Municípios da Microrregião de Lavras - CISLAV.

O app deve permitir que o profissional informe:

- data de emissão da NF;
- data de aceite da NF;
- número da NF;
- valor da NF;
- município ou municípios de origem dos pacientes atendidos;
- prazo contratual em dias úteis, com padrão de 21 dias úteis;
- dados de repasse das prefeituras ao consórcio, via importação manual, CSV ou futuramente integração automática com portais de transparência.

Com isso, o app deve calcular:

- data limite contratual para pagamento;
- status do prazo da NF;
- quantidade de dias corridos de atraso do pagamento ao profissional;
- quantidade de dias úteis de atraso;
- média atual de atrasos das NFs cadastradas;
- status de repasse de cada prefeitura relacionada à NF;
- atraso médio dos repasses municipais;
- alerta positivo quando as prefeituras relacionadas ao profissional estiverem em dia.

---

## Contexto jurídico-operacional

O contrato citado pelo usuário prevê pagamento em até **21 dias úteis** após o aceite da nota fiscal. Portanto, o marco inicial do prazo é a **data de aceite da NF**, não necessariamente a data de emissão.

Exemplo real usado como caso de teste:

- Data de emissão da NF: informar pelo usuário.
- Data de aceite da NF: `12/05/2026`.
- Prazo contratual: `21 dias úteis`.
- Resultado esperado: o app deve calcular a data final dentro do prazo contratual e sinalizar atraso caso a data atual seja posterior à data limite.

Observação importante: o app deve deixar claro que o cálculo é uma ferramenta de controle administrativo e não substitui análise jurídica formal.

---

## Stack sugerida

Usar uma stack simples, moderna e fácil de publicar na Vercel.

### Frontend

- Next.js 14 ou superior
- React
- TypeScript
- Tailwind CSS
- Shadcn/UI ou componentes próprios simples
- date-fns para cálculo de datas
- Recharts para gráficos
- PWA com manifest e service worker

### Persistência inicial

Para MVP:

- LocalStorage ou IndexedDB para uso offline/local.

Para evolução:

- Supabase com tabelas para profissionais, NFs, municípios, contratos, repasses e anexos.

### Importação de dados

MVP:

- Importação CSV manual.
- Cadastro manual de repasses.
- Cadastro manual de municípios.
- Cadastro manual de contratos.

Evolução:

- Scraper/API proxy para portais de transparência.
- Upload de PDFs dos contratos de rateio.
- Leitura e indexação de empenhos, liquidações e pagamentos.

---

## Funcionalidades principais

## 1. Cadastro de Nota Fiscal

Tela/formulário para registrar uma NF.

Campos:

- número da NF;
- nome do profissional ou empresa;
- CPF/CNPJ opcional;
- data de emissão da NF;
- data de aceite da NF;
- valor bruto;
- valor líquido, se houver;
- descrição do serviço;
- município ou municípios vinculados aos pacientes;
- status de pagamento: `pendente`, `pago`, `parcial`, `em disputa`;
- data de pagamento, se já pago;
- observações.

Regras:

- A data de aceite é obrigatória para cálculo do prazo.
- O prazo padrão é 21 dias úteis, mas deve poder ser editável.
- O app deve calcular automaticamente a data limite contratual.
- O app deve mostrar se a NF está dentro do prazo ou atrasada.

---

## 2. Cálculo da data limite contratual

Criar função utilitária:

```ts
calculateBusinessDeadline(acceptedDate: Date, businessDays: number, holidays?: Date[]): Date
```

Regras:

- Contar apenas dias úteis.
- Excluir sábados e domingos.
- Permitir lista de feriados nacionais, estaduais ou municipais.
- No MVP, pode começar excluindo apenas sábados e domingos.
- A contagem deve iniciar no próximo dia útil após a data de aceite, salvo se o contrato indicar regra diferente.

Exemplo:

```ts
const deadline = calculateBusinessDeadline(new Date('2026-05-12'), 21)
```

Também criar:

```ts
getOverdueDays(deadline: Date, referenceDate: Date): number
getBusinessOverdueDays(deadline: Date, referenceDate: Date): number
```

Essas funções devem retornar `0` se ainda não houver atraso.

---

## 3. Status da NF

Cada NF deve receber um status visual:

### Verde

NF dentro do prazo ou já paga dentro do prazo.

Mensagem sugerida:

> Esta NF ainda está dentro do prazo contratual.

ou

> Esta NF foi paga dentro do prazo contratual.

### Amarelo

NF próxima ao vencimento. Sugestão: faltando até 5 dias úteis para vencer.

Mensagem sugerida:

> Esta NF ainda está dentro do prazo, mas já está próxima do limite contratual.

### Vermelho

NF vencida e não paga.

Mensagem sugerida:

> Esta NF está com X dias corridos de atraso e Y dias úteis de atraso em relação ao prazo contratual.

---

## 4. Cadastro e monitoramento dos municípios

O app deve conter uma lista dos municípios consorciados ou vinculados ao monitoramento do usuário.

Campos por município:

- nome do município;
- CNPJ da prefeitura, se disponível;
- portal da transparência;
- link direto para despesas/pagamentos, se disponível;
- link para contratos de rateio, se disponível;
- status do repasse ao CISLAV;
- data prevista do repasse;
- data em que o repasse foi feito;
- valor previsto;
- valor pago;
- competência do repasse;
- documento de referência: empenho, liquidação, pagamento, contrato ou comprovante;
- observações.

---

## 5. Status dos repasses das prefeituras

Cada prefeitura deve ter um status visual com base no prazo de repasse ao consórcio.

### Verde — repasse feito

Condição:

- existe data de pagamento/repasse confirmado; ou
- valor pago maior ou igual ao valor previsto para a competência.

Mensagem:

> Repasse identificado para esta competência.

### Amarelo — ainda dentro do prazo

Condição:

- não existe pagamento identificado;
- mas a data atual ainda é menor ou igual à data limite esperada para repasse.

Mensagem:

> Repasse ainda não identificado, mas dentro do prazo previsto.

### Vermelho — repasse atrasado

Condição:

- não existe pagamento identificado;
- e a data atual é maior do que a data limite esperada para repasse.

Mensagem:

> Repasse não identificado e atualmente com Z dias de atraso.

---

## 6. Painel principal do profissional

O dashboard deve mostrar, no topo, cartões de resumo:

1. **NF atual**
   - número da NF;
   - valor;
   - data de aceite;
   - data limite contratual;
   - status;
   - dias de atraso.

2. **Atraso do profissional**
   - texto no formato:

> Este repasse referente à NF 06 está com X dias de atraso.

3. **Média atual dos atrasos**
   - texto no formato:

> A média atual de atrasos das NFs cadastradas é de Y dias.

4. **Atraso médio das prefeituras**
   - texto no formato:

> O atraso médio dos repasses das prefeituras vinculadas a esta NF é de Z dias.

5. **Observação positiva**
   - se todas as prefeituras ligadas à NF estiverem verdes:

> As prefeituras relacionadas aos pacientes desta NF estão com os repasses em dia. Isso fortalece o argumento de que o pagamento ao profissional não deveria estar represado por falta de repasse municipal identificado.

   - se parte estiver verde e parte amarela:

> Parte das prefeituras relacionadas à NF já está em dia e as demais ainda aparecem dentro do prazo.

   - se houver prefeitura vermelha:

> Existem prefeituras com repasses atrasados. O app deve separar o atraso do consórcio com o profissional do atraso municipal para facilitar a cobrança administrativa.

---

## 7. Tela de detalhes da NF

Cada NF deve abrir uma página detalhada contendo:

- dados principais da nota;
- linha do tempo;
- data de emissão;
- data de aceite;
- início da contagem do prazo;
- data limite contratual;
- data atual;
- quantidade de dias corridos de atraso;
- quantidade de dias úteis de atraso;
- status de pagamento;
- lista dos municípios relacionados aos pacientes;
- status do repasse de cada município;
- documentos anexados;
- campo para observações e histórico de contato.

### Linha do tempo visual

Exemplo:

1. NF emitida — 10/05/2026
2. NF aceita — 12/05/2026
3. Prazo contratual iniciado — 13/05/2026
4. Limite de 21 dias úteis — data calculada
5. Status atual — em atraso / dentro do prazo / pago

---

## 8. Tabela de municípios no dashboard

A tabela deve conter:

| Município | Competência | Valor previsto | Valor pago | Data limite | Data do repasse | Status | Dias de atraso |
|---|---:|---:|---:|---:|---:|---|---:|

A coluna status deve usar cores:

- verde: pago;
- amarelo: dentro do prazo;
- vermelho: atrasado.

Permitir filtro por:

- NF;
- município;
- competência;
- status;
- profissional;
- período.

---

## 9. Fórmulas e métricas

### Dias de atraso da NF

```ts
nfOverdueDays = max(0, differenceInCalendarDays(today, nfDeadline))
```

### Dias úteis de atraso da NF

```ts
nfBusinessOverdueDays = countBusinessDaysBetween(nfDeadline, today)
```

### Média atual de atrasos das NFs

Considerar apenas NFs vencidas e não pagas, ou pagas com atraso.

```ts
averageNFDelay = sum(delayDaysByNF) / totalDelayedNFs
```

Se não houver NFs atrasadas:

```ts
averageNFDelay = 0
```

### Atraso de repasse por prefeitura

```ts
municipalityDelayDays = max(0, differenceInCalendarDays(today, municipalityTransferDeadline))
```

Se o repasse foi feito:

```ts
municipalityDelayDays = max(0, differenceInCalendarDays(paymentDate, municipalityTransferDeadline))
```

### Média de atraso dos repasses municipais

Considerar apenas municípios vinculados à NF ou ao profissional.

```ts
averageMunicipalityDelay = sum(delayDaysByMunicipality) / totalMunicipalitiesWithDelayOrRelevantStatus
```

Sugestão: no MVP, calcular a média sobre todos os municípios vinculados à NF. Municípios em dia entram com atraso `0`, para a média refletir o cenário geral.

---

## 10. Modelo de dados sugerido

### Invoice

```ts
export type InvoiceStatus = 'pending' | 'paid' | 'partial' | 'disputed'

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
  paymentStatus: InvoiceStatus
  paymentDate?: string
  notes?: string
  createdAt: string
  updatedAt: string
}
```

### Municipality

```ts
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
```

### MunicipalityTransfer

```ts
export type TransferStatus = 'paid' | 'within_deadline' | 'overdue' | 'unknown'

export interface MunicipalityTransfer {
  id: string
  municipalityId: string
  competence: string
  expectedAmount?: number
  paidAmount?: number
  expectedTransferDate?: string
  transferDeadline: string
  paidAt?: string
  sourceUrl?: string
  sourceDocument?: string
  status: TransferStatus
  notes?: string
  createdAt: string
  updatedAt: string
}
```

### Contract

```ts
export interface Contract {
  id: string
  municipalityId?: string
  contractorName?: string
  contractType: 'rateio' | 'prestacao_servico' | 'programa' | 'outro'
  contractNumber?: string
  year: number
  startDate?: string
  endDate?: string
  paymentDeadlineBusinessDays?: number
  fileUrl?: string
  sourceUrl?: string
  notes?: string
}
```

---

## 11. Estrutura de páginas sugerida

```txt
/app
  /page.tsx                        Dashboard principal
  /invoices/page.tsx                Lista de NFs
  /invoices/new/page.tsx            Cadastro de NF
  /invoices/[id]/page.tsx           Detalhe da NF
  /municipalities/page.tsx          Lista de municípios
  /municipalities/[id]/page.tsx     Detalhe do município
  /transfers/page.tsx               Repasses municipais
  /contracts/page.tsx               Contratos e documentos
  /settings/page.tsx                Configurações de prazo, feriados e fontes
/components
  DashboardCards.tsx
  InvoiceForm.tsx
  InvoiceStatusBadge.tsx
  MunicipalityStatusBadge.tsx
  MunicipalityTransfersTable.tsx
  DelaySummaryCard.tsx
  PositiveObservationCard.tsx
  CsvImport.tsx
/lib
  date-utils.ts
  calculations.ts
  storage.ts
  csv.ts
  sample-data.ts
/types
  invoice.ts
  municipality.ts
  transfer.ts
  contract.ts
/public
  manifest.json
  icon-192.png
  icon-512.png
```

---

## 12. Componentes essenciais

### InvoiceForm

Responsável por cadastrar e editar NFs.

Deve validar:

- número da NF obrigatório;
- data de aceite obrigatória;
- valor obrigatório;
- prazo contratual maior que zero;
- pelo menos um município vinculado.

### DelaySummaryCard

Mostra:

- data limite;
- dias corridos de atraso;
- dias úteis de atraso;
- status visual.

### MunicipalityTransfersTable

Mostra a situação de cada município.

Deve permitir edição manual de:

- valor previsto;
- valor pago;
- data limite de repasse;
- data efetiva de repasse;
- link da fonte.

### PositiveObservationCard

Gera uma leitura contextual automática.

Regras:

- Se todas as cidades vinculadas estão verdes:
  - mostrar observação positiva reforçando que os repasses municipais estão em dia.
- Se há amarelas, mas nenhuma vermelha:
  - mostrar observação neutra positiva.
- Se há vermelhas:
  - mostrar alerta de separação entre atraso municipal e atraso do consórcio.

---

## 13. Textos prontos para a interface

### Resumo da NF

```txt
Este repasse referente à NF {{invoiceNumber}} está com {{nfOverdueDays}} dias corridos de atraso e {{nfBusinessOverdueDays}} dias úteis de atraso em relação ao prazo contratual.
```

### Média de atraso

```txt
A média atual de atrasos das NFs cadastradas é de {{averageNFDelay}} dias.
```

### Atraso municipal

```txt
O atraso médio dos repasses das prefeituras vinculadas a esta NF é de {{averageMunicipalityDelay}} dias.
```

### Observação positiva

```txt
As prefeituras relacionadas aos pacientes desta NF estão com os repasses em dia. Isso fortalece o argumento de que o pagamento ao profissional não deveria estar represado por falta de repasse municipal identificado.
```

### Observação com atraso municipal

```txt
Existem prefeituras com repasses atrasados. O app deve separar o atraso do consórcio com o profissional do atraso municipal para facilitar a cobrança administrativa.
```

---

## 14. Dados de exemplo para o MVP

Criar `sample-data.ts` com dados fictícios para testar a interface.

Exemplo:

```ts
export const sampleInvoice = {
  id: 'nf-06',
  number: '06',
  professionalName: 'Profissional Exemplo',
  issueDate: '2026-05-10',
  acceptedDate: '2026-05-12',
  contractualBusinessDays: 21,
  amount: 5000,
  municipalityIds: ['lavras', 'carrancas', 'ijaci'],
  paymentStatus: 'pending',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
```

Municípios fictícios:

```ts
export const sampleMunicipalities = [
  {
    id: 'lavras',
    name: 'Lavras',
    state: 'MG',
    transparencyUrl: 'https://pt.cislav.com/',
  },
  {
    id: 'carrancas',
    name: 'Carrancas',
    state: 'MG',
  },
  {
    id: 'ijaci',
    name: 'Ijaci',
    state: 'MG',
  },
]
```

Repasses fictícios:

```ts
export const sampleTransfers = [
  {
    id: 'transfer-lavras-2026-05',
    municipalityId: 'lavras',
    competence: '2026-05',
    expectedAmount: 10000,
    paidAmount: 10000,
    transferDeadline: '2026-06-10',
    paidAt: '2026-06-05',
    status: 'paid',
  },
  {
    id: 'transfer-carrancas-2026-05',
    municipalityId: 'carrancas',
    competence: '2026-05',
    expectedAmount: 6000,
    paidAmount: 0,
    transferDeadline: '2026-07-05',
    status: 'within_deadline',
  },
  {
    id: 'transfer-ijaci-2026-05',
    municipalityId: 'ijaci',
    competence: '2026-05',
    expectedAmount: 4000,
    paidAmount: 0,
    transferDeadline: '2026-06-01',
    status: 'overdue',
  },
]
```

---

## 15. Importação CSV

Permitir importar repasses por CSV.

Colunas esperadas:

```csv
municipio,competencia,valor_previsto,valor_pago,data_limite_repasse,data_pagamento,url_fonte,observacoes
Lavras,2026-05,10000,10000,2026-06-10,2026-06-05,https://...,Repasse identificado
Carrancas,2026-05,6000,0,2026-07-05,,https://...,Dentro do prazo
Ijaci,2026-05,4000,0,2026-06-01,,https://...,Atrasado
```

Ao importar:

- normalizar nomes dos municípios;
- converter datas;
- converter valores;
- recalcular status automaticamente;
- salvar no storage local.

---

## 16. Fontes públicas a preparar para futura integração

O app deve ter uma área chamada **Fontes públicas** com links cadastráveis.

Fontes iniciais:

- Portal da Transparência do CISLAV;
- página de despesas em tempo real do CISLAV;
- página de contratos de municípios / contratos de rateio 2026;
- portais de transparência individuais das prefeituras participantes;
- diários oficiais, se necessário.

No MVP, não depender de scraping automático para funcionar.

Motivo: portais públicos podem bloquear acesso automatizado, mudar HTML, exigir filtros dinâmicos ou retornar erro 403. Por isso, o app precisa funcionar com importação manual/CSV e anexos.

---

## 17. Critérios de aceite do MVP

O MVP estará correto quando:

1. Usuário consegue cadastrar uma NF com data de emissão e data de aceite.
2. App calcula corretamente a data limite usando 21 dias úteis por padrão.
3. App mostra dias corridos e dias úteis de atraso.
4. App permite vincular municípios à NF.
5. App mostra status dos repasses municipais com cores:
   - verde: repasse feito;
   - amarelo: dentro do prazo;
   - vermelho: atrasado.
6. App mostra frase:
   - `Este repasse referente à NF 06 está com X dias de atraso.`
7. App mostra frase:
   - `A média atual de atrasos está em Y dias.`
8. App mostra frase:
   - `O atraso no repasse das prefeituras está em Z dias.`
9. App mostra observação positiva quando as prefeituras vinculadas estão em dia.
10. App permite importar repasses por CSV.
11. App funciona como PWA instalável.
12. App salva dados localmente.
13. App pode ser publicado na Vercel.

---

## 18. Melhorias futuras

- Integração automática com portais de transparência.
- Parser de PDFs dos contratos de rateio.
- Upload de contrato firmado com o CISLAV.
- Extração automática da cláusula de prazo de pagamento.
- Geração automática de relatório administrativo em PDF.
- Geração automática de notificação extrajudicial.
- Ranking de municípios por pontualidade.
- Histórico mensal de repasses.
- Comparação entre atraso do consórcio e atraso das prefeituras.
- Exportação de planilha `.xlsx`.
- Login por profissional.
- Modo multi-consórcio.

---

## 19. Prompt direto para o Codex

Use este trecho como comando principal:

```txt
Crie um PWA em Next.js, React, TypeScript e Tailwind chamado Monitoramento CISLAV.

O app deve permitir cadastrar notas fiscais com número, valor, data de emissão, data de aceite, prazo contratual em dias úteis com padrão de 21 dias úteis, municípios vinculados aos pacientes e status de pagamento.

A partir da data de aceite, calcule a data limite contratual somando os dias úteis, ignorando sábados e domingos no MVP. Mostre se a NF está dentro do prazo, próxima do vencimento ou atrasada. Para NFs atrasadas, mostre dias corridos e dias úteis de atraso.

O app também deve permitir cadastrar ou importar via CSV os repasses das prefeituras ao CISLAV, com município, competência, valor previsto, valor pago, data limite do repasse, data efetiva de pagamento e URL da fonte pública.

No dashboard, mostre:
- Este repasse referente à NF {{número}} está com X dias de atraso.
- A média atual de atrasos das NFs cadastradas está em Y dias.
- O atraso médio dos repasses das prefeituras vinculadas está em Z dias.

Use sinalização visual:
- verde para prefeituras que fizeram o repasse;
- amarelo para prefeituras ainda dentro do prazo;
- vermelho para prefeituras atrasadas.

Se todas as prefeituras vinculadas à NF estiverem em dia, mostre uma observação positiva dizendo que os repasses municipais relacionados aos pacientes estão em dia e que isso fortalece o argumento administrativo de que o pagamento ao profissional não deveria estar represado por falta de repasse municipal identificado.

Inclua dados de exemplo, armazenamento local, importação CSV, tabela de municípios, página de detalhes da NF, página de repasses, componentes de status e configuração PWA com manifest e service worker. O app deve estar pronto para deploy na Vercel.
```

---

## 20. Resultado esperado de UX

O usuário deve conseguir abrir o app e responder rapidamente três perguntas:

1. **Meu pagamento está atrasado?**
2. **Quantos dias está atrasado em relação ao contrato?**
3. **As prefeituras relacionadas aos meus pacientes repassaram o dinheiro ao consórcio?**

A resposta visual precisa ser simples:

- verde: em dia;
- amarelo: atenção, mas ainda no prazo;
- vermelho: atraso identificado.

