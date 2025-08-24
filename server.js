// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Permite conexão de qualquer frontend (em produção, coloque a URL do Netlify)
    methods: ["GET", "POST"]
  }
});

// Rota simples para testar se o backend está vivo
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/index.html'));
});

// Lógica de conexão e chat
io.on('connection', (socket) => {
  console.log('🔗 Um precursor se conectou: ' + socket.id);

  // Ouvinte para mensagens recebidas de qualquer cliente
  socket.on('enviar-mensagem', (dados) => {
      console.log('📨 Mensagem recebida:', dados.texto);
      // Repassa a mensagem para TODOS os clientes conectados, incluindo quem enviou
      io.emit('receber-mensagem', { texto: dados.texto });
  });

  socket.on('disconnect', () => {
      console.log('❌ Um precursor partiu: ' + socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Servidor ouvindo na porta ${PORT}`);
});