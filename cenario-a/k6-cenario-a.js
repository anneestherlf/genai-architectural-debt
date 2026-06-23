// SCRIPT K6 — Cenário A
// Testa a rota crítica GET /app/team (padrão N+1)
// Cada requisição dispara 3+2M queries ao banco (M = colaboradores)
//
// Execução:
//   k6 run k6-cenario-a.js 2>&1 | tee resultado-cenario-a-log.txt
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
  stages: [
    { duration: '60s', target: 100  }, // E1
    { duration: '60s', target: 500  }, // E2
    { duration: '60s', target: 1000 }, // E3
    { duration: '60s', target: 2000 }, // E4 — reduzido para o ambiente
    { duration: '60s', target: 3000 }, // E5 — ponto de ruptura esperado
  ],
  thresholds: {
    'http_req_failed':    ['rate<0.10'],
    'http_req_duration':  ['p(95)<5000'],
    'latencia_dashboard_ms': ['p(95)<2000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export function setup() {
  // Login como gestor — único papel que acessa /app/team
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

  // Rota crítica: dashboard do gestor (N+1 — 3+2M queries por req)
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

  sleep(1); // 1s entre requisições por VU
}

export function teardown() {
  console.log('\n=== CENÁRIO A CONCLUÍDO ===');
  console.log('Rota testada: GET /app/team (padrão N+1)');
  console.log('Verifique latencia_dashboard_ms e taxa_erro para o ponto de ruptura.');
}
