const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const { Client, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());
app.use(fileUpload());
app.use(express.static(path.join(__dirname, 'public')));

let qrCode = null; // Variável para armazenar o QR code
let isWhatsAppAuthenticated = false; // Variável para controlar a autenticação

// Inicializa o cliente do WhatsApp Web com Puppeteer
const client = new Client({
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1920x1080'
        ],
        timeout: 60000,
    }
});

client.initialize();

// Evento de QR Code para autenticar o WhatsApp
client.on('qr', (qr) => {
    console.log('QR Code gerado, escaneie com o WhatsApp:', qr);
    qrCode = qr; // Armazena o QR code
});

// Evento quando o cliente está pronto
client.on('ready', () => {
    console.log('Cliente WhatsApp está pronto');
    isWhatsAppAuthenticated = true; // Marca como autenticado
    qrCode = null; // Limpa o QR code
});

// Função para verificar se o WhatsApp está autenticado e obter o QR code
app.get('/api/check-whatsapp', (req, res) => {
    if (isWhatsAppAuthenticated) {
        res.json({ authenticated: true });
    } else {
        res.json({ authenticated: false, qrCode }); // Envia o QR code como string
    }
});

// Rota para enviar mensagem com PDF via WhatsApp
app.post('/api/send-whatsapp', async (req, res) => {
    const { phone, message } = req.body;

    // Verifica se o WhatsApp está autenticado
    if (!isWhatsAppAuthenticated) {
        return res.status(500).json({ error: 'O WhatsApp não está autenticado. Escaneie o QR Code.' });
    }

    // Verifica se os dados necessários estão presentes
    if (!phone || !message || !req.files || !req.files.pdf) {
        return res.status(400).json({ error: 'Dados insuficientes. Forneça o telefone, mensagem e o PDF.' });
    }

    const pdfFile = req.files.pdf;

    try {
        // Formata o número do telefone
        const chatId = `${formatPhoneNumber(phone)}@c.us`;

        // Verifica se o cliente do WhatsApp está pronto
        if (!client.info) {
            return res.status(500).json({ error: 'Cliente WhatsApp ainda não está pronto.' });
        }

        // Envia a mensagem de texto
        await client.sendMessage(chatId, message);

        // Converte o arquivo PDF para o formato correto e envia
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
