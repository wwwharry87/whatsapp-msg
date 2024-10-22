const express = require('express');
const { Client } = require('whatsapp-web.js');
const fs = require('fs');
const axios = require('axios');
const qrcode = require('qrcode');
const app = express();

// Inicializando o cliente do WhatsApp Web
let whatsappClient = null;
let isWhatsAppAuthenticated = false;
let qrCodeString = null;

const client = new Client();

client.on('qr', (qr) => {
    qrCodeString = qr;
    console.log('QR Code recebido:', qr);
});

client.on('ready', () => {
    console.log('WhatsApp conectado!');
    isWhatsAppAuthenticated = true;
    qrCodeString = null;
});

client.initialize();

// Leitura do arquivo `municipios.txt`
const lerMunicipios = () => {
    const data = fs.readFileSync('municipios.txt', 'utf-8');
    const municipios = data.split('\n').map(line => {
        const [municipio, url] = line.split(';');
        return { municipio: municipio.trim(), url: url.trim() };
    });
    return municipios;
};

// Função para baixar informações de uma URL
const baixarInfoMunicipios = async (url) => {
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error(`Erro ao baixar dados de ${url}:`, error);
        return null;
    }
};

// Envio de mensagem pelo WhatsApp
const enviarMensagemWhatsApp = async (numero, mensagem) => {
    try {
        if (isWhatsAppAuthenticated) {
            await client.sendMessage(numero, mensagem);
            console.log(`Mensagem enviada para ${numero}`);
        } else {
            console.log("WhatsApp não está autenticado.");
        }
    } catch (error) {
        console.error(`Erro ao enviar mensagem para ${numero}:`, error);
    }
};

// Endpoint para verificar status do WhatsApp
app.get('/api/check-whatsapp', (req, res) => {
    if (isWhatsAppAuthenticated) {
        res.json({ authenticated: true });
    } else if (qrCodeString) {
        res.json({ authenticated: false, qrCode: qrCodeString });
    } else {
        res.json({ authenticated: false, qrCode: null });
    }
});

// Endpoint para enviar as informações dos municípios via WhatsApp
app.post('/api/enviar', async (req, res) => {
    const municipios = lerMunicipios();

    for (const { municipio, url } of municipios) {
        const dados = await baixarInfoMunicipios(url);
        const mensagem = `Informações de ${municipio}: ${dados}`;

        // Exemplo de número de coordenador
        const numeroCoordenador = '5581999999999';

        // Enviar via WhatsApp
        await enviarMensagemWhatsApp(numeroCoordenador, mensagem);
    }

    res.json({ success: true, message: 'Mensagens enviadas com sucesso!' });
});

// Servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
