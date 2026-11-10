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
| `cenario-a/server.js`  | 231  | 15      | 2,3      | 5         |
| `cenario-b/server.js`  | 263  | 18      | 2,0      | 6         |

Nenhuma função em nenhum dos dois cenários ultrapassa o limiar de risco
convencional (CC > 15). A função de maior complexidade está no Cenário B
(CC = 6, rota `GET /app/modules/:moduleId`, linhas 292–345 de
`cenario-b/server.js`, que combina cache, consulta do módulo e do quiz). No
Cenário A a maior CC é 5 (rota de linhas 103–167 de `cenario-a/server.js`).
O worker da fila assíncrona (R4) tem CC = 3.

Valores obtidos com `lizard` 1.25.1; a média é calculada sobre as funções
(15 no A e 18 no B) listadas na saída por função do comando acima.

## Interpretação

A CC média é comparável entre os dois cenários (2,3 vs. 2,0) e ambas estão
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