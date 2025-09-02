const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Configuração do PostgreSQL Neon.tech
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Credenciais de admin
const ADMIN_USER = process.env.ADMIN_USER || 'precursor';
const ADMIN_PASS = process.env.ADMIN_PASS || 'senha123';

// LIMITES CONFIGURÁVEIS
const MAX_MESSAGES_PER_USER = 10;
const MAX_TOTAL_MESSAGES = 50;
const MESSAGE_COOLDOWN = 30000;

const userCooldowns = new Map();

// Inicializar banco de dados
async function initDatabase() {
  try {
    // Criar tabelas se não existirem
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE,
        message_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        texto TEXT NOT NULL,
        usuario VARCHAR(50) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS votos (
        id SERIAL PRIMARY KEY,
        mensagem_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
        usuario VARCHAR(50) NOT NULL,
        tipo_voto VARCHAR(10) CHECK (tipo_voto IN ('elogio', 'critica')),
        UNIQUE(mensagem_id, usuario)
      );
      
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_messages_usuario ON messages(usuario);
      CREATE INDEX IF NOT EXISTS idx_votos_mensagem ON votos(mensagem_id);
    `);

    // Criar usuário admin se não existir
    const adminExists = await pool.query(
      'SELECT id FROM users WHERE username = $1', 
      [ADMIN_USER]
    );
    
    if (adminExists.rows.length === 0) {
      const hashedPassword = await bcrypt.hash(ADMIN_PASS, 10);
      await pool.query(
        'INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3)',
        [ADMIN_USER, hashedPassword, true]
      );
      console.log('👑 Usuário admin criado');
    }

    console.log('✅ Banco de dados inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error);
    process.exit(1);
  }
}

// Autenticar usuário
async function authenticateUser(username, password) {
  try {
    const userResult = await pool.query(
      'SELECT * FROM users WHERE username = $1', 
      [username]
    );
    
    if (userResult.rows.length === 0) {
      // Auto-criação de usuário
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(
        'INSERT INTO users (username, password) VALUES ($1, $2)',
        [username, hashedPassword]
      );
      return true;
    }
    
    const user = userResult.rows[0];
    return await bcrypt.compare(password, user.password);
  } catch (error) {
    console.error('Erro na autenticação:', error);
    return false;
  }
}

// Middleware de autenticação
function requireAuth(socket, next) {
  const { username, password } = socket.handshake.auth;
  
  if (!username || !password) {
    return next(new Error('Credenciais necessárias'));
  }
  
  authenticateUser(username, password)
    .then(isValid => {
      if (isValid) {
        socket.user = username;
        next();
      } else {
        next(new Error('Credenciais inválidas'));
      }
    })
    .catch(next);
}

// Verificar cooldown
function checkCooldown(username) {
  const lastMessageTime = userCooldowns.get(username);
  if (lastMessageTime && Date.now() - lastMessageTime < MESSAGE_COOLDOWN) {
    return MESSAGE_COOLDOWN - (Date.now() - lastMessageTime);
  }
  return 0;
}

// Rotas HTTP
app.get('/', async (req, res) => {
  try {
    const messagesResult = await pool.query('SELECT COUNT(*) FROM messages');
    const usersResult = await pool.query('SELECT COUNT(*) FROM users');
    
    res.json({ 
      message: '✅ Servidor do Chat Souls está online!',
      messageCount: messagesResult.rows[0].count,
      userCount: usersResult.rows[0].count,
      database: 'PostgreSQL Neon.tech'
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao acessar o banco' });
  }
});

// Socket.IO
io.use(requireAuth).on('connection', (socket) => {
  console.log(`🔗 Precursor ${socket.user} se conectou`);

  // Enviar histórico
  socket.on('request-history', async () => {
    try {
      const result = await pool.query(
        'SELECT texto, usuario FROM messages ORDER BY timestamp ASC LIMIT $1',
        [MAX_TOTAL_MESSAGES]
      );
      
      socket.emit('historico-completo', result.rows);
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
      socket.emit('historico-completo', []);
    }
  });

  // Ouvinte para votos
  socket.on('votar-mensagem', async (dados) => {
    try {
      // Verificar se usuário já votou nesta mensagem
      const votoExistente = await pool.query(
        'SELECT id FROM votos WHERE mensagem_id = $1 AND usuario = $2',
        [dados.mensagemId, socket.user]
      );

      if (votoExistente.rows.length > 0) {
        // Atualizar voto existente
        await pool.query(
          'UPDATE votos SET tipo_voto = $1 WHERE id = $2',
          [dados.tipoVoto, votoExistente.rows[0].id]
        );
      } else {
        // Inserir novo voto
        await pool.query(
          'INSERT INTO votos (mensagem_id, usuario, tipo_voto) VALUES ($1, $2, $3)',
          [dados.mensagemId, socket.user, dados.tipoVoto]
        );
      }

      // Buscar contagem atualizada
      const contagem = await pool.query(`
        SELECT 
          SUM(CASE WHEN tipo_voto = 'elogio' THEN 1 ELSE 0 END) as elogios,
          SUM(CASE WHEN tipo_voto = 'critica' THEN 1 ELSE 0 END) as criticas
        FROM votos 
        WHERE mensagem_id = $1
      `, [dados.mensagemId]);

      // Enviar contagem atualizada para todos
      io.emit('atualizar-votos', {
        mensagemId: dados.mensagemId,
        elogios: parseInt(contagem.rows[0].elogios) || 0,
        criticas: parseInt(contagem.rows[0].criticas) || 0
      });

    } catch (error) {
      console.error('Erro ao processar voto:', error);
    }
  });

  // Receber mensagem
  socket.on('enviar-mensagem', async (dados) => {
    const cooldownRemaining = checkCooldown(socket.user);
    if (cooldownRemaining > 0) {
      socket.emit('erro-mensagem', {
        tipo: 'cooldown',
        mensagem: `Aguarde ${Math.ceil(cooldownRemaining / 1000)} segundos`
      });
      return;
    }

    if (!dados.texto || dados.texto.trim() === '') {
      socket.emit('erro-mensagem', {
        tipo: 'vazia',
        mensagem: 'Mensagem vazia'
      });
      return;
    }

    try {
      // VERIFICAR E APAGAR MENSAGEM MAIS ANTIGA DO USUÁRIO
      const userCountResult = await pool.query(
        'SELECT COUNT(*) FROM messages WHERE usuario = $1',
        [socket.user]
      );

      if (parseInt(userCountResult.rows[0].count) >= MAX_MESSAGES_PER_USER) {
        // Apaga a mensagem mais antiga do usuário
        await pool.query(`
          DELETE FROM messages 
          WHERE id = (
            SELECT id FROM messages 
            WHERE usuario = $1 
            ORDER BY timestamp ASC 
            LIMIT 1
          )
        `, [socket.user]);
        
        console.log(`🗑️ Mensagem mais antiga de ${socket.user} foi apagada`);
      }

      // INSERIR NOVA MENSAGEM E RETORNAR ID
      const result = await pool.query(
        'INSERT INTO messages (texto, usuario) VALUES ($1, $2) RETURNING id',
        [dados.texto.trim(), socket.user]
      );

      const mensagemId = result.rows[0].id;
      
      userCooldowns.set(socket.user, Date.now());

      // LIMITAR TOTAL DE MENSAGENS (apaga as mais antigas do sistema)
      const totalCountResult = await pool.query('SELECT COUNT(*) FROM messages');
      const totalCount = parseInt(totalCountResult.rows[0].count);
      
      if (totalCount > MAX_TOTAL_MESSAGES) {
        await pool.query(`
          DELETE FROM messages 
          WHERE id IN (
            SELECT id FROM messages 
            ORDER BY timestamp ASC 
            LIMIT $1
          )
        `, [totalCount - MAX_TOTAL_MESSAGES]);
        
        console.log(`🗑️ ${totalCount - MAX_TOTAL_MESSAGES} mensagens antigas apagadas`);
      }

      // BROADCAST DA NOVA MENSAGEM COM ID
      io.emit('receber-mensagem', { 
        texto: dados.texto.trim(),
        usuario: socket.user,
        mensagemId: mensagemId
      });
      
    } catch (error) {
      console.error('Erro ao salvar mensagem:', error);
      socket.emit('erro-mensagem', {
        tipo: 'erro',
        mensagem: 'Erro interno do servidor'
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Precursor ${socket.user} partiu`);
    userCooldowns.delete(socket.user);
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;

async function startServer() {
  await initDatabase();
  
  server.listen(PORT, () => {
    console.log(`✅ Servidor ouvindo na porta ${PORT}`);
    console.log(`👑 Admin: ${ADMIN_USER}`);
    console.log(`📝 Limites: ${MAX_MESSAGES_PER_USER} msg/usuário, ${MAX_TOTAL_MESSAGES} total`);
  });
}

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Desligando servidor...');
  await pool.end();
  process.exit(0);
});
