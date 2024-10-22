const express = require('express');
const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');
const PDFDocument = require('pdfkit');
const path = require('path');
const { Client, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode'); // Biblioteca para gerar QR code como imagem base64

const app = express();

// Aumentando o limite de tamanho da requisição para lidar com PDFs maiores
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let municipiosData = [];
let qrCodeData = null; // Armazenar o QR code gerado
let clientReady = false;

// Carregar o CSV de municípios e URLs do arquivo municipios.txt
fs.createReadStream('municipios.txt')
  .pipe(csv({ separator: ';', headers: ['municipio', 'url'] }))
  .on('data', (row) => {
    municipiosData.push(row);
  })
  .on('end', () => {
    console.log('Arquivo de municípios carregado com sucesso.');
  });

// Cliente WhatsApp
let client = new Client();

function iniciarClienteWhatsApp() {
    client = new Client();

    client.on('qr', async (qr) => {
        try {
            // Gerar o QR code como imagem base64
            qrCodeData = await qrcode.toDataURL(qr); // Convertendo o QR code para base64
            clientReady = false;
            console.log('QR code gerado e pronto para ser escaneado.');
        } catch (err) {
            console.error('Erro ao gerar QR code:', err);
        }
    });

    client.on('ready', () => {
        console.log('Cliente do WhatsApp está pronto!');
        qrCodeData = null; // Limpar o QR code quando estiver conectado
        clientReady = true;
    });

    client.on('disconnected', () => {
        console.log('WhatsApp desconectado. Reinicializando...');
        clientReady = false;
        iniciarClienteWhatsApp(); // Re-inicializar quando desconectar
    });

    client.initialize();
}

// Inicializar o cliente WhatsApp ao iniciar o serviço
iniciarClienteWhatsApp();

// Rota para verificar se o WhatsApp está conectado e fornecer o QR code como base64 se não estiver
app.get('/api/check-whatsapp', (req, res) => {
    if (clientReady) {
        res.json({ connected: true });
    } else if (qrCodeData) {
        res.json({ connected: false, qr: qrCodeData }); // Enviar o QR code como base64
    } else {
        res.json({ connected: false, qr: null });
    }
});

// Rota para carregar os municípios
app.get('/api/municipios', (req, res) => {
    const municipios = municipiosData.map(row => row.municipio);
    res.json([...new Set(municipios)]); // Remover duplicatas
});

// Rota para carregar os dados filtrados e paginados
app.get('/api/dados', async (req, res) => {
    const { municipio } = req.query;

    const municipioEncontrado = municipiosData.find(row => row.municipio === municipio);
    if (!municipioEncontrado) return res.status(404).json({ error: 'Município não encontrado' });

    const url = municipioEncontrado.url;

    try {
        const dados = await carregarDadosPorMunicipio(url);
        res.json({ data: dados });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao carregar os dados filtrados.' });
    }
});

// Função para carregar dados CSV de uma URL (ajustada para incluir telefone na coluna [5])
const carregarDadosPorMunicipio = async (url) => {
    const response = await axios.get(url);
    const csvString = response.data;
    const data = [];
    csvString.split('\n').forEach((line, index) => {
        if (index === 0) return;
        const columns = line.split(',');
        data.push({
            turma: columns[2],
            professor: columns[3],
            coordenador: columns[4], // Coordenador na coluna [4]
            telefone: columns[5], // Telefone na coluna [5]
            disciplina: columns[7],
            data: columns[8],
            falta: columns[9]
        });
    });
    return data;
};

// Função para formatar o número de telefone no padrão internacional (WhatsApp ID)
const formatarTelefone = (telefone) => {
    let telefoneCorrigido = telefone.replace(/\D/g, ''); // Remove caracteres não numéricos
    if (!telefoneCorrigido.startsWith('55')) {
        telefoneCorrigido = `55${telefoneCorrigido}`; // Adiciona o código do país (Brasil) se não estiver presente
    }
    return `${telefoneCorrigido}@c.us`; // Adiciona o sufixo padrão do WhatsApp
};

// Rota para enviar mensagens via WhatsApp com PDF anexado
app.post('/api/enviar-mensagem', async (req, res) => {
    const { municipio, coordenador, telefone, pdfBase64 } = req.body;

    if (!clientReady) {
        console.error('WhatsApp não está conectado.');
        return res.status(500).json({ error: 'WhatsApp não está conectado' });
    }

    try {
        const telefoneCorrigido = formatarTelefone(telefone);
        console.log(`Enviando mensagem para o telefone: ${telefoneCorrigido} e coordenador: ${coordenador}`);
        
        // Converter o PDF base64 para um objeto de mídia para enviar pelo WhatsApp
        const media = new MessageMedia('application/pdf', pdfBase64, `relatorio_${coordenador}.pdf`);
        console.log('PDF convertido para MessageMedia com sucesso.');

        // Mensagem personalizada
        const message = `Olá, ${coordenador}, segue o relatório de ${municipio}.`;

        // Enviar a mensagem com o PDF anexado
        client.sendMessage(telefoneCorrigido, message, { media }).then(() => {
            console.log('Mensagem enviada com sucesso via WhatsApp.');
            res.json({ success: true, message: 'Mensagem enviada com sucesso!' });
        }).catch(err => {
            console.error('Erro ao enviar mensagem via WhatsApp:', err.message);
            res.status(500).json({ error: 'Erro ao enviar mensagem via WhatsApp.', details: err.message });
        });

    } catch (error) {
        console.error('Erro ao processar o envio de mensagem:', error.message);
        res.status(500).json({ error: 'Erro ao processar envio de mensagem.', details: error.message });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
