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

// Inicializa o cliente do WhatsApp Web
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

// QR Code para autenticação
client.on('qr', (qr) => {
    console.log('QR Code gerado, escaneie com o WhatsApp:', qr);
});

// Evento quando o cliente está pronto
client.on('ready', () => {
    console.log('Cliente WhatsApp está pronto');
});

// Função para formatar o número de telefone (código do país e remove o "9" extra)
function formatPhoneNumber(phone) {
    phone = phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) {
        phone = phone.substring(1);
    }
    if (phone.length === 11 && phone[2] === '9') {
        phone = phone.substring(0, 2) + phone.substring(3);
    }
    return `55${phone}`;
}

// Função para enviar mensagem e PDF via WhatsApp
app.post('/api/send-whatsapp', async (req, res) => {
    try {
        const { phone, message } = req.body;
        const pdf = req.files ? req.files.pdf : null; // PDF é opcional

        if (!phone) {
            return res.status(400).send({ error: 'Número de telefone não informado.' });
        }

        // Verifica se o cliente do WhatsApp está pronto
        if (!client.info) {
            return res.status(500).send({ error: 'Cliente do WhatsApp não está pronto.' });
        }

        const formattedPhone = formatPhoneNumber(phone);
        
        // Envia a mensagem de texto
        await client.sendMessage(`${formattedPhone}@c.us`, message);

        if (pdf) {
            const pdfPath = `./${pdf.name}`;
            await pdf.mv(pdfPath);

            const media = MessageMedia.fromFilePath(pdfPath);
            await client.sendMessage(`${formattedPhone}@c.us`, media);

            fs.unlinkSync(pdfPath);
        }

        res.send({ status: 'success', message: `Mensagem enviada para ${formattedPhone}` });
    } catch (error) {
        console.error('Erro ao enviar mensagem via WhatsApp:', error);
        res.status(500).send({ error: 'Erro ao enviar mensagem via WhatsApp.' });
    }
});

// Inicia o servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
