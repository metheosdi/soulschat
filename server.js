const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Armazenamento em memória
let chatHistory = [];

app.get('/', (req, res) => {
  res.json({ 
    message: '✅ Servidor do Chat Souls está online!',
    messageCount: chatHistory.length
  });
});

// Lógica principal
io.on('connection', (socket) => {
  console.log('🔗 Um precursor se conectou: ' + socket.id);

  // 1. ENVIA O HISTÓRICO COMPLETO apenas para o novo cliente
  socket.emit('historico-completo', chatHistory);

  // 2. Ouvinte para mensagens recebidas
  socket.on('enviar-mensagem', (dados) => {
      console.log('📨 Mensagem recebida:', dados.texto);
      
      // Adiciona a nova mensagem ao histórico
      chatHistory.push(dados.texto);
      
      // Limita o histórico se necessário
      if (chatHistory.length > 100) {
        chatHistory = chatHistory.slice(-50);
      }

      // Repassa apenas a NOVA mensagem para TODOS
      io.emit('receber-mensagem', { texto: dados.texto });
  });

  socket.on('disconnect', (reason) => {
      console.log(`❌ Um precursor partiu: ${reason}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Servidor ouvindo na porta ${PORT}`);
});
