// ═══════════════════════════════════════════════════════════════════
// CENÁRIO B — Arquitetura Refatorada
// Gerado via Claude (claude-sonnet-4-5) com prompts arquiteturais explícitos.
//
// Cada bloco de refatoração abaixo foi produzido por um prompt específico,
// documentado na Seção 7 do artigo. As quatro intervenções, em ordem de
// impacto sobre o ponto de ruptura identificado no Cenário A:
//
//   R1 — Eliminação do padrão N+1  (§7.2)
//   R2 — Pool de conexões otimizado (§7.3)
//   R3 — Cache em memória com TTL   (§7.4)
//   R4 — Fila assíncrona de escritas (§7.5)
//
// Stack idêntica ao Cenário A: Node.js + Express + PostgreSQL (pg).
// Diferença exclusivamente arquitetural — mesma linguagem, mesmo banco,
// mesmo schema, mesmo seed. Isso garante que os resultados dos testes
// K6 sejam atribuíveis às decisões de design, não à tecnologia.
// ═══════════════════════════════════════════════════════════════════

const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const NodeCache = require('node-cache');

const app = express();
app.use(express.json());

// ═══════════════════════════════════════════════════════════════════
// R2 — POOL DE CONEXÕES OTIMIZADO
//
// PROMPT UTILIZADO:
// "Ajuste a configuração do Pool do PostgreSQL neste server.js.
//  O pool atual tem max: 10, sem timeout configurado e sem estratégia
//  de retry. Isso causa esgotamento de conexões sob carga.
//  Substitua por uma configuração para produção: max 20 conexões,
//  idleTimeoutMillis 30000, connectionTimeoutMillis 2000. Adicione
//  handler de erro no pool para logar sem derrubar o processo.
//  Adicione middleware global de timeout nas rotas (5000ms) que
//  retorne 503 em vez de deixar a requisição pendurada."
//
// PROBLEMA ORIGINAL:
//   max: 10 — com o padrão N+1 do Cenário A gerando 103 queries por
//   request do gestor, o pool esgotava em ~10 requisições simultâneas.
//
// DECISÃO ARQUITETURAL:
//   max: 20 dobra a capacidade de conexões concorrentes ao banco.
//   idleTimeoutMillis: 30s libera conexões ociosas, evitando acúmulo.
//   connectionTimeoutMillis: 2s retorna erro imediato ao invés de
//   deixar o cliente esperando indefinidamente (fail-fast).
// ═══════════════════════════════════════════════════════════════════
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'onboard',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,                      // dobro do Cenário A — suporta mais concorrência
  idleTimeoutMillis: 30000,     // libera conexões ociosas após 30s
  connectionTimeoutMillis: 2000, // fail-fast: erro em 2s se pool esgotado
});

// Handler de erro no pool — loga sem derrubar o processo Node
// Sem isso, um erro de conexão emite um evento 'error' não tratado
// que derruba o servidor inteiro em produção.
pool.on('error', (err) => {
  console.error('[pool] erro inesperado em cliente ocioso:', err.message);
});

const JWT_SECRET = process.env.JWT_SECRET || 'onboard-secret-key';

// Middleware de timeout global: retorna 503 após 5s sem resposta.
// Evita que requisições lentas (ex: banco sobrecarregado) fiquem
// ocupando conexões do pool indefinidamente.
app.use((req, res, next) => {
  res.setTimeout(5000, () => {
    res.status(503).json({ error: 'Timeout — servidor sobrecarregado' });
  });
  next();
});

// ═══════════════════════════════════════════════════════════════════
// R3 — CACHE EM MEMÓRIA COM TTL
//
// PROMPT UTILIZADO:
// "Adicione cache em memória (node-cache) neste server.js para:
//  1. GET /app/tracks — cache por company_id, TTL 60s
//  2. GET /app/modules/:moduleId — cache por moduleId, TTL 300s,
//     incluindo o quiz no objeto cacheado
//  Para cada endpoint: verifique cache antes do banco. Cache hit:
//  retorne com header X-Cache: HIT. Cache miss: busque no banco,
//  armazene, retorne com X-Cache: MISS.
//  Não adicione cache em /app/team nem /app/my-tracks (dados de
//  progresso precisam ser frescos). Comente o TTL de cada rota."
//
// PROBLEMA ORIGINAL:
//   Trilhas e módulos são dados quase-estáticos: mudam raramente
//   comparado à frequência de leitura. No Cenário A, cada um dos
//   5.000 VUs simultâneos gerava uma query independente ao banco
//   para os mesmos dados.
//
// DECISÃO ARQUITETURAL:
//   TTL de 60s para trilhas: gestores editam trilhas com baixa
//   frequência; 60s de staleness é aceitável e reduz ~98% das
//   queries de leitura de trilhas sob carga.
//   TTL de 300s para módulos: conteúdo de módulo é praticamente
//   estático durante uma sessão de uso; 5 minutos elimina
//   virtualmente todas as queries repetidas ao banco.
// ═══════════════════════════════════════════════════════════════════
const cache = new NodeCache({ useClones: false });

