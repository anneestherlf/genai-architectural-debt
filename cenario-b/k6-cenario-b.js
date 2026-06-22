// SCRIPT K6 — Cenário B
// Testa o padrão Fan-out do módulo de trilhas de aprendizado
// Simula o comportamento real de colaboradores acessando a plataforma
//
// Execução:
//   k6 run --out json=resultados-cenario-b.json k6-cenario-b.js
//
// Pré-requisito: backend rodando em http://localhost:3000
//   docker-compose up -d

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ── MÉTRICAS CUSTOMIZADAS ─────────────────────────────────────────
const erros = new Counter('erros_totais');
const latenciaDashboard = new Trend('latencia_dashboard_gestor', true);
const latenciaTrilhas = new Trend('latencia_trilhas_colaborador', true);
const latenciaModulo = new Trend('latencia_modulo', true);
const taxaErro = new Rate('taxa_erro');

// ── CONFIGURAÇÃO DOS ESTÁGIOS ─────────────────────────────────────
// Protocolo definido na Seção 5.5 da Metodologia:
// 5 estágios progressivos, 60s cada, com critérios de continuidade
export const options = {
  stages: [
    { duration: '60s', target: 100 },   // E1: 100 usuários
    { duration: '60s', target: 500 },   // E2: 500 usuários
    { duration: '60s', target: 1000 },  // E3: 1.000 usuários
    { duration: '60s', target: 5000 },  // E4: 5.000 usuários
    { duration: '60s', target: 10000 }, // E5: 10.000 usuários (ponto de ruptura esperado)
  ],
  thresholds: {
    // Critérios de aceitação por estágio (conforme Tabela 2 da Metodologia)
    'http_req_duration{stage:E1}': ['p(95)<300'],
    'http_req_duration{stage:E2}': ['p(95)<500'],
    'http_req_duration{stage:E3}': ['p(95)<1000'],
    'http_req_duration{stage:E4}': ['p(95)<2000'],
    'http_req_failed': ['rate<0.10'],   // colapso acima de 10% de erros
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// ── SETUP: login e obtenção de tokens ────────────────────────────
// K6 executa setup uma vez antes dos testes
export function setup() {
  // Login como gestor (para testar dashboard de equipe — rota N+1 crítica)
  const gestorLogin = http.post(`${BASE_URL}/auth/login`,
    JSON.stringify({ email: 'manager1@test.com', password: 'senha123' }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  // Login como colaborador (para testar dashboard de trilhas)
  const colaboradorLogin = http.post(`${BASE_URL}/auth/login`,
    JSON.stringify({ email: 'employee3@test.com', password: 'senha123' }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  // Busca um módulo para testar a rota de módulo individual
  const tracksRes = http.get(`${BASE_URL}/app/tracks`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${JSON.parse(gestorLogin.body).token}`,
    }
  });

  const tracks = JSON.parse(tracksRes.body).tracks || [];
  const firstTrackId = tracks[0]?.id;

  let firstModuleId = null;
  if (firstTrackId) {
    // Pega o primeiro módulo disponível para o teste de módulo
    const modRes = http.get(`${BASE_URL}/app/tracks`, {
      headers: { 'Authorization': `Bearer ${JSON.parse(gestorLogin.body).token}` }
    });
    firstModuleId = JSON.parse(modRes.body)?.tracks?.[0]?.id;
  }

  return {
    gestorToken: JSON.parse(gestorLogin.body).token,
    colaboradorToken: JSON.parse(colaboradorLogin.body).token,
    firstModuleId,
  };
}

// ── CENÁRIO PRINCIPAL ─────────────────────────────────────────────
// Simula o padrão Fan-out: múltiplos usuários acessando trilhas simultaneamente
export default function (data) {
  const isGestor = Math.random() < 0.2; // 20% gestores, 80% colaboradores
  const token = isGestor ? data.gestorToken : data.colaboradorToken;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  if (isGestor) {
    // ── FLUXO GESTOR: acessa dashboard de equipe (rota N+1 crítica) ──
    const r = http.get(`${BASE_URL}/app/team`, { headers, tags: { stage: getStage() } });
    latenciaDashboard.add(r.timings.duration);

    const ok = check(r, {
      'dashboard gestor: status 200': (res) => res.status === 200,
      'dashboard gestor: retorna members': (res) => {
        try { return JSON.parse(res.body).members !== undefined; }
        catch { return false; }
      },
    });

    if (!ok) { erros.add(1); taxaErro.add(1); }
    else { taxaErro.add(0); }

  } else {
    // ── FLUXO COLABORADOR: acessa trilhas e módulo ────────────────

    // Passo 1: lista as trilhas do colaborador
    const r1 = http.get(`${BASE_URL}/app/my-tracks`, { headers, tags: { stage: getStage() } });
    latenciaTrilhas.add(r1.timings.duration);

    const ok1 = check(r1, {
      'trilhas colaborador: status 200': (res) => res.status === 200,
      'trilhas colaborador: retorna tracks': (res) => {
        try { return Array.isArray(JSON.parse(res.body).tracks); }
        catch { return false; }
      },
    });

    if (!ok1) { erros.add(1); taxaErro.add(1); }
    else { taxaErro.add(0); }

    // Passo 2: acessa um módulo específico (se disponível)
    if (data.firstModuleId) {
      sleep(0.5); // simula tempo de navegação do usuário

      const r2 = http.get(`${BASE_URL}/app/modules/${data.firstModuleId}`, {
        headers, tags: { stage: getStage() }
      });
      latenciaModulo.add(r2.timings.duration);

      const ok2 = check(r2, {
        'módulo: status 200': (res) => res.status === 200,
        'módulo: retorna conteúdo': (res) => {
          try { return JSON.parse(res.body).module !== undefined; }
          catch { return false; }
        },
      });

      if (!ok2) { erros.add(1); taxaErro.add(1); }
      else { taxaErro.add(0); }

      // Passo 3: 30% de chance de marcar progresso (escrita ao banco)
      if (Math.random() < 0.3) {
        sleep(0.3);
        const r3 = http.post(
          `${BASE_URL}/app/modules/${data.firstModuleId}/complete`,
          null,
          { headers, tags: { stage: getStage() } }
        );
        check(r3, { 'progresso: status 200': (res) => res.status === 200 });
      }
    }
  }

  // Pausa entre requisições — simula comportamento humano
  sleep(Math.random() * 2 + 0.5); // 0.5s a 2.5s
}

// ── HELPERS ───────────────────────────────────────────────────────
function getStage() {
  const elapsed = Math.floor(__ITER / 100); // aproximação do estágio atual
  if (elapsed < 1) return 'E1';
  if (elapsed < 2) return 'E2';
  if (elapsed < 3) return 'E3';
  if (elapsed < 4) return 'E4';
  return 'E5';
}

// ── TEARDOWN: sumário dos resultados ─────────────────────────────
export function teardown(data) {
  console.log('\n═══ RESULTADO DO CENÁRIO A ═══');
  console.log('Métricas coletadas em: resultados-cenario-a.json');
  console.log('Analise com: k6 report resultados-cenario-a.json');
}
