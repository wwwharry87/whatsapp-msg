const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const { Client, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const axios = require('axios');
const path = require('path'); // Para servir arquivos estáticos

const app = express();
app.use(bodyParser.json());
app.use(fileUpload());
app.use(express.static(path.join(__dirname, 'public'))); // Servir arquivos estáticos como o frontend

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
        timeout: 60000,  // Aumenta o tempo limite para o Puppeteer
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

// Função para formatar o número de telefone (adiciona o código do país e remove o "9" extra)
function formatPhoneNumber(phone) {
    phone = phone.replace(/[^0-9]/g, ''); // Remove caracteres não numéricos
    if (phone.startsWith('0')) {
        phone = phone.substring(1); // Remove o "0" inicial, se presente
    }
    if (phone.length === 11 && phone[2] === '9') {
        phone = phone.substring(0, 2) + phone.substring(3); // Remove o "9" extra após o DDD
    }
    return `55${phone}`; // Adiciona o código do país (Brasil)
}

// Função para enviar PDF via WhatsApp
app.post('/api/send-whatsapp', async (req, res) => {
    try {
        const { phone, message } = req.body; // Número do telefone e mensagem a ser enviada
        const pdf = req.files.pdf; // Arquivo PDF enviado do frontend

        if (!phone || !pdf) {
            return res.status(400).send({ error: 'Número de telefone ou PDF não informado.' });
        }

        // Formata o número de telefone
        const formattedPhone = formatPhoneNumber(phone);

        // Salva o PDF no servidor para envio
        const pdfPath = `./${pdf.name}`;
        await pdf.mv(pdfPath);

        // Envia a mensagem de texto
        await client.sendMessage(`${formattedPhone}@c.us`, message);

        // Envia o PDF como anexo
        const media = MessageMedia.fromFilePath(pdfPath);
        await client.sendMessage(`${formattedPhone}@c.us`, media);

        // Apaga o arquivo PDF após o envio
        fs.unlinkSync(pdfPath);

        res.send({ status: 'success', message: `Mensagem e PDF enviados para ${formattedPhone}` });
    } catch (error) {
        console.error('Erro ao enviar mensagem via WhatsApp:', error);
        res.status(500).send({ error: 'Erro ao enviar mensagem via WhatsApp.' });
    }
});

// Endpoint para buscar dados dos CSVs baseados no txt
app.get('/api/municipios', async (req, res) => {
    try {
        const municipios = await processMunicipiosFile();
        const allData = [];

        for (const municipio of municipios) {
            const data = await fetchAndProcessCSV(municipio.url);
            allData.push({ municipio: municipio.municipio, data });
        }

        res.json(allData); // Envia os dados para o frontend
    } catch (error) {
        console.error('Erro ao processar o arquivo municipios.txt ou CSV:', error);
        res.status(500).send({ error: 'Erro ao processar dados dos municípios.' });
    }
});

// Função para ler e processar o arquivo municipios.txt
async function processMunicipiosFile() {
    const municipiosFile = fs.readFileSync('municipios.txt', 'utf-8');
    const municipios = municipiosFile.split('\n').map(line => {
        const [municipio, url] = line.split(';');
        return { municipio: municipio.trim(), url: url.trim() };
    });
    return municipios;
}

// Função para baixar e processar CSV a partir da URL
async function fetchAndProcessCSV(url) {
    try {
        const response = await axios.get(url);
        const data = [];
        response.data.split('\n').forEach(line => {
            const columns = line.split(',');
            if (columns.length > 7) {
                data.push({
                    nmturma: columns[2].trim(),
                    professor: columns[3].trim(),
                    telefone: columns[5].trim(),
                    disciplina: columns[7].trim(),
                    data: columns[8].trim(),
                    falta: columns[9].trim(),
                    coordenador: columns[4].trim(),
                    escola: columns[0].trim()
                });
            }
        });
        return data;
    } catch (error) {
        console.error(`Erro ao buscar CSV da URL ${url}:`, error);
        return [];
    }
}

// Inicia o servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