const TTL_TRACKS  = 60;   // 60s — trilhas mudam raramente; staleness aceitável
const TTL_MODULES = 300;  // 300s — conteúdo de módulo é estático por sessão

// ── MIDDLEWARE DE AUTH ────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

// ── AUTH (sem alteração — não é gargalo de escalabilidade) ────────
app.post('/auth/signup', async (req, res) => {
  const { email, password, full_name, company_name } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const companyRes = await pool.query(
      'INSERT INTO companies (name) VALUES ($1) RETURNING id',
      [company_name]
    );
    const companyId = companyRes.rows[0].id;
    const userRes = await pool.query(
      'INSERT INTO users (email, password_hash, full_name, company_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [email, hashedPassword, full_name, companyId]
    );
    const userId = userRes.rows[0].id;
    await pool.query(
      'INSERT INTO user_roles (user_id, company_id, role) VALUES ($1, $2, $3)',
      [userId, companyId, 'admin']
    );
    const token = jwt.sign({ userId, companyId, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId, companyId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const userRes = await pool.query(
      'SELECT u.*, ur.role FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id WHERE u.email = $1 LIMIT 1',
      [email]
    );
    const user = userRes.rows[0];
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });
    const token = jwt.sign(
      { userId: user.id, companyId: user.company_id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, userId: user.id, companyId: user.company_id, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// R1 — ELIMINAÇÃO DO PADRÃO N+1: DASHBOARD DO GESTOR
//
// PROMPT UTILIZADO:
// "O endpoint GET /app/team tem um padrão N+1 crítico: para cada
//  colaborador no array profiles, ele executa 2 queries síncronas
//  dentro de um loop for/await. Com 50 colaboradores, isso gera
//  103 queries por requisição.
//  Refatore APENAS este endpoint para eliminar o N+1 usando uma
//  única query SQL com JOINs e GROUP BY que retorne em uma só ida
//  ao banco: id, full_name, email de cada usuário da empresa, total
//  de módulos matriculados, total de módulos completados.
//  Mantenha a mesma estrutura de resposta JSON.
//  Adicione comentário explicando o que foi eliminado."
//
// PROBLEMA ORIGINAL (Cenário A):
//   Loop for/await com 2 queries por colaborador:
//   3 + 2*M queries totais. Com M=50: 103 queries por request.
//   Causa raiz do colapso em 2.413 VUs nos testes K6.
//
// SOLUÇÃO APLICADA:
//   Uma única query com LEFT JOINs em enrollments, modules e
//   module_progress, agregada com COUNT + FILTER.
//   Resultado: 1 query por request, independente de M.
//   Redução: de 103 para 1 query — 99% de redução no Cenário A.
// ═══════════════════════════════════════════════════════════════════
app.get('/app/team', authMiddleware, async (req, res) => {
  const { companyId } = req.user;
  try {
    // Query única com JOINs — substitui o loop N+1 do Cenário A.
    // COUNT(DISTINCT ...) FILTER (WHERE ...) agrega em uma só passagem:
    // - total_modules: módulos nos quais o colaborador está matriculado
    // - completed_modules: subconjunto com completed = true
    const result = await pool.query(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         COUNT(DISTINCT m.id)                                          AS total_modules,
         COUNT(DISTINCT mp.module_id) FILTER (WHERE mp.completed = true) AS completed_modules
       FROM users u
       LEFT JOIN enrollments e   ON e.user_id  = u.id
       LEFT JOIN modules m       ON m.track_id = e.track_id
       LEFT JOIN module_progress mp ON mp.user_id = u.id AND mp.module_id = m.id
       WHERE u.company_id = $1
       GROUP BY u.id, u.full_name, u.email
       ORDER BY u.full_name`,
      [companyId]
    );

    const members = result.rows.map(r => ({
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      progress: {
        completed: parseInt(r.completed_modules),
        total: parseInt(r.total_modules),
      },
    }));

    res.json({ members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// R1 — ELIMINAÇÃO DO PADRÃO N+1: DASHBOARD DO COLABORADOR
//
// PROMPT UTILIZADO (continuação do mesmo prompt acima):
// "Mesma coisa para GET /app/my-tracks: elimine o loop N+1 usando
//  uma query com JOIN entre enrollments, modules e module_progress."
//
// PROBLEMA ORIGINAL (Cenário A):
//   Para cada trilha matriculada: 2 queries adicionais no loop.
//   Com T trilhas: 1 + 2*T queries por request.
//
// SOLUÇÃO APLICADA:
//   JOIN direto entre enrollments, modules e module_progress com
//   GROUP BY por trilha. Reduz de 1+2*T para 1 query fixa.
// ═══════════════════════════════════════════════════════════════════
app.get('/app/my-tracks', authMiddleware, async (req, res) => {
  const { userId } = req.user;
  try {
    // Query única — elimina o loop for/await do Cenário A.
    // Agrega total e completados por trilha em uma só passagem.
    const result = await pool.query(
      `SELECT
         t.id                                                             AS track_id,
         t.title,
         t.description,
         COUNT(DISTINCT m.id)                                             AS total_modules,
         COUNT(DISTINCT mp.module_id) FILTER (WHERE mp.completed = true)  AS completed_modules
       FROM enrollments e
       JOIN tracks t  ON t.id = e.track_id
       LEFT JOIN modules m ON m.track_id = t.id
       LEFT JOIN module_progress mp ON mp.user_id = e.user_id AND mp.module_id = m.id
       WHERE e.user_id = $1
       GROUP BY t.id, t.title, t.description`,
      [userId]
    );

    const tracks = result.rows.map(r => ({
      id: r.track_id,
      title: r.title,
      description: r.description,
      totalModules: parseInt(r.total_modules),
      completedModules: parseInt(r.completed_modules),
    }));

    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── MÓDULO ESPECÍFICO — com cache R3 ─────────────────────────────
app.get('/app/modules/:moduleId', authMiddleware, async (req, res) => {
  const { moduleId } = req.params;
  const { userId } = req.user;

  // Cache aplicado ao conteúdo estático do módulo (dados + quiz).
  // O progresso do usuário é sempre buscado ao vivo (dado dinâmico).
  const cacheKey = `module:${moduleId}`;
  let moduleData = cache.get(cacheKey);

  if (moduleData) {
    // Cache HIT — retorna sem tocar no banco para dados estáticos
    res.setHeader('X-Cache', 'HIT');
    const progressRes = await pool.query(
      'SELECT completed FROM module_progress WHERE user_id = $1 AND module_id = $2',
      [userId, moduleId]
    );
    return res.json({
      ...moduleData,
      completed: progressRes.rows[0]?.completed ?? false,
    });
  }

  // Cache MISS — busca no banco e armazena
  res.setHeader('X-Cache', 'MISS');
  try {
    const modRes = await pool.query(
      'SELECT id, title, content, track_id FROM modules WHERE id = $1',
      [moduleId]
    );
    const mod = modRes.rows[0];
    if (!mod) return res.status(404).json({ error: 'Módulo não encontrado' });

    const quizRes = await pool.query(
      'SELECT * FROM quiz_questions WHERE module_id = $1 ORDER BY position',
      [moduleId]
    );

    // Armazena apenas dados estáticos no cache (módulo + quiz)
    moduleData = { module: mod, quiz: quizRes.rows };
    cache.set(cacheKey, moduleData, TTL_MODULES);

    const progressRes = await pool.query(
      'SELECT completed FROM module_progress WHERE user_id = $1 AND module_id = $2',
      [userId, moduleId]
    );

    res.json({
      ...moduleData,
      completed: progressRes.rows[0]?.completed ?? false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// R4 — FILA ASSÍNCRONA DE ESCRITAS
//
// PROMPT UTILIZADO:
// "Refatore POST /app/modules/:moduleId/complete para usar
//  processamento assíncrono com fila em memória simples (sem Redis).
//  O problema: o upsert bloqueia a resposta HTTP até a escrita
//  completar. Sob carga, isso esgota o pool com escritas que o
//  usuário não precisa esperar.
//  Implemente: fila simples (array + setInterval) processando
//  escritas em batch a cada 500ms. O endpoint deve adicionar o job
//  na fila e retornar imediatamente { success: true, queued: true }.
//  Worker processa máximo 50 jobs por ciclo com upserts em batch.
//  Endpoint GET /health/queue retorna tamanho atual da fila.
//  Comente o tradeoff de consistência eventual."
//
// PROBLEMA ORIGINAL (Cenário A):
//   Upsert síncrono em module_progress bloqueava a thread e ocupava
//   uma conexão do pool até a escrita terminar. Com 30% dos VUs
//   marcando progresso simultaneamente, gerava contenção direta no pool.
//
// TRADEOFF DE CONSISTÊNCIA EVENTUAL:
//   O usuário recebe confirmação imediata, mas o registro no banco
//   ocorre até 500ms depois. Em caso de falha do servidor nessa janela,
//   o progresso pode ser perdido. Para o contexto de onboarding
//   (baixo risco de perda de dado), esse tradeoff é aceitável e
//   representa ganho significativo de throughput sob pico de carga.
// ═══════════════════════════════════════════════════════════════════

// Fila em memória: array simples de jobs pendentes
const writeQueue = [];
const BATCH_SIZE    = 50;   // máximo de upserts por ciclo
const BATCH_INTERVAL = 500; // processa a cada 500ms

// Worker da fila — executa em background a cada BATCH_INTERVAL
setInterval(async () => {
  if (writeQueue.length === 0) return;

  // Drena até BATCH_SIZE jobs do início da fila
  const batch = writeQueue.splice(0, BATCH_SIZE);

  // Upsert em batch: uma query com múltiplos VALUES
  // Mais eficiente que N queries individuais
  const values = [];
  const params = [];
  batch.forEach(({ userId, moduleId }, i) => {
    const base = i * 2;
    values.push(`($${base + 1}, $${base + 2}, true, NOW())`);
    params.push(userId, moduleId);
  });

  try {
    await pool.query(
      `INSERT INTO module_progress (user_id, module_id, completed, completed_at)
       VALUES ${values.join(', ')}
       ON CONFLICT (user_id, module_id) DO UPDATE
       SET completed = true, completed_at = NOW()`,
      params
    );
  } catch (err) {
    // Loga sem derrubar o processo — jobs perdidos são aceitáveis
    // no contexto de onboarding (ver tradeoff acima)
    console.error(`[queue] erro ao processar batch de ${batch.length} jobs:`, err.message);
  }
}, BATCH_INTERVAL);

// Endpoint de progresso — retorna imediatamente, escrita é assíncrona
app.post('/app/modules/:moduleId/complete', authMiddleware, async (req, res) => {
  const { moduleId } = req.params;
  const { userId } = req.user;

  // Enfileira o job e retorna sem esperar a escrita
  writeQueue.push({ userId, moduleId });
  res.json({ success: true, queued: true });
});

// ── TRILHAS DA EMPRESA — com cache R3 ────────────────────────────
app.get('/app/tracks', authMiddleware, async (req, res) => {
  const { companyId } = req.user;
  const cacheKey = `tracks:${companyId}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.json({ tracks: cached });
  }

  res.setHeader('X-Cache', 'MISS');
  try {
    const tracksRes = await pool.query(
      `SELECT t.id, t.title, t.description,
              COUNT(m.id) as module_count
       FROM tracks t
       LEFT JOIN modules m ON m.track_id = t.id
       WHERE t.company_id = $1
       GROUP BY t.id
       ORDER BY t.created_at DESC`,
      [companyId]
    );
    // TTL de 60s: gestores raramente editam trilhas durante uma sessão ativa
    cache.set(cacheKey, tracksRes.rows, TTL_TRACKS);
    res.json({ tracks: tracksRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── HEALTH CHECK — com monitoramento da fila (R4) ─────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'db_unavailable' });
  }
});

// Endpoint de monitoramento da fila assíncrona
// Útil para observar acúmulo durante os testes K6
app.get('/health/queue', (req, res) => {
  res.json({
    queue_size: writeQueue.length,
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Cenário B rodando na porta ${PORT}`));