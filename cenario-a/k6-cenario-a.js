// SCRIPT K6 — Cenário A (Baseline gerado pelo Lovable)
//
// O que este script testa:
//   - GET /app/team: padrão N+1, executa 3+2M queries por requisição
//   - POST /app/modules/:id/complete: escrita SÍNCRONA — bloqueia HTTP
//     até o upsert completar (sem fila)
//
// Pré-requisitos:
//   cd cenario-a
//   docker compose up -d --build
//   sleep 15
//   node seed.js
//   k6 run k6-cenario-a.js 2>&1 | tee resultado-cenario-a-log.txt

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const latenciaDashboard = new Trend('latencia_dashboard_ms', true);
const latenciaEscrita   = new Trend('latencia_escrita_ms', true);
const taxaErro          = new Rate('taxa_erro');
const errosTotal        = new Counter('erros_total');

export const options = {
  // 100 VUs fixos por 3 minutos — estável o suficiente para o Codespaces
  // e suficiente para evidenciar o N+1 e a escrita síncrona sob carga
  vus:      100,
  duration: '3m',
  thresholds: {
    'http_req_failed':       ['rate<0.10'],
    'http_req_duration':     ['p(95)<5000'],
    'latencia_dashboard_ms': ['p(95)<2000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export function setup() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: 'manager1@test.com', password: 'senha123' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  const body = JSON.parse(res.body);
  if (!body.token) throw new Error('Login falhou: ' + res.body);

  // Pegar um moduleId válido para usar nas escritas
  const tracksRes = http.get(`${BASE_URL}/app/tracks`, {
    headers: { Authorization: `Bearer ${body.token}` },
  });
  const tracks = JSON.parse(tracksRes.body);
  const moduleId = tracks?.[0]?.modules?.[0]?.id || null;

  return { token: body.token, moduleId };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.token}`,
  };

  // 1. Dashboard do gestor — N+1: 3+2M queries por requisição
  const rTeam = http.get(`${BASE_URL}/app/team`, { headers });
  latenciaDashboard.add(rTeam.timings.duration);

  const okTeam = check(rTeam, {
    'team: status 200':      (r) => r.status === 200,
    'team: retorna members': (r) => {
      try { return JSON.parse(r.body).members !== undefined; }
      catch { return false; }
    },
  });
  if (!okTeam) { errosTotal.add(1); taxaErro.add(1); } else { taxaErro.add(0); }

  sleep(0.5);

  // 2. Escrita síncrona — bloqueia HTTP até o upsert completar (sem fila)
  if (data.moduleId) {
    const rComplete = http.post(
      `${BASE_URL}/app/modules/${data.moduleId}/complete`,
      JSON.stringify({}),
      { headers }
    );
    latenciaEscrita.add(rComplete.timings.duration);
    check(rComplete, { 'complete: status 200': (r) => r.status === 200 });
  }

  sleep(1);
}

export function teardown() {
  console.log('\n=== CENÁRIO A CONCLUÍDO ===');
  console.log('Rotas testadas:');
  console.log('  GET  /app/team              — padrão N+1 (sem fila, sem cache)');
  console.log('  POST /app/modules/:id/complete — escrita síncrona (bloqueia HTTP)');
  console.log('Verifique latencia_dashboard_ms e latencia_escrita_ms nos resultados.');
}
