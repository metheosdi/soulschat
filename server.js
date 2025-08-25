const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

// Configura o Socket.io para permitir conexões de qualquer lugar (CORS)
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ARMAZENAMENTO EM MEMÓRIA (simula um banco de dados simples)
// As mensagens ficarão aqui enquanto o servidor estiver ligado
let chatHistory = [];

// Rota simples de saúde para testar se o backend está online
app.get('/', (req, res) => {
  res.json({ 
    message: '✅ Servidor do Chat Souls está online e saudável!',
    messageCount: chatHistory.length
  });
});

// Lógica principal de conexão e chat
io.on('connection', (socket) => {
  console.log('🔗 Um precursor se conectou: ' + socket.id);

  // 1. ENVIA O HISTÓRICO COMPLETO APENAS para o cliente que acabou de conectar
  // (Isso é uma sincronização inicial, só acontece uma vez por conexão)
  socket.emit('historico-completo', chatHistory);

  // 2. Ouvinte para mensagens recebidas de qualquer cliente
  socket.on('enviar-mensagem', (dados) => {
      console.log('📨 Mensagem recebida:', dados.texto);
      
      // Adiciona a nova mensagem ao histórico
      chatHistory.push(dados.texto);
      
      // Opcional: Limitar o tamanho do histórico para não consumir muita memória
      if (chatHistory.length > 100) {
        chatHistory = chatHistory.slice(-50); // Mantém apenas as 50 últimas mensagens
      }

      // Repassa a NOVA MENSAGEM para TODOS os clientes conectados
      // Isso NÃO inclui o histórico completo, apenas a mensagem nova
      io.emit('receber-mensagem', { texto: dados.texto });
  });

  socket.on('disconnect', (reason) => {
      console.log(`❌ Um precursor partiu (${socket.id}): ${reason}`);
  });
});

// Usa a porta fornecida pelo Render ou a 3000 localmente
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Servidor ouvindo na porta ${PORT}`);
  console.log(`💾 Histórico de mensagens inicializado.`);
});

