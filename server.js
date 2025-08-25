// logs-api-server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Permite que a API entenda JSON
app.use(express.static('public')); // Serve os arquivos da pasta 'public' (chatbot.html, dashboard.html)

// Estrutura de dados em memória
let logs = [];
let sessions = {};

// Função para carregar dados dos arquivos JSON
async function loadData() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        const logsData = await fs.readFile(LOGS_FILE, 'utf-8');
        logs = JSON.parse(logsData);
    } catch (error) {
        console.log('📝 Arquivo de logs não encontrado, iniciando com um array vazio.');
        logs = [];
    }

    try {
        const sessionsData = await fs.readFile(SESSIONS_FILE, 'utf-8');
        sessions = JSON.parse(sessionsData);
    } catch (error) {
        console.log('👥 Arquivo de sessões não encontrado, iniciando com um objeto vazio.');
        sessions = {};
    }
}

// Função para salvar dados nos arquivos JSON
async function saveData() {
    try {
        // Ordena os logs por data antes de salvar, garantindo que os mais recentes fiquem no topo
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        await fs.writeFile(LOGS_FILE, JSON.stringify(logs, null, 2));
        await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
    } catch (error) {
        console.error('❌ Erro ao salvar dados:', error);
    }
}

// ==================
// ROTAS DA API
// ==================

// Rota para checar a "saúde" da API
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        logCount: logs.length,
        sessionCount: Object.keys(sessions).length
    });
});

// Rota para criar uma nova sessão
app.post('/api/sessions', async (req, res) => {
    const { sessionId, userAgent } = req.body;
    if (!sessionId) {
        return res.status(400).json({ success: false, error: 'sessionId é obrigatório' });
    }
    
    sessions[sessionId] = {
        id: sessionId,
        startTime: new Date().toISOString(),
        userAgent: userAgent,
        status: 'active',
        messageCount: 0,
        appointmentCount: 0
    };
    
    // Log da criação da sessão
    logs.unshift({
        id: Date.now(),
        sessionId: sessionId,
        type: 'event',
        message: 'Nova sessão iniciada',
        timestamp: new Date().toISOString(),
        details: { userAgent }
    });

    await saveData();
    res.status(201).json({ success: true, session: sessions[sessionId] });
});

// Rota para registrar uma mensagem
app.post('/api/logs/message', async (req, res) => {
    const { sessionId, sender, message, currentFlow } = req.body;
    if (!sessionId || !sender || !message) {
        return res.status(400).json({ success: false, error: 'Campos obrigatórios faltando' });
    }

    const logEntry = {
        id: Date.now(),
        sessionId: sessionId,
        type: 'message',
        message: `${sender === 'user' ? 'Usuário' : 'Bot'}: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`,
        timestamp: new Date().toISOString(),
        details: { sender, fullMessage: message, currentFlow }
    };
    logs.unshift(logEntry);

    if (sessions[sessionId]) {
        sessions[sessionId].messageCount++;
    }

    await saveData();
    res.status(201).json({ success: true, logId: logEntry.id });
});

// Rota para registrar um agendamento
app.post('/api/logs/appointment', async (req, res) => {
    const { sessionId, appointmentData } = req.body;
    if (!sessionId || !appointmentData) {
        return res.status(400).json({ success: false, error: 'Campos obrigatórios faltando' });
    }

    const logEntry = {
        id: Date.now(),
        sessionId: sessionId,
        type: 'appointment',
        message: `Agendamento criado para ${appointmentData.patientName}`,
        timestamp: new Date().toISOString(),
        details: appointmentData
    };
    logs.unshift(logEntry);

    if (sessions[sessionId]) {
        sessions[sessionId].appointmentCount++;
    }

    await saveData();
    res.status(201).json({ success: true, logId: logEntry.id });
});

// Rota para buscar todos os logs
app.get('/api/logs', (req, res) => {
    res.json({ success: true, data: logs });
});

// Rota para buscar todas as sessões
app.get('/api/sessions', (req, res) => {
    // Retorna as sessões como um array, ordenadas pela mais recente
    const sessionArray = Object.values(sessions).sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    res.json({ success: true, data: sessionArray });
});

// Rota para buscar estatísticas
app.get('/api/stats', (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayLogs = logs.filter(log => new Date(log.timestamp) >= today);
    const todaySessions = Object.values(sessions).filter(session => new Date(session.startTime) >= today);

    const stats = {
        totalSessionsToday: todaySessions.length,
        totalAppointmentsToday: todayLogs.filter(l => l.type === 'appointment').length,
        totalMessagesToday: todayLogs.filter(l => l.type === 'message').length,
        totalErrorsToday: todayLogs.filter(l => l.type === 'error').length
    };
    res.json({ success: true, data: stats });
});


// Inicia o servidor
app.listen(PORT, async () => {
    await loadData();
    console.log(`🚀 Servidor de logs rodando em http://localhost:${PORT}`);
    console.log(`💬 Acesse o Chatbot em: http://localhost:${PORT}/chatbot.html`);
    console.log(`📊 Acesse o Dashboard em: http://localhost:${PORT}/dashboard.html`);
});

// Salva os dados antes de fechar o servidor
process.on('SIGINT', async () => {
    console.log('\n💾 Salvando dados antes de desligar...');
    await saveData();
    console.log('✅ Dados salvos. Desligando.');
    process.exit(0);

});
