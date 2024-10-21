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

let qrCode = null; // Armazena o QR code gerado
let isWhatsAppAuthenticated = false; // Verifica se está autenticado

// Inicializa o cliente do WhatsApp Web
const client = new Client({
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});

client.on('qr', (qr) => {
    // A cada atualização, armazena o QR code
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
        res.json({ authenticated: false, qrCode });
    }
});

// Rota para enviar a mensagem com PDF via WhatsApp
app.post('/api/send-whatsapp', async (req, res) => {
    const { phone, message } = req.body;

    if (!isWhatsAppAuthenticated) {
        return res.status(500).json({ error: 'WhatsApp não está autenticado.' });
    }

    if (!phone || !message || !req.files || !req.files.pdf) {
        return res.status(400).json({ error: 'Dados insuficientes: forneça telefone, mensagem e PDF.' });
    }

    const pdfFile = req.files.pdf;

    try {
        const chatId = `${phone}@c.us`;
        await client.sendMessage(chatId, message);

        const media = new MessageMedia(pdfFile.mimetype, pdfFile.data.toString('base64'), pdfFile.name);
        await client.sendMessage(chatId, media);

        res.status(200).json({ status: 'success', message: 'Mensagem enviada com sucesso!' });
    } catch (error) {
        console.error('Erro ao enviar a mensagem via WhatsApp:', error);
        res.status(500).json({ error: 'Erro ao enviar a mensagem via WhatsApp.' });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
