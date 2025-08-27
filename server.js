const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Configuração do MongoDB - SEM SSL
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:nFoweZcLyRhkIAXpZnXyYKGloHKrYCFF@shortline.proxy.rlwy.net:12301';

const client = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  useNewUrlParser: true,
  useUnifiedTopology: true,
  ssl: false // ⬅️ SSL DESLIGADO
});

const MAX_HISTORY_LENGTH = 200;

let db, messagesCollection;

// Conectar ao MongoDB
async function connectToMongoDB() {
  try {
    await client.connect();
    db = client.db('souls-chat');
    messagesCollection = db.collection('messages');
    
    // Criar índice para ordenação
    await messagesCollection.createIndex({ timestamp: -1 });
    
    console.log('✅ Conectado ao MongoDB Atlas');
  } catch (error) {
    console.error('❌ Erro ao conectar ao MongoDB:', error);
    process.exit(1);
  }
}

// Rota simples de saúde
app.get('/', async (req, res) => {
  try {
    const messageCount = await messagesCollection.countDocuments();
    const lastMessage = await messagesCollection
      .find()
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();
    
    res.json({ 
      message: '✅ Servidor do Chat Souls está online!',
      messageCount,
      lastMessage: lastMessage[0] || 'Nenhuma mensagem',
      database: 'MongoDB Atlas'
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao acessar o banco' });
  }
});

// Lógica principal de conexão e chat
io.on('connection', (socket) => {
  console.log('🔗 Um precursor se conectou: ' + socket.id);

  // 1. ENVIA O HISTÓRICO COMPLETO para o novo cliente
  socket.on('request-history', async () => {
    try {
      const historico = await messagesCollection
        .find()
        .sort({ timestamp: -1 })
        .limit(MAX_HISTORY_LENGTH)
        .toArray();
      
      socket.emit('historico-completo', historico.map(msg => msg.texto));
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
      socket.emit('historico-completo', []);
    }
  });

  // 2. Ouvinte para mensagens recebidas
  socket.on('enviar-mensagem', async (dados) => {
    if (!dados.texto || dados.texto.trim() === '') {
      console.log(`⚠️  Mensagem vazia recebida de ${socket.id}`);
      return;
    }

    const mensagem = {
      texto: dados.texto.trim(),
      timestamp: new Date(),
      socketId: socket.id
    };

    console.log(`📨 Mensagem de ${socket.id}: ${mensagem.texto}`);
    
    try {
      // Adiciona a nova mensagem ao banco de dados
      await messagesCollection.insertOne(mensagem);
      
      // Limita o tamanho do histórico (opcional)
      const count = await messagesCollection.countDocuments();
      if (count > MAX_HISTORY_LENGTH * 2) {
        const oldestMessages = await messagesCollection
          .find()
          .sort({ timestamp: 1 })
          .limit(count - MAX_HISTORY_LENGTH)
          .toArray();
        
        const idsToRemove = oldestMessages.map(msg => msg._id);
        await messagesCollection.deleteMany({ _id: { $in: idsToRemove } });
      }

      // Repassa a mensagem para TODOS os clientes conectados
      io.emit('receber-mensagem', { 
        texto: mensagem.texto
      });
    } catch (error) {
      console.error('Erro ao salvar mensagem:', error);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`❌ Um precursor partiu: ${reason}`);
  });
});

// Inicializar servidor
const PORT = process.env.PORT || 3000;

async function startServer() {
  await connectToMongoDB();
  
  server.listen(PORT, () => {
    console.log(`✅ Servidor ouvindo na porta ${PORT}`);
  });
}

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Desligando servidor...');
  await client.close();
  process.exit(0);
});





