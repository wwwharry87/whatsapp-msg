const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const { Client, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios'); // Para baixar o arquivo CSV

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
        }).filter(Boolean);

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

// Função para baixar e processar CSV a partir da URL do município
app.get('/api/municipio-dados', async (req, res) => {
    const { url } = req.query; // URL do município passado como parâmetro
    if (!url) {
        return res.status(400).json({ error: 'URL do município não fornecida.' });
    }

    try {
        // Baixa o arquivo CSV do município selecionado
        const response = await axios.get(url);
        const data = [];

        response.data.split('\n').forEach(line => {
            const columns = line.split(',');
            if (columns.length >= 7) {
                data.push({
                    escola: columns[0].trim(),
                    coordenador: columns[1].trim(),
                    nmturma: columns[2].trim(),
                    professor: columns[3].trim(),
                    telefone: columns[4].trim(),
                    disciplina: columns[5].trim(),
                    data: columns[6].trim(),
                    falta: columns[7].trim()
                });
            }
        });

        if (data.length === 0) {
            return res.status(500).json({ error: 'Nenhuma informação disponível no arquivo CSV.' });
        }

        // Envia os dados processados para o frontend
        res.json(data);
    } catch (error) {
        console.error('Erro ao buscar e processar CSV:', error);
        res.status(500).json({ error: 'Erro ao buscar e processar o CSV.' });
    }
});

// Inicia o servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
