const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Low, JSONFile } = require('lowdb');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Configuração do LowDB
const adapter = new JSONFile('db.json');
const db = new Low(adapter);

// Inicializar o banco de dados
async function initializeDB() {
  await db.read();
  db.data ||= { messages: [] };
  await db.write();
  console.log(`Banco de dados inicializado: ${db.data.messages.length} mensagens`);
}

initializeDB();

const MAX_HISTORY_LENGTH = 200;

// Rota simples de saúde
app.get('/', (req, res) => {
  res.json({ 
    message: '✅ Servidor do Chat Souls está online!',
    messageCount: db.data.messages.length,
    lastMessage: db.data.messages.length > 0 ? db.data.messages[db.data.messages.length - 1] : 'Nenhuma mensagem'
  });
});

// Lógica principal de conexão e chat
io.on('connection', (socket) => {
  console.log('🔗 Um precursor se conectou: ' + socket.id);

  // 1. ENVIA O HISTÓRICO COMPLETO para o novo cliente
  socket.emit('historico-completo', db.data.messages);

  // 2. Ouvinte para mensagens recebidas
  socket.on('enviar-mensagem', async (dados) => {
    if (!dados.texto || dados.texto.trim() === '') {
      console.log(`⚠️  Mensagem vazia recebida de ${socket.id}`);
      return;
    }

    const mensagem = dados.texto.trim();
    console.log(`📨 Mensagem de ${socket.id}: ${mensagem}`);
    
    // Adiciona a nova mensagem ao banco de dados
    db.data.messages.push(mensagem);
    
    // Limita o tamanho do histórico
    if (db.data.messages.length > MAX_HISTORY_LENGTH) {
      db.data.messages = db.data.messages.slice(-MAX_HISTORY_LENGTH);
    }

    // Salva no banco de dados
    try {
      await db.write();
      console.log('Mensagem salva no banco de dados');
    } catch (error) {
      console.error('Erro ao salvar no banco:', error);
    }

    // Repassa a mensagem para TODOS os clientes conectados
    io.emit('receber-mensagem', { 
      texto: mensagem
    });
  });

  socket.on('disconnect', (reason) => {
    console.log(`❌ Um precursor partiu: ${reason}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Servidor ouvindo na porta ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Desligando servidor...');
  try {
    await db.write();
    console.log('Dados salvos com sucesso');
  } catch (error) {
    console.error('Erro ao salvar dados:', error);
  }
  process.exit(0);
});
