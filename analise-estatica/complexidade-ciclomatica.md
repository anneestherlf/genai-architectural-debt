# Análise de Complexidade Ciclomática (CC) — Cenários A e B

Métrica complementar à análise dinâmica (Seção 3.4 do artigo), calculada com a
ferramenta [`lizard`](https://github.com/terryyin/lizard) (implementa CC de
McCabe, 1976) sobre `cenario-a/server.js` e `cenario-b/server.js`.

## Comando utilizado

```bash
pip install lizard
lizard cenario-a/server.js cenario-b/server.js -l javascript
```

## Resultado agregado por arquivo

| Arquivo               | NLOC | Funções | CC média | CC máxima |
|------------------------|------|---------|----------|-----------|
| `cenario-a/server.js`  | 231  | 15      | 2,4      | 6         |
| `cenario-b/server.js`  | 263  | 18      | 2,2      | 10        |

Nenhuma função em nenhum dos dois cenários ultrapassa o limiar de risco
convencional (CC > 15). A função de maior complexidade está no Cenário B
(CC = 10, worker da fila assíncrona de R4 — `setInterval` com tratamento de
lote e erros), o que é esperado dado que essa é a única refatoração que
introduz controle de fluxo adicional (processamento em lote, retry implícito).

## Interpretação

A CC média é comparável entre os dois cenários (2,4 vs. 2,2) e ambas estão
bem abaixo de qualquer limiar de complexidade problemática. Isso reforça a
conclusão do artigo: a degradação de desempenho do Cenário A não decorre de
código complexo ou mal escrito — decorre da escolha do padrão de acesso a
dados (N+1 em loop vs. JOIN único), uma decisão arquitetural, não uma questão
de qualidade de implementação linha a linha.

## Sobre CBO e LCOM

As métricas de Acoplamento entre Objetos (CBO) e Falta de Coesão em Métodos
(LCOM), propostas por Chidamber e Kemerer (1994), pressupõem um design
orientado a objetos com classes e métodos. Ambos os servidores deste estudo
seguem estilo procedural (rotas Express como funções, sem classes), portanto
essas métricas não são aplicáveis neste contexto e foram omitidas dos
resultados.