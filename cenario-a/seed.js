// SEED DE DADOS SINTÉTICOS — Cenário A
// Gera volume realista para stress testing:
// - 10 empresas
// - 1 admin + 2 gestores + 50 colaboradores por empresa = 530 usuários total
// - 5 trilhas por empresa = 50 trilhas
// - 8 módulos por trilha = 400 módulos
// - 3 questões de quiz por módulo = 1.200 questões
// - ~70% dos colaboradores matriculados em todas as trilhas
// - ~40% de progresso médio preenchido

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'onboard',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Senha padrão para todos os usuários de teste
const PASSWORD_HASH = bcrypt.hashSync('senha123', 10);

const COMPANIES = 10;
const ADMINS_PER_COMPANY = 1;
const MANAGERS_PER_COMPANY = 2;
const EMPLOYEES_PER_COMPANY = 50;
const TRACKS_PER_COMPANY = 5;
const MODULES_PER_TRACK = 8;
const QUIZ_PER_MODULE = 3;
const ENROLLMENT_RATE = 0.7;  // 70% dos colaboradores matriculados em cada trilha
const PROGRESS_RATE = 0.4;    // 40% dos módulos concluídos em média

async function seed() {
  console.log('Iniciando seed de dados sintéticos...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Limpa dados anteriores
    await client.query('TRUNCATE module_progress, quiz_attempts, enrollments, quiz_questions, modules, tracks, user_roles, users, companies RESTART IDENTITY CASCADE');
    console.log('Tabelas limpas.');

    // Armazena IDs para referência cruzada
    const companyIds = [];
    const usersByCompany = {};  // companyId -> { admins, managers, employees }
    const tracksByCompany = {}; // companyId -> [trackIds]
    const modulesByTrack = {};  // trackId -> [moduleIds]

    // ── EMPRESAS ──────────────────────────────────────────────────
    for (let c = 0; c < COMPANIES; c++) {
      const res = await client.query(
        'INSERT INTO companies (name) VALUES ($1) RETURNING id',
        [`Empresa ${String.fromCharCode(65 + c)} Ltda`]
      );
      companyIds.push(res.rows[0].id);
    }
    console.log(`${COMPANIES} empresas criadas.`);

    // ── USUÁRIOS ──────────────────────────────────────────────────
    let totalUsers = 0;
    for (const companyId of companyIds) {
      usersByCompany[companyId] = { admins: [], managers: [], employees: [] };

      // Admin
      for (let i = 0; i < ADMINS_PER_COMPANY; i++) {
        const res = await client.query(
          'INSERT INTO users (company_id, full_name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id',
          [companyId, `Admin ${totalUsers}`, `admin${totalUsers}@test.com`, PASSWORD_HASH]
        );
        const userId = res.rows[0].id;
        await client.query(
          'INSERT INTO user_roles (user_id, company_id, role) VALUES ($1, $2, $3)',
          [userId, companyId, 'admin']
        );
        usersByCompany[companyId].admins.push(userId);
        totalUsers++;
      }

      // Gestores
      for (let i = 0; i < MANAGERS_PER_COMPANY; i++) {
        const res = await client.query(
          'INSERT INTO users (company_id, full_name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id',
          [companyId, `Gestor ${totalUsers}`, `manager${totalUsers}@test.com`, PASSWORD_HASH]
        );
        const userId = res.rows[0].id;
        await client.query(
          'INSERT INTO user_roles (user_id, company_id, role) VALUES ($1, $2, $3)',
          [userId, companyId, 'manager']
        );
        usersByCompany[companyId].managers.push(userId);
        totalUsers++;
      }

      // Colaboradores
      for (let i = 0; i < EMPLOYEES_PER_COMPANY; i++) {
        const res = await client.query(
          'INSERT INTO users (company_id, full_name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id',
          [companyId, `Colaborador ${totalUsers}`, `employee${totalUsers}@test.com`, PASSWORD_HASH]
        );
        const userId = res.rows[0].id;
        await client.query(
          'INSERT INTO user_roles (user_id, company_id, role) VALUES ($1, $2, $3)',
          [userId, companyId, 'employee']
        );
        usersByCompany[companyId].employees.push(userId);
        totalUsers++;
      }
    }
    console.log(`${totalUsers} usuários criados.`);

    // ── TRILHAS ───────────────────────────────────────────────────
    const trackTopics = [
      'Cultura e Valores da Empresa',
      'Processos e Ferramentas Internas',
      'Segurança da Informação',
      'Comunicação e Colaboração',
      'Desenvolvimento Profissional',
    ];

    let totalTracks = 0;
    let totalModules = 0;
    let totalQuestions = 0;

    for (const companyId of companyIds) {
      tracksByCompany[companyId] = [];

      for (let t = 0; t < TRACKS_PER_COMPANY; t++) {
        const trackRes = await client.query(
          'INSERT INTO tracks (company_id, title, description) VALUES ($1, $2, $3) RETURNING id',
          [
            companyId,
            trackTopics[t],
            `Trilha de ${trackTopics[t]} para novos colaboradores.`,
          ]
        );
        const trackId = trackRes.rows[0].id;
        tracksByCompany[companyId].push(trackId);
        modulesByTrack[trackId] = [];
        totalTracks++;

        // Módulos
        for (let m = 0; m < MODULES_PER_TRACK; m++) {
          const modRes = await client.query(
            'INSERT INTO modules (track_id, title, content, position) VALUES ($1, $2, $3, $4) RETURNING id',
            [
              trackId,
              `Módulo ${m + 1}: ${trackTopics[t]}`,
              `Conteúdo do módulo ${m + 1} sobre ${trackTopics[t]}. `.repeat(20),
              m,
            ]
          );
          const moduleId = modRes.rows[0].id;
          modulesByTrack[trackId].push(moduleId);
          totalModules++;

          // Questões de quiz
          for (let q = 0; q < QUIZ_PER_MODULE; q++) {
            await client.query(
              `INSERT INTO quiz_questions
               (module_id, question, option_a, option_b, option_c, option_d, correct_option, position)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                moduleId,
                `Pergunta ${q + 1} sobre ${trackTopics[t]}?`,
                'Opção A — correta',
                'Opção B — incorreta',
                'Opção C — incorreta',
                'Opção D — incorreta',
                0,
                q,
              ]
            );
            totalQuestions++;
          }
        }
      }
    }
    console.log(`${totalTracks} trilhas, ${totalModules} módulos, ${totalQuestions} questões criadas.`);

    // ── MATRÍCULAS E PROGRESSO ────────────────────────────────────
    let totalEnrollments = 0;
    let totalProgress = 0;

    for (const companyId of companyIds) {
      const employees = usersByCompany[companyId].employees;
      const tracks = tracksByCompany[companyId];

      for (const employeeId of employees) {
        for (const trackId of tracks) {
          // 70% de chance de matrícula
          if (Math.random() > ENROLLMENT_RATE) continue;

          await client.query(
            'INSERT INTO enrollments (user_id, track_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [employeeId, trackId]
          );
          totalEnrollments++;

          // Para cada módulo da trilha, 40% de chance de ter progresso
          const modules = modulesByTrack[trackId];
          let canProgress = true; // simula progressão sequencial
          for (const moduleId of modules) {
            if (!canProgress) break;
            if (Math.random() > PROGRESS_RATE) {
              canProgress = false;
              continue;
            }
            await client.query(
              `INSERT INTO module_progress (user_id, module_id, completed, completed_at)
               VALUES ($1, $2, true, NOW() - INTERVAL '${Math.floor(Math.random() * 30)} days')
               ON CONFLICT DO NOTHING`,
              [employeeId, moduleId]
            );
            totalProgress++;
          }
        }
      }
    }
    console.log(`${totalEnrollments} matrículas e ${totalProgress} registros de progresso criados.`);

    await client.query('COMMIT');
    console.log('\n═══ SEED CONCLUÍDO ═══');
    console.log(`Empresas:     ${COMPANIES}`);
    console.log(`Usuários:     ${totalUsers}`);
    console.log(`Trilhas:      ${totalTracks}`);
    console.log(`Módulos:      ${totalModules}`);
    console.log(`Questões:     ${totalQuestions}`);
    console.log(`Matrículas:   ${totalEnrollments}`);
    console.log(`Progresso:    ${totalProgress} registros`);
    console.log('\nCredenciais de teste:');
    console.log('  Admin empresa A:   admin0@test.com / senha123');
    console.log('  Gestor empresa A:  manager1@test.com / senha123');
    console.log('  Colaborador:       employee3@test.com / senha123');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro no seed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
