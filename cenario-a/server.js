// CENÁRIO A — Backend equivalente ao gerado pelo Lovable
// Replica fielmente as decisões arquiteturais do sistema original:
// - Padrão N+1 em queries (preservado intencionalmente)
// - Sem cache
// - Sem processamento assíncrono
// - Queries síncronas e bloqueantes
// - Sem connection pooling explícito

const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());

// Conexão direta ao banco — sem pool otimizado, sem retry logic
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'onboard',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 10, // limite baixo, como em deploys típicos de MVP
});

const JWT_SECRET = process.env.JWT_SECRET || 'onboard-secret-key';

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

// ── AUTH ──────────────────────────────────────────────────────────
app.post('/auth/signup', async (req, res) => {
  const { email, password, full_name, company_name } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // Cria empresa
    const companyRes = await pool.query(
      'INSERT INTO companies (name) VALUES ($1) RETURNING id',
      [company_name]
    );
    const companyId = companyRes.rows[0].id;

    // Cria usuário
    const userRes = await pool.query(
      'INSERT INTO users (email, password_hash, full_name, company_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [email, hashedPassword, full_name, companyId]
    );
    const userId = userRes.rows[0].id;

    // Atribui role admin
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
    // Query direta sem cache de sessão
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

// ── DASHBOARD DO GESTOR (rota crítica — N+1 preservado) ───────────
// Replica exatamente o padrão de app.team.tsx do Lovable:
// Para cada colaborador: 1 query de enrollments + 1 query de module_progress
// Total: 3 + 2*M queries para M colaboradores
app.get('/app/team', authMiddleware, async (req, res) => {
  const { companyId } = req.user;
  try {
    // Query 1: busca todos os perfis da empresa
    const profilesRes = await pool.query(
      'SELECT id, full_name, email FROM users WHERE company_id = $1',
      [companyId]
    );
    const profiles = profilesRes.rows;

    // Query 2: busca todas as trilhas da empresa
    const tracksRes = await pool.query(
      'SELECT id FROM tracks WHERE company_id = $1',
      [companyId]
    );
    const trackIds = tracksRes.rows.map(t => t.id);

    // Query 3: busca todos os módulos das trilhas
    let modulesAll = [];
    if (trackIds.length > 0) {
      const modulesRes = await pool.query(
        'SELECT id, track_id FROM modules WHERE track_id = ANY($1)',
        [trackIds]
      );
      modulesAll = modulesRes.rows;
    }

    // PADRÃO N+1: para cada colaborador, 2 queries adicionais
    // Com M colaboradores: 3 + 2*M queries totais
    const members = [];
    for (const p of profiles) {
      // Query N+1 (a): enrollments do colaborador
      const enrollsRes = await pool.query(
        'SELECT track_id FROM enrollments WHERE user_id = $1',
        [p.id]
      );
      const enrolledTrackIds = enrollsRes.rows.map(e => e.track_id);
      const enrolledModuleIds = modulesAll
        .filter(m => enrolledTrackIds.includes(m.track_id))
        .map(m => m.id);
      const totalModules = enrolledModuleIds.length;

      let completed = 0;
      if (totalModules > 0) {
        // Query N+1 (b): progresso do colaborador
        const progressRes = await pool.query(
          'SELECT COUNT(*) as count FROM module_progress WHERE user_id = $1 AND module_id = ANY($2) AND completed = true',
          [p.id, enrolledModuleIds]
        );
        completed = parseInt(progressRes.rows[0].count);
      }

      members.push({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        progress: { completed, total: totalModules },
      });
    }

    res.json({ members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DASHBOARD DO COLABORADOR (N+1 preservado) ─────────────────────
// Replica app.index.tsx: para cada trilha matriculada, 2 queries adicionais
app.get('/app/my-tracks', authMiddleware, async (req, res) => {
  const { userId } = req.user;
  try {
    // Query 1: enrollments do colaborador com dados da trilha
    const enrollsRes = await pool.query(
      `SELECT e.track_id, t.title, t.description
       FROM enrollments e
       JOIN tracks t ON t.id = e.track_id
       WHERE e.user_id = $1`,
      [userId]
    );

    // PADRÃO N+1: para cada trilha, 2 queries adicionais
    const tracks = [];
    for (const e of enrollsRes.rows) {
      // Query N+1 (a): módulos da trilha
      const modulesRes = await pool.query(
        'SELECT id FROM modules WHERE track_id = $1',
        [e.track_id]
      );
      const moduleIds = modulesRes.rows.map(m => m.id);

      let completed = 0;
      if (moduleIds.length > 0) {
        // Query N+1 (b): progresso do colaborador nos módulos
        const progressRes = await pool.query(
          'SELECT COUNT(*) as count FROM module_progress WHERE user_id = $1 AND module_id = ANY($2) AND completed = true',
          [userId, moduleIds]
        );
        completed = parseInt(progressRes.rows[0].count);
      }

      tracks.push({
        id: e.track_id,
        title: e.title,
        description: e.description,
        totalModules: moduleIds.length,
        completedModules: completed,
      });
    }

    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── MÓDULO ESPECÍFICO (3 queries síncronas) ───────────────────────
// Replica app.learn.$trackId.$moduleId.tsx
app.get('/app/modules/:moduleId', authMiddleware, async (req, res) => {
  const { moduleId } = req.params;
  const { userId } = req.user;
  try {
    // Query 1: dados do módulo
    const modRes = await pool.query(
      'SELECT id, title, content, track_id FROM modules WHERE id = $1',
      [moduleId]
    );
    const mod = modRes.rows[0];
    if (!mod) return res.status(404).json({ error: 'Módulo não encontrado' });

    // Query 2: questões do quiz — sem cache
    const quizRes = await pool.query(
      'SELECT * FROM quiz_questions WHERE module_id = $1 ORDER BY position',
      [moduleId]
    );

    // Query 3: progresso do usuário — sem cache
    const progressRes = await pool.query(
      'SELECT completed FROM module_progress WHERE user_id = $1 AND module_id = $2',
      [userId, moduleId]
    );

    res.json({
      module: mod,
      quiz: quizRes.rows,
      completed: progressRes.rows[0]?.completed ?? false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── MARCAR PROGRESSO (escrita síncrona, sem fila) ─────────────────
app.post('/app/modules/:moduleId/complete', authMiddleware, async (req, res) => {
  const { moduleId } = req.params;
  const { userId } = req.user;
  try {
    // Upsert síncrono — bloqueia a resposta até a escrita completar
    await pool.query(
      `INSERT INTO module_progress (user_id, module_id, completed, completed_at)
       VALUES ($1, $2, true, NOW())
       ON CONFLICT (user_id, module_id) DO UPDATE
       SET completed = true, completed_at = NOW()`,
      [userId, moduleId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── TRILHAS DA EMPRESA ────────────────────────────────────────────
app.get('/app/tracks', authMiddleware, async (req, res) => {
  const { companyId } = req.user;
  try {
    // Query sem cache — busca direto ao banco a cada requisição
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
    res.json({ tracks: tracksRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── HEALTH CHECK ──────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'db_unavailable' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Cenário A rodando na porta ${PORT}`));
