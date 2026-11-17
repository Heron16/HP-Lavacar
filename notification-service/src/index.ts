import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import Redis from 'ioredis';

const app = express();
const PORT = process.env.PORT || 3002;
const FILA_NOTIFICACOES = 'fila:notificacoes';

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map((o) => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error('Origem não permitida pelo CORS'));
  },
  credentials: true,
}));
app.use(express.json());

// Conexão com banco próprio do microserviço
let db: mysql.Pool;

async function conectarBanco() {
  db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'notif_user',
    password: process.env.DB_PASS || 'notif_pass123',
    database: process.env.DB_NAME || 'aquawash_notif',
    waitForConnections: true,
    connectionLimit: 10,
  });

  // Cria tabela se não existir
  await db.execute(`
    CREATE TABLE IF NOT EXISTS notificacao (
      id          VARCHAR(36)  NOT NULL DEFAULT (UUID()),
      usuarioId   VARCHAR(36)  NOT NULL,
      tipo        ENUM('agendamento_criado','agendamento_cancelado') NOT NULL,
      mensagem    VARCHAR(500) NOT NULL,
      lida        TINYINT(1)   NOT NULL DEFAULT 0,
      criadoEm   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_usuario (usuarioId),
      INDEX idx_lida (lida)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  console.log('Banco de notificações conectado');
}

// Conexão Redis para consumir a fila
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryStrategy: (times) => Math.min(times * 300, 5000),
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  lazyConnect: false,
});

redis.on('connect', () => console.log('[Redis] Consumer conectado'));
redis.on('error', (err) => console.error('[Redis] Erro:', err.message));

// Worker da fila — consome notificações com BRPOP (bloqueante, eficiente)
async function iniciarConsumidorFila() {
  console.log('[Fila] Consumidor iniciado — aguardando notificações...');

  while (true) {
    try {
      const resultado = await redis.brpop(FILA_NOTIFICACOES, 0);
      if (!resultado) continue;

      const [, raw] = resultado;
      const { usuarioId, tipo, mensagem } = JSON.parse(raw);

      console.log(`[Fila] BRPOP ← notificação para usuário ${usuarioId} (${tipo})`);

      await db.execute(
        'INSERT INTO notificacao (usuarioId, tipo, mensagem) VALUES (?, ?, ?)',
        [usuarioId, tipo, mensagem],
      );
      console.log(`[Fila] ✅ Notificação persistida para usuário ${usuarioId}`);
    } catch (err) {
      console.error('[Fila] Erro ao processar:', (err as Error).message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// POST /notificacoes — backend principal chama para criar notificação
app.post('/notificacoes', async (req, res) => {
  try {
    const { usuarioId, tipo, mensagem } = req.body;
    if (!usuarioId || !tipo || !mensagem) {
      res.status(400).json({ mensagem: 'usuarioId, tipo e mensagem são obrigatórios' });
      return;
    }
    await db.execute(
      'INSERT INTO notificacao (usuarioId, tipo, mensagem) VALUES (?, ?, ?)',
      [usuarioId, tipo, mensagem],
    );
    res.status(201).json({ mensagem: 'Notificação criada' });
  } catch (err) {
    console.error('Erro ao criar notificação:', err);
    res.status(500).json({ mensagem: 'Erro interno' });
  }
});

// GET /notificacoes/:usuarioId
app.get('/notificacoes/:usuarioId', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM notificacao WHERE usuarioId = ? ORDER BY criadoEm DESC LIMIT 20',
      [req.params.usuarioId],
    );
    const notifs = rows as any[];
    const naoLidas = notifs.filter((n) => !n.lida).length;
    res.status(200).json({ notificacoes: notifs, naoLidas });
  } catch (err) {
    res.status(500).json({ mensagem: 'Erro ao buscar notificações' });
  }
});

// PATCH /notificacoes/:id/lida — marca notificação como lida
app.patch('/notificacoes/:id/lida', async (req, res) => {
  try {
    await db.execute('UPDATE notificacao SET lida = 1 WHERE id = ?', [req.params.id]);
    res.status(200).json({ mensagem: 'Notificação marcada como lida' });
  } catch (err) {
    res.status(500).json({ mensagem: 'Erro ao atualizar notificação' });
  }
});

// PATCH /notificacoes/:usuarioId/todas-lidas — marca todas como lidas
app.patch('/notificacoes/:usuarioId/todas-lidas', async (req, res) => {
  try {
    await db.execute('UPDATE notificacao SET lida = 1 WHERE usuarioId = ?', [req.params.usuarioId]);
    res.status(200).json({ mensagem: 'Todas as notificações marcadas como lidas' });
  } catch (err) {
    res.status(500).json({ mensagem: 'Erro ao atualizar notificações' });
  }
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

conectarBanco()
  .then(() => {
    app.listen(PORT, () => console.log(`Notification service rodando na porta ${PORT}`));
    iniciarConsumidorFila();
  })
  .catch((err) => {
    console.error('Falha ao conectar banco de notificações:', err);
    process.exit(1);
  });
