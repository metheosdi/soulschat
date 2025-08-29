const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { MongoClient, ServerApiVersion } = require('mongodb');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Configuração do MongoDB
const MONGODB_URI = process.env.MONGODB_URI;

// Credenciais de admin (configure no Railway)
const ADMIN_USER = process.env.ADMIN_USER || 'precursor';
const ADMIN_PASS = process.env.ADMIN_PASS || 'senha123';

const client = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  useNewUrlParser: true,
  useUnifiedTopology: true,
  ssl: false
});

// LIMITES CONFIGURÁVEIS
const MAX_MESSAGES_PER_USER = 10; // Máximo 10 mensagens por usuário
const MAX_TOTAL_MESSAGES = 50;     // Máximo 50 mensagens no total
const MESSAGE_COOLDOWN = 30000;    // 30 segundos entre mensagens

let db, messagesCollection, usersCollection;
const userCooldowns = new Map();

// Conectar ao MongoDB
async function connectToMongoDB() {
  try {
    await client.connect();
    db = client.db('souls-chat');
    messagesCollection = db.collection('messages');
    usersCollection = db.collection('users');
    
    // Criar índices
    await messagesCollection.createIndex({ timestamp: 1 });
    await usersCollection.createIndex({ username: 1 }, { unique: true });
    
    // Criar usuário admin inicial se não existir
    await createAdminUser();
    
    console.log('✅ Conectado ao MongoDB');
  } catch (error) {
    console.error('❌ Erro ao conectar ao MongoDB:', error);
    process.exit(1);
  }
}

// Criar usuário admin
async function createAdminUser() {
  try {
    const existingAdmin = await usersCollection.findOne({ username: ADMIN_USER });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(ADMIN_PASS, 10);
      await usersCollection.insertOne({
        username: ADMIN_USER,
        password: hashedPassword,
        isAdmin: true,
        createdAt: new Date()
      });
      console.log('👑 Usuário admin criado');
    }
  } catch (error) {
    console.error('Erro ao criar usuário admin:', error);
  }
}

// Middleware para verificar autenticação
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

// Autenticar usuário
async function authenticateUser(username, password) {
  try {
    const user = await usersCollection.findOne({ username });
    if (!user) {
      // Auto-criação de usuário (sem ser admin)
      const hashedPassword = await bcrypt.hash(password, 10);
      await usersCollection.insertOne({
        username,
        password: hashedPassword,
        isAdmin: false,
        createdAt: new Date(),
        messageCount: 0
      });
      return true;
    }
    return await bcrypt.compare(password, user.password);
  } catch (error) {
    console.error('Erro na autenticação:', error);
    return false;
  }
}

// Verificar cooldown
function checkCooldown(username) {
  const lastMessageTime = userCooldowns.get(username);
  if (lastMessageTime && Date.now() - lastMessageTime < MESSAGE_COOLDOWN) {
    return MESSAGE_COOLDOWN - (Date.now() - lastMessageTime);
  }
  return 0;
}

// Rota simples de saúde
app.get('/', async (req, res) => {
  try {
    const messageCount = await messagesCollection.countDocuments();
    const userCount = await usersCollection.countDocuments();
    
    res.json({ 
      message: '✅ Servidor do Chat Souls está online!',
      messageCount,
      userCount,
      limits: {
        maxMessagesPerUser: MAX_MESSAGES_PER_USER,
        maxTotalMessages: MAX_TOTAL_MESSAGES,
        cooldown: MESSAGE_COOLDOWN / 1000 + ' segundos'
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao acessar o banco' });
  }
});

// Lógica principal de conexão e chat
io.use(requireAuth).on('connection', (socket) => {
  console.log(`🔗 Precursor ${socket.user} se conectou`);

  // 1. ENVIA O HISTÓRICO COMPLETO
  socket.on('request-history', async () => {
    try {
      const historico = await messagesCollection
        .find()
        .sort({ timestamp: 1 })
        .limit(MAX_TOTAL_MESSAGES)
        .toArray();
      
      socket.emit('historico-completo', historico.map(msg => ({
        texto: msg.texto,
        usuario: msg.usuario
      })));
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
      socket.emit('historico-completo', []);
    }
  });

  // 2. Ouvinte para mensagens recebidas
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

    // Verificar limite de mensagens do usuário
    const userMessageCount = await messagesCollection.countDocuments({ 
      usuario: socket.user 
    });
    
    if (userMessageCount >= MAX_MESSAGES_PER_USER) {
      socket.emit('erro-mensagem', {
        tipo: 'limite',
        mensagem: `Limite de ${MAX_MESSAGES_PER_USER} mensagens atingido`
      });
      return;
    }

    const mensagem = {
      texto: dados.texto.trim(),
      usuario: socket.user,
      timestamp: new Date()
    };

    try {
      // Adiciona a nova mensagem
      await messagesCollection.insertOne(mensagem);
      userCooldowns.set(socket.user, Date.now());

      // Limitar total de mensagens (mais antigas primeiro)
      const totalCount = await messagesCollection.countDocuments();
      if (totalCount > MAX_TOTAL_MESSAGES) {
        const oldestMessages = await messagesCollection
          .find()
          .sort({ timestamp: 1 })
          .limit(totalCount - MAX_TOTAL_MESSAGES)
          .toArray();
        
        const idsToRemove = oldestMessages.map(msg => msg._id);
        await messagesCollection.deleteMany({ _id: { $in: idsToRemove } });
      }

      // Repassa a mensagem para TODOS
      io.emit('receber-mensagem', { 
        texto: mensagem.texto,
        usuario: mensagem.usuario
      });
    } catch (error) {
      console.error('Erro ao salvar mensagem:', error);
      socket.emit('erro-mensagem', {
        tipo: 'erro',
        mensagem: 'Erro interno do servidor'
      });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`❌ Precursor ${socket.user} partiu: ${reason}`);
    userCooldowns.delete(socket.user);
  });
});

// Inicializar servidor
const PORT = process.env.PORT || 3000;

async function startServer() {
  await connectToMongoDB();
  
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
  await client.close();
  process.exit(0);
});
