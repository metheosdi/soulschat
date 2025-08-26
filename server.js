const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Arquivo para salvar o histórico
const HISTORY_FILE = path.join(__dirname, 'chatHistory.json');
const MAX_HISTORY_LENGTH = 200;

// Função para carregar o histórico do arquivo
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      const historico = JSON.parse(data);
      
      // Se o histórico contiver objetos, extrai apenas o texto
      if (historico.length > 0 && typeof historico[0] === 'object') {
        return historico.map(item => item.text || item);
      }
      
      return historico;
    }
  } catch (error) {
    console.error('Erro ao carregar histórico:', error);
  }
  return [];
}

// Função para salvar o histórico no arquivo
function saveHistory(history) {
  try {
    // Garante que estamos salvando apenas strings (texto das mensagens)
    const historicoParaSalvar = history.map(msg => typeof msg === 'object' ? msg.text : msg);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(historicoParaSalvar, null, 2));
    console.log('Histórico salvo no arquivo');
  } catch (error) {
    console.error('Erro ao salvar histórico:', error);
  }
}

// Carrega o histórico inicial do arquivo
let chatHistory = loadHistory();
console.log(`Histórico carregado: ${chatHistory.length} mensagens`);

// Rota simples de saúde
app.get('/', (req, res) => {
  res.json({ 
    message: '✅ Servidor do Chat Souls está online!',
    messageCount: chatHistory.length,
    lastMessage: chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : 'Nenhuma mensagem'
  });
});

// Lógica principal de conexão e chat
io.on('connection', (socket) => {
  console.log('🔗 Um precursor se conectou: ' + socket.id);

  // 1. ENVIA O HISTÓRICO COMPLETO para o novo cliente
  socket.emit('historico-completo', chatHistory);

  // 2. Ouvinte para mensagens recebidas
  socket.on('enviar-mensagem', (dados) => {
    if (!dados.texto || dados.texto.trim() === '') {
      console.log(`⚠️  Mensagem vazia recebida de ${socket.id}`);
      return;
    }

    const mensagem = dados.texto.trim();
    console.log(`📨 Mensagem de ${socket.id}: ${mensagem}`);
    
    // Adiciona a nova mensagem ao histórico (apenas o texto)
    chatHistory.push(mensagem);
    
    // Limita o tamanho do histórico
    if (chatHistory.length > MAX_HISTORY_LENGTH) {
      chatHistory = chatHistory.slice(-MAX_HISTORY_LENGTH);
    }

    // Salva o histórico no arquivo
    saveHistory(chatHistory);

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

// Graceful shutdown - salva o histórico antes de desligar
process.on('SIGINT', () => {
  console.log('\n🛑 Desligando servidor... Salvando histórico');
  saveHistory(chatHistory);
  process.exit(0);
});
