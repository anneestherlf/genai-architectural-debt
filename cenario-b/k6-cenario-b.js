// SCRIPT K6 — Cenário B (Arquitetura refatorada)
//
// O que este script testa:
//   - GET /app/team: 1 query com JOIN (vs. N+1 do Cenário A)
//   - POST /app/modules/:id/complete: escrita ASSÍNCRONA com fila em memória
//     — retorna imediatamente { success: true, queued: true }
//   - GET /health/queue: monitora tamanho da fila ao longo do teste
//
// Diferenças arquiteturais testadas:
//   R1 — JOIN elimina o N+1
//   R2 — Pool max:20 com timeout de 2s (fail-fast 503)
//   R3 — Cache TTL 60-300s (exercitado via /app/tracks)
//   R4 — Fila assíncrona de escritas
//
// Pré-requisitos:
//   cd cenario-b
//   docker compose up -d --build
//   sleep 15
//   node seed.js
//   k6 run k6-cenario-b.js 2>&1 | tee resultado-cenario-b-log.txt

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter, Gauge } from 'k6/metrics';

const latenciaDashboard = new Trend('latencia_dashboard_ms', true);
const latenciaEscrita   = new Trend('latencia_escrita_ms', true);
const latenciaCache     = new Trend('latencia_cache_ms', true);
const taxaErro          = new Rate('taxa_erro');
const errosTotal        = new Counter('erros_total');
const tamanhoFila       = new Gauge('fila_tamanho');

export const options = {
  // Mesmo protocolo do Cenário A — comparação direta
  vus:      100,
  duration: '3m',
  thresholds: {
    'http_req_failed':       ['rate<0.01'],  // SLA mais estrito: < 1% erro
    'http_req_duration':     ['p(95)<500'],  // SLA: p95 < 500ms
    'latencia_dashboard_ms': ['p(95)<500'],
    'latencia_escrita_ms':   ['p(95)<100'],  // fila deve retornar quase imediato
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

  // 1. Dashboard do gestor — 1 query com JOIN (O(1), independente de M)
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

  // 2. Escrita assíncrona com fila — deve retornar imediatamente
  if (data.moduleId) {
    const rComplete = http.post(
      `${BASE_URL}/app/modules/${data.moduleId}/complete`,
      JSON.stringify({}),
      { headers }
    );
    latenciaEscrita.add(rComplete.timings.duration);
    check(rComplete, {
      'complete: status 200': (r) => r.status === 200,
      'complete: queued':     (r) => {
        try { return JSON.parse(r.body).queued === true; }
        catch { return false; }
      },
    });
  }

  sleep(0.5);

  // 3. Endpoint com cache — exercita R3 (cache TTL 60s)
  const rTracks = http.get(`${BASE_URL}/app/tracks`, { headers });
  latenciaCache.add(rTracks.timings.duration);
  check(rTracks, { 'tracks: status 200': (r) => r.status === 200 });

  // 4. Monitorar tamanho da fila a cada 10 iterações
  if (__ITER % 10 === 0) {
    const rQueue = http.get(`${BASE_URL}/health/queue`);
    if (rQueue.status === 200) {
      try {
        const q = JSON.parse(rQueue.body);
        tamanhoFila.add(q.queue_size || 0);
      } catch {}
    }
  }

  sleep(1);
}

export function teardown() {
  console.log('\n=== CENÁRIO B CONCLUÍDO ===');
  console.log('Rotas testadas:');
  console.log('  GET  /app/team                 — JOIN (1 query, O(1))');
  console.log('  POST /app/modules/:id/complete — fila assíncrona (queued: true)');
  console.log('  GET  /app/tracks               — cache TTL 60s (R3)');
  console.log('  GET  /health/queue             — monitoramento da fila (R4)');
  console.log('Compare latencia_dashboard_ms e latencia_escrita_ms com o Cenário A.');
}
