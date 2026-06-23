# genai-architectural-debt

Repositório de artefatos do artigo "Dívida Técnica Arquitetural em Sistemas Gerados por IA Generativa: um estudo experimental sobre MVPs e escalabilidade", submetido ao CTIC-ES / SBES 2026.

**Autora:** Anne Esther Lins Figueirôa (INTELI)  
**Orientador:** Prof. Reginaldo Arakaki (INTELI)  
**Coorientadora:** Prof.ª Fabiana Martins de Oliveira (USP)

---

## O que tem aqui

O experimento compara dois backends de uma plataforma de onboarding corporativo, implementados sobre a mesma stack (Node.js + PostgreSQL). A diferença entre eles está exclusivamente nas decisões arquiteturais embutidas nos prompts de geração.

O **Cenário A** foi gerado pelo Lovable com prompts de negócio, sem nenhuma especificação técnica. O **Cenário B** é o mesmo backend, refatorado com quatro prompts arquiteturais enviados ao Claude.

| | Cenário A | Cenário B |
|---|---|---|
| Queries por requisição (`/app/team`) | 109 (padrão N+1) | 1 (JOIN) |
| Pool de conexões | max: 10, sem timeout | max: 20, timeout 2 s |
| Cache | Nenhum | TTL 60–300 s |
| Escritas | Síncronas | Fila assíncrona |

A diferença de 99% no número de consultas ao banco é verificável diretamente no código-fonte (`server.js` de cada cenário), sem necessidade de execução.

---

## Estrutura

```
genai-architectural-debt/
├── prompts/
│   └── prompts-arquiteturais.md   # Os 4 prompts completos (R1–R4)
│
├── cenario-a/                     # Backend original gerado pelo Lovable
│   ├── server.js                  # Contém o padrão N+1 (ver GET /app/team)
│   ├── schema.sql
│   ├── seed.js
│   ├── k6-cenario-a.js
│   ├── resultado-resumo.txt       # Log de teste de carga
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── cenario-b/                     # Backend refatorado com R1–R4
│   ├── server.js                  # JOIN substituiu o loop (ver GET /app/team)
│   ├── schema.sql
│   ├── seed.js
│   ├── k6-cenario-b.js
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── src/                           # Frontend (TanStack/React, gerado pelo Lovable)
└── supabase/                      # Migrations SQL
```

---

## Como verificar a diferença arquitetural

A contribuição principal deste estudo é verificável por inspeção estática. No arquivo `cenario-a/server.js`, localize a rota `GET /app/team` e observe o loop `for/await` que executa 2 consultas por colaborador. No `cenario-b/server.js`, a mesma rota usa um único `LEFT JOIN`.

```bash
# Contar consultas ao banco no Cenário A (rota /app/team)
grep -c "await pool.query" cenario-a/server.js

# Ver a query com JOIN no Cenário B
grep -A 20 "app/team" cenario-b/server.js | grep -i "join"
```

---

## Como rodar os testes de carga

**Recomendação:** para obter resultados confiáveis, execute banco de dados, servidor e K6 em instâncias separadas. Rodar tudo no mesmo host (como GitHub Codespaces) satura a infraestrutura antes de evidenciar o gargalo arquitetural.

```bash
# Cenário A
cd cenario-a
docker compose up -d --build
sleep 15
node seed.js
k6 run k6-cenario-a.js 2>&1 | tee resultado-cenario-a-log.txt

# Cenário B
cd ../cenario-b
docker compose up -d --build
sleep 15
node seed.js
k6 run k6-cenario-b.js 2>&1 | tee resultado-cenario-b-log.txt
```

---

## Prompts arquiteturais

O arquivo `prompts/prompts-arquiteturais.md` contém os quatro prompts usados para refatorar o Cenário A, cada um seguindo o modelo de quatro componentes:

1. **Funcionalidade:** o que o endpoint faz, em linguagem de negócio
2. **Restrição técnica:** como o banco deve ser acessado
3. **Tradeoff aceito:** a consequência que o founder aceita em troca de escalabilidade
4. **Documentação:** pedido de explicação do padrão corrigido no código

| Refatoração | Problema | Solução |
|---|---|---|
| R1 | 109 consultas por requisição (N+1) | 1 consulta com LEFT JOIN |
| R2 | Pool de 10 conexões sem timeout | Pool de 20, fail-fast 503 |
| R3 | Banco consultado a cada requisição | Cache TTL 60–300 s |
| R4 | Escrita síncrona bloqueava HTTP | Fila assíncrona, resposta imediata |

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
