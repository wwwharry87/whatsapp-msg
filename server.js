const express = require('express');
const { Client } = require('whatsapp-web.js');
const fs = require('fs');
const qrcode = require('qrcode'); // Para gerar QR code
const app = express();

let qrCodeString = null;
let isWhatsAppAuthenticated = false;

// Inicializa o cliente do WhatsApp Web
const client = new Client({
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    }
});

client.initialize();

// Evento de QR Code para autenticação
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

// Rota para verificar e gerar a imagem do QR Code
app.get('/api/check-whatsapp', async (req, res) => {
    if (isWhatsAppAuthenticated) {
        res.json({ authenticated: true });
    } else if (qrCodeString) {
        // Gera a imagem do QR Code
        const qrImage = await qrcode.toDataURL(qrCodeString); // Gera o QR code como uma URL de imagem base64
        res.json({ authenticated: false, qrImage: qrImage }); // Envia a imagem como resposta
    } else {
        res.json({ authenticated: false, qrImage: null });
    }
});

// Inicia o servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
