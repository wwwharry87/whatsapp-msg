const express = require('express');
const { Client } = require('whatsapp-web.js');
const fs = require('fs');
const qrcode = require('qrcode'); // Gerar QR code para o frontend
const path = require('path'); // Adiciona o path para servir arquivos estáticos
const app = express();

let qrCodeString = null; // Armazena o QR code como string
let isWhatsAppAuthenticated = false;

// Inicializa o cliente do WhatsApp Web com Puppeteer
const client = new Client({
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    }
});

client.initialize();

// Evento de QR Code para autenticar o WhatsApp
client.on('qr', (qr) => {
    qrCodeString = qr; // Armazena o QR code como string
    console.log('QR Code recebido:', qr); // Exibe no log
});

// Evento quando o cliente está pronto
client.on('ready', () => {
    console.log('Cliente WhatsApp está pronto!');
    isWhatsAppAuthenticated = true;
    qrCodeString = null; // Limpa o QR code após a autenticação
});

// Rota para verificar se o WhatsApp está autenticado e retornar o QR code
app.get('/api/check-whatsapp', (req, res) => {
    if (isWhatsAppAuthenticated) {
        res.json({ authenticated: true });
    } else if (qrCodeString) {
        res.json({ authenticated: false, qrCode: qrCodeString }); // Retorna a string do QR code
    } else {
        res.json({ authenticated: false, qrCode: null });
    }
});

// Serve arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, 'public')));

// Rota que captura todas as outras e retorna o index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicia o servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
