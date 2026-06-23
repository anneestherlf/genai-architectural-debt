// SCRIPT K6 — Cenário B
// Testa a mesma rota GET /app/team após refatoração R1 (JOIN)
// Cada requisição dispara 1 query ao banco (independente de M)
//
// Execução:
//   k6 run k6-cenario-b.js 2>&1 | tee resultado-cenario-b-log.txt
//
// Pré-requisito: backend rodando em http://localhost:3000
//   docker compose up -d && node seed.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const latenciaDashboard = new Trend('latencia_dashboard_ms', true);
const taxaErro = new Rate('taxa_erro');
const errosTotal = new Counter('erros_total');

export const options = {
  // Protocolo idêntico ao Cenário A para comparação direta
  stages: [
    { duration: '60s', target: 100  }, // E1
    { duration: '60s', target: 500  }, // E2
    { duration: '60s', target: 1000 }, // E3
    { duration: '60s', target: 2000 }, // E4
    { duration: '60s', target: 3000 }, // E5
  ],
  thresholds: {
    'http_req_failed':       ['rate<0.01'],  // SLA mais estrito: < 1% erro
    'http_req_duration':     ['p(95)<500'],  // SLA: p95 < 500ms
    'latencia_dashboard_ms': ['p(95)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export function setup() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: 'manager1@test.com', password: 'senha123' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  const token = JSON.parse(res.body).token;
  if (!token) throw new Error('Login falhou: ' + res.body);
  return { token };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.token}`,
  };

  // Mesma rota do Cenário A — agora com JOIN (1 query independente de M)
  const r = http.get(`${BASE_URL}/app/team`, { headers });
  latenciaDashboard.add(r.timings.duration);

  const ok = check(r, {
    'status 200':        (res) => res.status === 200,
    'retorna members':   (res) => {
      try { return JSON.parse(res.body).members !== undefined; }
      catch { return false; }
    },
  });

  if (!ok) {
    errosTotal.add(1);
    taxaErro.add(1);
  } else {
    taxaErro.add(0);
  }

  sleep(1);
}

export function teardown() {
  console.log('\n=== CENÁRIO B CONCLUÍDO ===');
  console.log('Rota testada: GET /app/team (JOIN — O(1))');
  console.log('Compare latencia_dashboard_ms e taxa_erro com o Cenário A.');
}
