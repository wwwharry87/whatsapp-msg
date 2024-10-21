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

// Função para baixar o CSV a partir da URL e salvar na pasta public
async function downloadCSV(url, destination) {
    const writer = fs.createWriteStream(destination);
    
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

// Função para buscar a URL do CSV baseado no município
async function getCSVUrlByMunicipio(municipio) {
    const municipiosFile = fs.readFileSync('municipios.txt', 'utf-8');
    const municipios = municipiosFile.split('\n').map(line => {
        const [municipioName, url] = line.split(';');
        return { municipio: municipioName.trim(), url: url.trim() };
    });

    const foundMunicipio = municipios.find(m => m.municipio === municipio);
    if (foundMunicipio) {
        return foundMunicipio.url;
    } else {
        throw new Error('Município não encontrado.');
    }
}

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

        // Busca a URL do CSV e baixa o arquivo
        const csvUrl = await getCSVUrlByMunicipio(municipio);
        const destination = path.join(__dirname, 'public', `${municipio}-numbers.csv`);

        await downloadCSV(csvUrl, destination); // Baixa o CSV correspondente

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
