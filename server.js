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

let qrCode = null; // Variável para armazenar o QR Code
let isWhatsAppAuthenticated = false; // Variável para controlar a autenticação do WhatsApp

// Inicializa o cliente do WhatsApp Web
const client = new Client({
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.initialize();

// Evento de QR Code para autenticar o WhatsApp
client.on('qr', (qr) => {
    console.log('QR Code recebido, escaneie com o WhatsApp:', qr);
    qrCode = qr; // Armazena o QR Code
    isWhatsAppAuthenticated = false; // Marca como não autenticado
});

// Evento quando o cliente está pronto
client.on('ready', () => {
    console.log('Cliente WhatsApp está pronto');
    isWhatsAppAuthenticated = true; // Marca como autenticado
    qrCode = null; // Limpa o QR Code após autenticação
});

// Função para verificar se o WhatsApp está autenticado e obter o QR Code
app.get('/api/check-whatsapp', (req, res) => {
    if (isWhatsAppAuthenticated) {
        res.json({ authenticated: true });
    } else {
        res.json({ authenticated: false, qrCode }); // Envia o QR Code para o frontend
    }
});

// Rota para enviar a mensagem pelo WhatsApp
app.post('/api/send-whatsapp', async (req, res) => {
    const { phone, message } = req.body;

    if (!isWhatsAppAuthenticated) {
        return res.status(500).json({ error: 'O WhatsApp não está autenticado. Escaneie o QR Code.' });
    }

    if (!phone || !message || !req.files || !req.files.pdf) {
        return res.status(400).json({ error: 'Dados insuficientes. Forneça o telefone, mensagem e o PDF.' });
    }

    const pdfFile = req.files.pdf;

    try {
        const chatId = `${phone}@c.us`;
        await client.sendMessage(chatId, message);

        const media = new MessageMedia(pdfFile.mimetype, pdfFile.data.toString('base64'), pdfFile.name);
        await client.sendMessage(chatId, media);

        res.status(200).json({ status: 'success', message: 'Mensagem enviada com sucesso' });
    } catch (error) {
        console.error('Erro ao enviar mensagem via WhatsApp:', error);
        res.status(500).json({ error: 'Erro ao enviar mensagem via WhatsApp.', details: error.message });
    }
});

// Inicia o servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
