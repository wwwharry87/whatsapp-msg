const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const { Client, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode'); // Usado para converter o QR Code em imagem base64

const app = express();
app.use(bodyParser.json());
app.use(fileUpload());
app.use(express.static(path.join(__dirname, 'public')));

let qrCode = null; // Variável para armazenar o QR code em base64
let isWhatsAppAuthenticated = false; // Variável para controlar a autenticação do WhatsApp

// Inicializa o cliente do WhatsApp Web com Puppeteer
const client = new Client({
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.initialize();

// Evento de QR Code para autenticar o WhatsApp
client.on('qr', async (qr) => {
    console.log('QR Code recebido, escaneie com o WhatsApp:', qr);
    // Converte o QR Code para um formato de imagem base64
    qrCode = await qrcode.toDataURL(qr);
    isWhatsAppAuthenticated = false; // Marca como não autenticado
});

// Evento quando o cliente está pronto
client.on('ready', () => {
    console.log('Cliente WhatsApp está pronto');
    isWhatsAppAuthenticated = true; // Marca como autenticado
    qrCode = null; // Limpa o QR Code após autenticação
});

// Função para verificar se o WhatsApp está autenticado e obter o QR code
app.get('/api/check-whatsapp', (req, res) => {
    if (isWhatsAppAuthenticated) {
        res.json({ authenticated: true });
    } else {
        res.json({ authenticated: false, qrCode }); // Envia o QR Code para o frontend
    }
});

// Inicia o servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
