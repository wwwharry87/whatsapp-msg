const express = require('express');
const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode'); // Biblioteca para gerar QR codes
const fs = require('fs');
const app = express();

let qrCodeString = null; // Variável para armazenar a string do QR code
let isWhatsAppAuthenticated = false; // Verificar se está autenticado

// Inicializa o cliente do WhatsApp Web com Puppeteer
const client = new Client({
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Desabilitar o sandbox
    }
});
client.initialize();

// Evento de QR Code para autenticar o WhatsApp
client.on('qr', (qr) => {
    qrCodeString = qr; // Armazena a string do QR code
    console.log('QR Code recebido:', qr); // Exibe o QR code no terminal
});

// Evento quando o cliente está pronto
client.on('ready', () => {
    console.log('Cliente WhatsApp está pronto!');
    isWhatsAppAuthenticated = true;
    qrCodeString = null; // Limpa o QR code após autenticação
});

// Endpoint para verificar se o WhatsApp está autenticado e enviar o QR code
app.get('/api/check-whatsapp', (req, res) => {
    if (isWhatsAppAuthenticated) {
        res.json({ authenticated: true });
    } else if (qrCodeString) {
        res.json({ authenticated: false, qrCode: qrCodeString }); // Envia a string do QR code
    } else {
        res.json({ authenticated: false, qrCode: null });
    }
});

// Inicia o servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
