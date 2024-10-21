const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const { Client, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(fileUpload());
app.use(express.static(path.join(__dirname, 'public')));

let qrCode = null; // Armazena o QR code gerado como string
let isWhatsAppAuthenticated = false; // Verifica se o WhatsApp está autenticado

// Inicializa o cliente do WhatsApp Web
const client = new Client({
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});

client.on('qr', (qr) => {
    // A cada atualização, armazena o QR code como string
    qrCode = qr;
    console.log('QR Code gerado: ', qr);
});

client.on('ready', () => {
    console.log('WhatsApp está autenticado e pronto!');
    isWhatsAppAuthenticated = true;
    qrCode = null; // Limpa o QR code
});

client.on('authenticated', () => {
    isWhatsAppAuthenticated = true;
    qrCode = null; // Limpa o QR code
});

client.on('auth_failure', (msg) => {
    console.error('Falha na autenticação: ', msg);
    isWhatsAppAuthenticated = false;
});

client.initialize();

// Endpoint para verificar se o WhatsApp está autenticado e retornar o QR code
app.get('/api/check-whatsapp', (req, res) => {
    if (isWhatsAppAuthenticated) {
        res.json({ authenticated: true });
    } else {
        res.json({ authenticated: false, qrCode }); // Envia o QR code como string
    }
});

// Inicia o servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
