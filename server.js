const express = require('express');
const { Client } = require('whatsapp-web.js');
const fs = require('fs');
const qrcode = require('qrcode'); 

const app = express();
let qrCodeString = null;
let isWhatsAppAuthenticated = false;

const client = new Client({
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    }
});

client.initialize();

// Evento de QR Code para autenticar o WhatsApp
client.on('qr', (qr) => {
    qrCodeString = qr; 
    console.log('QR Code recebido:', qr); 
});

// Evento quando o cliente está pronto
client.on('ready', () => {
    console.log('Cliente WhatsApp está pronto!');
    isWhatsAppAuthenticated = true;
    qrCodeString = null; 
});

// Rota para verificar se o WhatsApp está autenticado e retornar o QR code
app.get('/api/check-whatsapp', (req, res) => {
    if (isWhatsAppAuthenticated) {
        res.json({ authenticated: true });
    } else if (qrCodeString) {
        res.json({ authenticated: false, qrCode: qrCodeString });
    } else {
        res.json({ authenticated: false, qrCode: null });
    }
});

// Aqui usamos a variável de ambiente PORT fornecida pelo Render
const port = process.env.PORT || 1000; // Verifique se a porta está configurada corretamente

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
