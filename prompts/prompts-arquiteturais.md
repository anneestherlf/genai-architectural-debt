# Prompts Arquiteturais — Cenário B

Prompts utilizados para refatorar o backend do Cenário A via Claude (claude-sonnet-4-5).  
Cada prompt segue o modelo de 4 componentes proposto no artigo:  
**(1) Funcionalidade · (2) Restrição técnica · (3) Tradeoff aceito · (4) Documentação**

---

## R1 — Eliminação do padrão N+1 (sinais S1, S3)

**Fraqueza identificada:** o endpoint `GET /app/team` executava um loop `for/await`
com 2 queries síncronas por colaborador. Com 50 colaboradores, gerava 103 queries
por requisição. O mesmo padrão ocorria em `GET /app/my-tracks` (1 + 2T queries por trilha).

**Prompt enviado ao Claude:**

```
O endpoint GET /app/team tem um padrão N+1 crítico: para cada colaborador no
array `profiles`, executa 2 queries síncronas em um loop for/await. Com 50
colaboradores, gera 103 queries por requisição [comp. 2]. Refatore APENAS este
endpoint usando uma única query SQL com JOINs e GROUP BY que retorne: id,
full_name, email, total de módulos matriculados e completados em uma só ida ao
banco [comp. 1]. Mantenha a estrutura de resposta JSON. Adicione comentário
explicando o que foi eliminado [comp. 4]. Mesma refatoração para
GET /app/my-tracks.
```

**Resultado:** redução de 103 para 1 query/req no dashboard do gestor (−99%),
independente do número de colaboradores, via LEFT JOINs com
`COUNT(DISTINCT ...) FILTER (WHERE ...)`.

---

## R2 — Pool de conexões otimizado (sinal S2)

**Fraqueza identificada:** pool de conexões com `max: 10` conexões, sem timeout.
Com o N+1 gerando 103 queries por request, o pool esgotava em ~10 requisições
simultâneas.

**Prompt enviado ao Claude:**

```
Ajuste o Pool do PostgreSQL [comp. 1]. O pool atual tem max: 10, sem timeout —
isso causa esgotamento sob carga [comp. 2]. Substitua por: max: 20,
idleTimeoutMillis: 30000, connectionTimeoutMillis: 2000. Aceito que com pool
esgotado o sistema retorne 503 imediatamente em vez de requisições suspensas
[comp. 3]. Adicione handler de erro no pool e middleware global de timeout de
5 s. Comente o motivo de cada valor [comp. 4].
```

**Resultado:** dobro da capacidade de conexões (10 → 20); fail-fast com 503
imediato em vez de requisições penduradas indefinidamente.

---

## R3 — Cache em memória com TTL (sinal S3)

**Fraqueza identificada:** endpoints de dados quase-estáticos (`GET /app/tracks`,
`GET /app/modules/:id`) iam ao banco em cada requisição. Com 100 VUs simultâneos, cada
segundo gerava milhares de queries idênticas.

**Prompt enviado ao Claude:**

```
Adicione cache (node-cache) [comp. 1] para GET /app/tracks: cache por
company_id, TTL 60 s; e para GET /app/modules/:id: cache por moduleId, TTL 300 s
com quiz incluído [comp. 2]. Aceito que trilhas editadas possam demorar 60 s para
aparecer atualizadas [comp. 3]. Não adicione cache em /app/team nem
/app/my-tracks — progresso precisa ser fresco. Comente o TTL e o que mudaria
com Redis em produção [comp. 4].
```

**Resultado:** sob carga concorrente, taxa esperada de cache hit >98% para trilhas e >99%
para módulos, eliminando virtualmente todas as queries repetidas.

---

## R4 — Fila assíncrona de escritas (sinal S4)

**Fraqueza identificada:** o endpoint `POST /app/modules/:id/complete` executava
um `upsert` síncrono em `module_progress`, bloqueando a resposta HTTP até a
escrita completar. Sob pico (~30% dos VUs marcando progresso simultaneamente),
as escritas competiam pelas conexões do pool.

**Prompt enviado ao Claude:**

```
Refatore POST /app/modules/:id/complete para processamento assíncrono com fila
em memória simples, sem Redis [comp. 1]. O upsert bloqueia a resposta HTTP até
a escrita completar — esgota o pool com escritas que o usuário não precisa
aguardar [comp. 2]. O endpoint deve adicionar o job na fila e retornar
imediatamente {success: true, queued: true}. Aceito que em crash do servidor,
registros de progresso na fila sejam perdidos [comp. 3]. Worker processa 50
jobs/ciclo a cada 500 ms. Comente o tradeoff de consistência eventual e o que
mudaria com BullMQ + Redis em produção [comp. 4].
```

**Resultado:** endpoint retorna imediatamente, liberando a conexão do pool.
Tradeoff: consistência eventual de até 500 ms, avaliada como aceitável para
onboarding corporativo.

---

## Modelo de prompt arquitetural (template replicável)

O template abaixo pode ser aplicado a qualquer MVP para identificar e corrigir
lacunas arquiteturais de escalabilidade. Substitua os campos entre colchetes
pela descrição do seu próprio sistema.

```
[Cole aqui o código da funcionalidade que está lenta]

Analise o código acima e identifique problemas de escalabilidade.

[1. Funcionalidade]: a função analisada é [descreva em linguagem de negócio
o que a tela ou endpoint faz].

[2. Restrição técnica]: refatore para que o banco de dados seja acessado
[ex: com uma única query com JOINs / com cache de X segundos / de forma
assíncrona], sem executar consultas dentro de loops.

[3. Tradeoff aceito]: aceito que [descreva a consequência: ex: dados com
até 30 segundos de atraso / falha imediata em vez de fila de espera].

[4. Documentação]: ao final, adicione comentários no código explicando:
(a) qual padrão problemático foi eliminado; (b) por que a solução escala
melhor; e (c) o que precisaria mudar para suportar 10× mais usuários
simultâneos.
```

**Referência:** Seção 5.2 do artigo. O modelo é descrito como um
*architectural constraint prompt pattern* (White et al., 2023).
