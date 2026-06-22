# sbes2026-ctic-es

Repositório de artefatos do artigo "Dívida Técnica Arquitetural em Sistemas Gerados por IA Generativa: um estudo experimental sobre MVPs e escalabilidade", submetido ao CTIC-ES / SBES 2026.

**Autora:** Anne Esther Lins Figueirôa (INTELI)  
**Orientador:** Prof. Reginaldo Arakaki (INTELI)  
**Coorientadora:** Prof.ª Fabiana Martins de Oliveira (USP)

---

## O que tem aqui

O experimento compara dois backends de uma plataforma de onboarding corporativo, implementados sobre a mesma stack (Node.js + PostgreSQL). A única diferença entre eles está nas decisões arquiteturais embutidas nos prompts de geração.

O **Cenário A** foi gerado pelo Lovable com prompts de negócio, sem nenhuma especificação técnica. O **Cenário B** é o mesmo backend, refatorado com quatro prompts arquiteturais enviados ao Claude.

| | Cenário A | Cenário B |
|---|---|---|
| Queries por requisição | 103 (padrão N+1) | 1 (JOIN) |
| Pool de conexões | max: 10, sem timeout | max: 20, timeout 2 s |
| Cache | Nenhum | TTL 60–300 s |
| Escritas | Síncronas | Fila assíncrona |
| Ponto de ruptura | 2.413 VUs (61,94% de erro) | Não atingido até 10.000 VUs |

---

## Estrutura

```
welcome-navigator/
├── prompts/
│   └── prompts-arquiteturais.md   # Os 4 prompts completos (R1–R4)
│
├── cenario-a/                     # Backend original gerado pelo Lovable
│   ├── server.js
│   ├── schema.sql
│   ├── seed.js
│   ├── k6-cenario-a.js            # Script de teste de carga
│   ├── resultado-resumo.txt       # Log bruto do K6
│   ├── resultado-cenario-a.json   # Métricas por estágio
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── cenario-b/                     # Backend refatorado
│   ├── server.js
│   ├── schema.sql
│   ├── seed.js
│   ├── k6-cenario-b.js
│   ├── resultado-cenario-b.json
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── src/                           # Frontend (TanStack/React, gerado pelo Lovable)
└── supabase/                      # Migrations SQL
```

---

## Como rodar

Você precisa de Docker, Docker Compose, Node.js 20+ e K6 instalados.

**Cenário A:**

```bash
cd cenario-a
docker-compose up -d --build
node seed.js
k6 run --out json=resultado-cenario-a.json k6-cenario-a.js
```

**Cenário B:**

```bash
cd cenario-b
docker-compose up -d --build
node seed.js
k6 run --out json=resultado-cenario-b.json k6-cenario-b.js
```

Aguarde cerca de 15 segundos após o `docker-compose up` antes de rodar o seed, para o banco terminar de inicializar. Você pode verificar com `curl http://localhost:3000/health`.

---

## Protocolo de teste

O script K6 injeta carga em cinco estágios de 60 segundos cada. O teste é interrompido automaticamente se a taxa de erro ultrapassar 10% por 15 segundos seguidos, ou se a latência média passar de 5.000 ms.

| Estágio | VUs | O que se espera |
|---|---|---|
| E1 | 100 | Sistema estável, latência < 300 ms |
| E2 | 500 | Latência < 500 ms, erro < 1% |
| E3 | 1.000 | Latência < 1.000 ms, erro < 2% |
| E4 | 5.000 | Latência < 2.000 ms, erro < 5% |
| E5 | 10.000 | Ponto de ruptura esperado |

---

## Prompts arquiteturais

O arquivo `prompts/prompts-arquiteturais.md` tem os quatro prompts usados para refatorar o Cenário A. Cada um segue o mesmo modelo de quatro componentes:

1. **Funcionalidade:** o que o endpoint faz, em linguagem de negócio
2. **Restrição técnica:** como o banco deve ser acessado
3. **Tradeoff aceito:** a consequência que o founder aceita em troca de escalabilidade
4. **Documentação:** pedido de explicação do padrão corrigido no código

O arquivo também inclui um template em branco para quem quiser aplicar o mesmo modelo em outro sistema.

| Refatoração | Problema no Cenário A | O que mudou no Cenário B |
|---|---|---|
| R1 | 103 consultas por requisição | 1 consulta com LEFT JOIN |
| R2 | Pool de 10 conexões sem timeout | Pool de 20 conexões, fail-fast 503 |
| R3 | Banco consultado a cada requisição | Cache com TTL de 60 a 300 segundos |
| R4 | Escrita síncrona bloqueava o HTTP | Fila assíncrona, resposta imediata |

---

## Resultados

O Cenário A colapsou com 2.413 usuários simultâneos, com 61,94% de taxa de erro e latência acima de 5.000 ms. O Cenário B completou o protocolo até 10.000 VUs sem nenhum erro, com latência estável em 34 ms.

| Métrica | Cenário A | Cenário B |
|---|---|---|
| Ponto de ruptura | 2.413 VUs | Não atingido (>10.000 VUs) |
| Taxa de erro | 61,94% | 0,00% |
| Latência média | >5.000 ms | 34 ms |
| Throughput | n/a | 161 req/s |
| Consultas por requisição | 109 | 1 |

Os dados completos por estágio estão em `resultado-cenario-a.json` e `resultado-cenario-b.json`.

---

## Citação

```bibtex
@inproceedings{Figueiroa2026,
  author    = {Figueirôa, Anne Esther Lins and Arakaki, Reginaldo and
               Oliveira, Fabiana Martins de},
  title     = {Dívida Técnica Arquitetural em Sistemas Gerados por IA Generativa:
               um estudo experimental sobre MVPs e escalabilidade},
  booktitle = {Anais do 40º Simpósio Brasileiro de Engenharia de Software (SBES)},
  series    = {CTIC-ES 2026},
  year      = {2026},
  address   = {Recife, PE, Brasil}
}
```
