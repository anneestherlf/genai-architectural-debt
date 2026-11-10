# genai-architectural-debt

Repositório de artefatos do artigo **"Dívida Técnica Arquitetural em Sistemas Gerados por IA Generativa: um estudo experimental sobre MVPs e escalabilidade"**, submetido ao CTIC-ES / SBES 2026.

**Autora:** Anne Esther Lins Figueirôa (INTELI)  
**Orientador:** Prof. Reginaldo Arakaki (INTELI)  
**Coorientadora:** Prof.ª Fabiana Martins de Oliveira (USP)  
**Repositório:** https://github.com/anneestherlf/genai-architectural-debt

---

## O que tem aqui

O experimento compara dois servidores de aplicação de uma plataforma de onboarding corporativo, implementados sobre a mesma pilha tecnológica de destino (Node.js + PostgreSQL) e testados sob condições idênticas (mesmos dados, mesma infraestrutura, mesmo protocolo de carga). O Cenário B foi obtido por refatoração do código do Cenário A, via prompts arquiteturais explícitos enviados a um assistente de codificação baseado em LLM (Claude) — uma ferramenta distinta do construtor no-code (Lovable) usado no Cenário A. Ferramenta de geração e modo de construção (geração autônoma vs. refatoração guiada) são, portanto, variáveis não controladas entre os cenários; ver Limitações no artigo (`artigo/main.tex`).

| | Cenário A | Cenário B |
|---|---|---|
| Ferramenta de geração | Lovable (no-code) | Claude — refatoração guiada |
| Modo de construção | Geração autônoma | Refatoração do código do Cenário A |
| Queries por requisição (`/app/team`) | 109 (padrão N+1) | 1 (JOIN) |
| Pool de conexões | max:10, sem timeout | max:20, timeout 2 s |
| Cache | Ausente | TTL 60–300 s (node-cache) |
| Escrita de progresso | Síncrona (bloqueia HTTP) | Fila assíncrona |

### Resultados dos testes de carga (100 VUs, 3 minutos, GitHub Codespaces)

| Métrica | Cenário A | Cenário B |
|---|---|---|
| Taxa de erro | 0,00% | 0,00% |
| Latência média | 1.880 ms | 30 ms |
| Limite p95 < 2 s | **violado** | cumprido |
| Consultas/req | 109 (loop) | 1 (JOIN) |
| Iterações completas (3 min) | 5.346 | 8.879 (+66%) |

> **Sobre a vazão (req/s):** o script do Cenário B executa mais requisições por iteração que o do Cenário A (inclui `GET /app/tracks` e `GET /health/queue`), então a razão de req/s (29 vs. 102) não é diretamente comparável; use a latência da rota `GET /app/team` e as iterações completas como métricas de comparação.
>
> **Limitação conhecida dos scripts K6:** em ambos os scripts, `setup()` lê `tracks[0].modules[0].id`, mas `GET /app/tracks` retorna `{ tracks: [...] }`; o `moduleId` fica nulo e o `POST /app/modules/:id/complete` não é executado. Logo, a escrita (síncrona no A, fila assíncrona no B) não foi exercitada sob carga (`fila_tamanho_max` = 0).
>
> **Thresholds:** os scripts têm limites internos diferentes (A: p95 < 2.000 ms no dashboard; B: p95 < 500 ms). O SLA usado na comparação do artigo é p95 < 2.000 ms e erro < 1%; o p95 do dashboard no B (90,8 ms) cumpre ambos.

---

## Estrutura do repositório

```
genai-architectural-debt/
├── src/ # App ORIGINAL gerado pelo Lovable (TanStack Start +
│ # Supabase + Cloudflare Workers) — código-fonte de
│ # referência, não é o artefato usado no teste de carga
├── supabase/ # Migrations do schema Supabase do app original
├── artigo/
│ ├── main.tex # Artigo completo (LaTeX / template SBES 2026)
│ └── referencias.bib # Referências bibliográficas
├── analise-estatica/
│ └── complexidade-ciclomatica.md # CC (McCabe) via lizard, Cenários A e B
├── cenario-a/
│ ├── server.js # Node.js/Express/pg — REPRODUÇÃO EQUIVALENTE do
│ │ # padrão arquitetural do app em src/, usada no
│ │ # teste de carga (ver Limitações do artigo)
│ ├── schema.sql # Schema do banco de dados
│ ├── seed.js # Geração de dados sintéticos (530 usuários, 50 trilhas)
│ ├── Dockerfile
│ ├── docker-compose.yml
│ ├── k6-cenario-a.js # Script K6 — teste de carga
│ └── resultado-cenario-a.json # Métricas reais do teste
├── cenario-b/
│ ├── server.js # Servidor refatorado com 4 decisões arquiteturais
│ ├── schema.sql
│ ├── seed.js
│ ├── Dockerfile
│ ├── docker-compose.yml
│ ├── k6-cenario-b.js # Script K6 — mesmo protocolo do Cenário A
│ └── resultado-cenario-b.json # Métricas reais do teste
├── prompts/
│ └── prompts-arquiteturais.md # Prompts completos R1–R4 com os 4 componentes
└── README.md
```
> **Nota:** `src/` e `supabase/` contêm o aplicativo tal como o Lovable o gerou
> originalmente. Como não é viável rodar K6 diretamente contra a stack serverless
> (Cloudflare Workers + Supabase), o Cenário A testado em carga foi reimplementado
> em `cenario-a/` sobre Node.js/PostgreSQL, preservando fielmente o padrão N+1 e
> as demais decisões (ou ausência delas) observadas no app original — ver
> Limitações no artigo.

---

## Como reproduzir os testes

**Pré-requisitos:** Docker, Node.js, k6 instalados.

> **Nota sobre determinismo:** a partir desta versão, `seed.js` usa um gerador
> pseudo-aleatório com seed fixa (mulberry32, seed=42), garantindo que o volume
> de dados sintéticos seja idêntico a cada execução.

### Cenário A

```bash
cd cenario-a
docker compose down -v
docker compose up -d --build
sleep 20
npm install
node seed.js
k6 run k6-cenario-a.js 2>&1 | tee resultado-cenario-a-log.txt
```

### Cenário B

```bash
# Primeiro derrubar o Cenário A para liberar a porta 3000
cd ../cenario-a && docker compose down

cd ../cenario-b
docker compose up -d --build
sleep 20
npm install
node seed.js
k6 run k6-cenario-b.js 2>&1 | tee resultado-cenario-b-log.txt
```

> **Nota sobre o ambiente:** os testes foram executados no GitHub Codespaces (2 vCPUs, 8 GB RAM) com banco de dados PostgreSQL, servidor Node.js e K6 no mesmo host. Esse ambiente compartilhado é uma limitação — os resultados refletem a diferença arquitetural entre os cenários, não métricas absolutas de produção. Para maior validade externa, recomenda-se rodar com instâncias separadas para banco, servidor e ferramenta de carga.

---

## Dados da entrevista

Os dados qualitativos das entrevistas com os fundadores não são disponibilizados em cumprimento ao compromisso de anonimização (TCLE assinado).

---

## Licença

Artefatos disponibilizados para fins de reprodutibilidade acadêmica.  
Artigo submetido ao VII CTIC-ES / SBES 2026.
