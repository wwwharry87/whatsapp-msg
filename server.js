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
});

// Evento quando o cliente está pronto
client.on('ready', () => {
    console.log('Cliente WhatsApp está pronto');
});

// Função para formatar o número de telefone
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

// Função para buscar os municípios no arquivo municipios.txt
app.get('/api/municipios', async (req, res) => {
    try {
        // Verifica se o arquivo municipios.txt existe
        const filePath = path.join(__dirname, 'municipios.txt');
        if (!fs.existsSync(filePath)) {
            return res.status(500).json({ error: 'Arquivo municipios.txt não encontrado.' });
        }

        const municipiosFile = fs.readFileSync(filePath, 'utf-8');
        const municipios = municipiosFile.split('\n').map(line => {
            const [municipio, url] = line.split(';');
            if (municipio && url) {
                return { municipio: municipio.trim(), url: url.trim() };
            }
            return null;
        }).filter(Boolean); // Remove linhas vazias ou inválidas

        if (municipios.length === 0) {
            return res.status(500).json({ error: 'Nenhum município encontrado no arquivo.' });
        }

        // Envia os municípios para o frontend
        res.json(municipios);
    } catch (error) {
        console.error('Erro ao carregar municípios:', error);
        res.status(500).json({ error: 'Erro ao carregar municípios.' });
    }
});

// Função para enviar PDF via WhatsApp
app.post('/api/send-whatsapp', async (req, res) => {
    try {
        const { municipio, phone, message } = req.body;
        const pdf = req.files ? req.files.pdf : null;

        if (!municipio || !phone) {
            return res.status(400).send({ error: 'Município ou número de telefone não informado.' });
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
