const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

// Configuração do Socket.io com CORS
const io = socketIo(server, {
  cors: {
    origin: "*", // Permite todas as origens (em produção, especifique a URL do seu frontend)
    methods: ["GET", "POST"]
  }
});

// Armazenamento em memória com limite de 100 mensagens
let chatHistory = [];
const MAX_HISTORY_LENGTH = 100;

// Middleware para logging de requisições
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Rota de saúde para verificar se o servidor está online
app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    message: '✅ Servidor do Chat Souls está operacional',
    messageCount: chatHistory.length,
    connectedUsers: io.engine.clientsCount,
    uptime: process.uptime().toFixed(2) + ' segundos'
  });
});

// Rota para visualizar o histórico (apenas para debug)
app.get('/history', (req, res) => {
  res.json({
    count: chatHistory.length,
    messages: chatHistory
  });
});

// Rota para limpar o histórico (apenas para debug)
app.delete('/history', (req, res) => {
  chatHistory = [];
  res.json({ message: 'Histórico limpo com sucesso', count: 0 });
});

// Função para adicionar mensagem ao histórico com limite
function addToHistory(message) {
  chatHistory.push(message);
  
  // Mantém apenas as últimas MAX_HISTORY_LENGTH mensagens
  if (chatHistory.length > MAX_HISTORY_LENGTH) {
    chatHistory = chatHistory.slice(-MAX_HISTORY_LENGTH);
    console.log(`Histórico limitado às últimas ${MAX_HISTORY_LENGTH} mensagens`);
  }
}

// Lógica principal de conexão e chat
io.on('connection', (socket) => {
  const clientId = socket.id.substring(0, 8); // Pega os primeiros 8 caracteres do ID
  console.log(`🔗 Novo precursor conectado: ${clientId}`);
  console.log(`👥 Usuários conectados: ${io.engine.clientsCount}`);

  // 1. Envia o histórico completo APENAS para o novo cliente
  socket.emit('historico-completo', chatHistory);
  console.log(`📋 Histórico enviado para ${clientId} (${chatHistory.length} mensagens)`);

  // 2. Ouvinte para mensagens recebidas
  socket.on('enviar-mensagem', (dados) => {
      if (!dados.texto || dados.texto.trim() === '') {
        console.log(`⚠️  Mensagem vazia recebida de ${clientId}`);
        return;
      }

      const mensagem = dados.texto.trim();
      console.log(`📨 Mensagem de ${clientId}: ${mensagem}`);
      
      // Adiciona a nova mensagem ao histórico
      addToHistory(mensagem);

      // Repassa apenas a NOVA mensagem para TODOS os clientes
      io.emit('receber-mensagem', { 
        texto: mensagem,
        timestamp: new Date().toISOString()
      });

      console.log(`📤 Mensagem broadcastada para ${io.engine.clientsCount} usuários`);
  });

  // Ouvinte para desconexão
  socket.on('disconnect', (reason) => {
      console.log(`❌ Precursor ${clientId} desconectado: ${reason}`);
      console.log(`👥 Usuários conectados: ${io.engine.clientsCount - 1}`);
  });

  // Ouvinte para erros
  socket.on('error', (error) => {
      console.error(`💥 Erro no socket ${clientId}:`, error);
  });
});

// Middleware para rotas não encontradas
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Rota não encontrada',
    availableRoutes: ['GET /', 'GET /history', 'DELETE /history']
  });
});

// Manipulador de erros global
app.use((error, req, res, next) => {
  console.error('💥 Erro não tratado:', error);
  res.status(500).json({ 
    error: 'Erro interno do servidor',
    message: error.message 
  });
});

// Inicialização do servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`✅ Servidor Souls Chat iniciado com sucesso!`);
  console.log(`📍 Porta: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`💾 Modo: ${process.env.NODE_ENV || 'development'}`);
  console.log('='.repeat(50));
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Desligando servidor gracefulmente...');
  server.close(() => {
    console.log('✅ Servidor fechado com sucesso');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Recebido SIGTERM, desligando...');
  server.close(() => {
    console.log('✅ Servidor fechado com sucesso');
    process.exit(0);
  });
});
