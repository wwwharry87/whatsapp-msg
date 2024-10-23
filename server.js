const express = require('express');
const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');
const PDFDocument = require('pdfkit');
const path = require('path');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let municipiosData = [];
let qrCodeData = null;
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

let client = new Client({
    authStrategy: new LocalAuth({ clientId: 'whatsapp-client' }),
});

function iniciarClienteWhatsApp() {
    client.on('qr', async (qr) => {
        try {
            qrCodeData = await qrcode.toDataURL(qr);
            clientReady = false;
            console.log('QR code gerado e pronto para ser escaneado.');
        } catch (err) {
            console.error('Erro ao gerar QR code:', err);
        }
    });

    client.on('ready', () => {
        console.log('Cliente do WhatsApp está pronto!');
        qrCodeData = null;
        clientReady = true;
    });

    client.on('disconnected', (reason) => {
        console.log('WhatsApp desconectado. Razão:', reason);
        clientReady = false;
        setTimeout(() => {
            iniciarClienteWhatsApp();
        }, 10000);
    });

    client.initialize();
}

iniciarClienteWhatsApp();

app.get('/api/check-whatsapp', (req, res) => {
    if (clientReady) {
        res.json({ connected: true });
    } else if (qrCodeData) {
        res.json({ connected: false, qr: qrCodeData });
    } else {
        res.json({ connected: false, qr: null });
    }
});

app.get('/api/municipios', (req, res) => {
    const municipios = municipiosData.map(row => row.municipio);
    res.json([...new Set(municipios)]);
});

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

// Ajustando a função para garantir que a coluna [5] seja o telefone
const carregarDadosPorMunicipio = async (url) => {
    const response = await axios.get(url);
    const csvString = response.data;
    const data = [];
    csvString.split('\n').forEach((line, index) => {
        if (index === 0) return;  // Ignorar cabeçalho do CSV
        const columns = line.split(',');
        data.push({
            turma: columns[2],  // Coluna para a turma
            professor: columns[3],  // Coluna para o professor
            coordenador: columns[4],  // Coluna para o coordenador
            telefone: columns[5],  // Coluna para o telefone
            disciplina: columns[7],  // Coluna para a disciplina
            data: columns[8],  // Coluna para a data
            falta: columns[9]  // Coluna para a falta
        });
    });
    return data;
};

// Função para formatar o número de telefone no padrão internacional (WhatsApp ID)
const formatarTelefone = (telefone) => {
    let telefoneCorrigido = telefone.replace(/\D/g, '');  // Remove caracteres não numéricos
    if (!telefoneCorrigido.startsWith('55')) {
        telefoneCorrigido = `55${telefoneCorrigido}`;  // Adiciona o código do país (Brasil) se não estiver presente
    }
    return `${telefoneCorrigido}@c.us`;  // Adiciona o sufixo padrão do WhatsApp
};

// Verifica se o cliente está pronto antes de enviar a mensagem
const aguardarClientePronto = (callback) => {
    if (clientReady) {
        callback();
    } else {
        const interval = setInterval(() => {
            if (clientReady) {
                clearInterval(interval);
                callback();
            }
        }, 2000);  // Verifica a cada 2 segundos se o cliente está pronto
    }
};

// Função para gerar PDF com os dados do coordenador
const gerarPDF = (municipio, coordenador, dados, callback) => {
    const doc = new PDFDocument({ size: 'A4', compress: true });

    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
        let pdfData = Buffer.concat(buffers);
        callback(pdfData.toString('base64'));
    });

    doc.fontSize(16).text(`Relatório de Pendências - ${municipio}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Coordenador: ${coordenador}`);
    doc.moveDown();

    // Adicionando a tabela no PDF
    doc.fontSize(12);
    const table = {
        headers: ['Turma', 'Professor', 'Disciplina', 'Data', 'Falta'],
        rows: dados.map(item => [item.turma, item.professor, item.disciplina, item.data, item.falta])
    };

    table.headers.forEach((header, i) => {
        doc.text(header, { continued: i < table.headers.length - 1 });
    });
    doc.moveDown();

    table.rows.forEach((row) => {
        row.forEach((col, colIndex) => {
            doc.text(col, { continued: colIndex < row.length - 1 });
        });
        doc.moveDown();
    });

    doc.end();
};

// Rota para enviar mensagens via WhatsApp com PDF anexado
app.post('/api/enviar-mensagem', async (req, res) => {
    const { municipio, coordenador, dados } = req.body;

    if (!clientReady) {
        return res.status(500).json({ error: 'WhatsApp não está conectado' });
    }

    const enviarMensagem = () => {
        try {
            // Pega o primeiro telefone da lista (se necessário, pode ajustar para múltiplos telefones)
            const telefone = dados[0].telefone;
            if (!telefone) {
                throw new Error('Número de telefone não fornecido.');
            }

            const telefoneCorrigido = formatarTelefone(telefone);
            const welcomeMessage = `Olá *${coordenador}*! Aqui é o Assistente Virtual.\nIdentificamos pendências no preenchimento do *Diário de Classe*. Por favor, confira o relatório com as informações detalhadas a seguir.`;

            client.sendMessage(telefoneCorrigido, welcomeMessage).then(() => {
                gerarPDF(municipio, coordenador, dados, (pdfBase64) => {
                    const media = new MessageMedia('application/pdf', pdfBase64, `relatorio_${coordenador}.pdf`);
                    client.sendMessage(telefoneCorrigido, media).then(() => {
                        res.json({ success: true, message: 'Mensagem e PDF enviados com sucesso!' });
                    }).catch(err => {
                        res.status(500).json({ error: 'Erro ao enviar PDF via WhatsApp.', details: err.message });
                    });
                });
            }).catch(err => {
                res.status(500).json({ error: 'Erro ao enviar mensagem inicial via WhatsApp.', details: err.message });
            });

        } catch (error) {
            res.status(500).json({ error: 'Erro ao processar envio de mensagem.', details: error.message });
        }
    };

    aguardarClientePronto(enviarMensagem);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
