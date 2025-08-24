const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

// Configura o Socket.io para permitir conexões de qualquer lugar (CORS)
const io = socketIo(server, {
  cors: {
    origin: "*", // IMPORTANTE: No futuro, troque "*" pela URL do seu frontend no Netlify para mais segurança
    methods: ["GET", "POST"]
  }
});

// Rota simples de saúde para testar se o backend está online
app.get('/', (req, res) => {
  res.json({ message: '✅ Servidor do Chat Souls está online e saudável!' });
});

// Lógica principal de conexão e chat
io.on('connection', (socket) => {
  console.log('🔗 Um precursor se conectou: ' + socket.id);

  // Ouvinte para mensagens recebidas de qualquer cliente
  socket.on('enviar-mensagem', (dados) => {
      console.log('📨 Mensagem recebida:', dados.texto);
      // Repassa a mensagem para TODOS os clientes conectados, incluindo quem enviou
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
});
