const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js'); // Atualizado para usar LocalAuth (para autenticação persistente)
const qrcode = require('qrcode'); // Para gerar QR code para o frontend
const app = express();
app.use(express.json());

let qrCodeString = null; // Armazena o QR code como string
let isWhatsAppAuthenticated = false;

// Inicializa o cliente do WhatsApp Web com Puppeteer
const client = new Client({
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    },
    authStrategy: new LocalAuth() // Autenticação persistente
});

client.initialize();

// Evento de QR Code para autenticar o WhatsApp
client.on('qr', (qr) => {
    qrcode.toDataURL(qr, (err, qrImage) => {
        if (err) {
            console.error('Erro ao gerar o QR Code:', err);
            return;
        }
        qrCodeString = qrImage; // Armazena a imagem do QR code
    });
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
        res.json({ authenticated: false, qrImage: qrCodeString }); // Retorna a imagem do QR code
    } else {
        res.json({ authenticated: false, qrImage: null });
    }
});

// **Rota para enviar mensagem**
app.post('/api/send-message', async (req, res) => {
    const { number, message } = req.body;

    if (!isWhatsAppAuthenticated) {
        return res.status(400).json({ error: 'WhatsApp não está autenticado.' });
    }

    try {
        const sanitizedNumber = `${number}@c.us`; // Formato exigido pelo WhatsApp
        await client.sendMessage(sanitizedNumber, message);
        res.json({ success: true, message: 'Mensagem enviada com sucesso!' });
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({ error: 'Falha ao enviar a mensagem.' });
    }
});

// Inicia o servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
