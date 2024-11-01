const express = require('express');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const axios = require('axios');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const pdfMake = require('pdfmake/build/pdfmake');
const pdfFonts = require('pdfmake/build/vfs_fonts');
pdfMake.vfs = pdfFonts.pdfMake.vfs;

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Middleware para redirecionar o domínio da Render para o domínio personalizado
app.use((req, res, next) => {
    if (req.hostname === 'whatsapp-msg-n4wh.onrender.com') {
        return res.redirect(301, `https://www.bwsolucoesinteligentes.com${req.originalUrl}`);
    }
    next();
});

let municipiosData = [];
let qrCodeData = null;
let clientReady = false;

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

const carregarDadosPorMunicipio = async (url) => {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const data = [];
    const csvString = response.data.toString('utf-8');
    csvString.split('\n').forEach((line, index) => {
        if (index === 0) return;  // Ignorar cabeçalho do CSV
        const columns = line.split(',');
        data.push({
            escola: columns[0],
            turma: columns[2],
            professor: columns[3],
            coordenador: columns[4],
            telefone: columns[5],
            disciplina: columns[7],
            data: columns[8],
            falta: columns[9]
        });
    });
    return data;
};

const gerarPDF = async (coordenador, dados, callback) => {
    const tableBody = [
        [{ text: 'Turma', bold: true }, { text: 'Professor', bold: true }, { text: 'Disciplina', bold: true }, { text: 'Data', bold: true }, { text: 'Falta', bold: true }]
    ];

    dados.forEach(dado => {
        tableBody.push([
            dado.turma || '',
            dado.professor || '',
            dado.disciplina || '',
            dado.data || '',
            dado.falta || ''
        ]);
    });

    const docDefinition = {
        content: [
            { text: `Relatório de Pendências - Coordenador: ${coordenador}`, style: 'header' },
            {
                table: {
                    headerRows: 1,
                    widths: [55, 145, 130, 75, 90],
                    body: tableBody
                }
            }
        ],
        styles: {
            header: {
                fontSize: 14,
                bold: true,
                margin: [0, 20, 0, 10]
            },
            tableHeader: {
                bold: true,
                fontSize: 12,
                color: 'black',
                alignment: 'center'
            }
        }
    };

    const pdfDoc = pdfMake.createPdf(docDefinition);
    pdfDoc.getBuffer(buffer => {
        const nomeArquivoPDF = `upload/${coordenador.replace(/\s+/g, '_')}.pdf`;
        fs.writeFileSync(nomeArquivoPDF, buffer);
        callback(nomeArquivoPDF);
    });
};

// Função para enviar mensagens para coordenadores
const enviarParaCoordenador = (coordenador, dados) => {
    if (!coordenador || !coordenador.telefone) {
        console.error(`Telefone não encontrado para o coordenador: ${coordenador ? coordenador.coordenador : 'desconhecido'}`);
        return; // Pula o envio para coordenadores sem telefone
    }

    const telefone = `55${coordenador.telefone.replace(/\D/g, '')}@c.us`;
    const mensagem = `Olá, ${coordenador.coordenador}. Identificamos pendências no preenchimento do Diário de Classe. Confira o relatório anexado.`;

    gerarPDF(coordenador.coordenador, dados, (nomeArquivoPDF) => {
        const media = MessageMedia.fromFilePath(nomeArquivoPDF);

        client.sendMessage(telefone, mensagem)
            .then(() => {
                client.sendMessage(telefone, media)
                    .then(() => console.log(`PDF enviado para ${coordenador.coordenador}`))
                    .catch(err => console.error(`Erro ao enviar PDF para ${coordenador.coordenador}:`, err));
            })
            .catch(err => console.error(`Erro ao enviar mensagem para ${coordenador.coordenador}:`, err));
    });
};

app.post('/api/enviar-mensagem', async (req, res) => {
    const { municipio, coordenador, escola, dados } = req.body;

    if (!clientReady) {
        return res.status(500).json({ error: 'WhatsApp não está conectado' });
    }

    // Filtra dados para incluir apenas coordenadores com telefone válido
    const dadosFiltrados = dados.filter(dado =>
        (!coordenador || dado.coordenador === coordenador) &&
        (!escola || dado.escola === escola) &&
        dado.telefone // Filtra apenas coordenadores com telefone definido
    );

    if (!coordenador) {
        const coordenadoresUnicos = [...new Set(dadosFiltrados.map(dado => dado.coordenador))];
        coordenadoresUnicos.forEach(coord => {
            const dadosDoCoordenador = dadosFiltrados.filter(d => d.coordenador === coord);
            enviarParaCoordenador(dadosDoCoordenador[0], dadosDoCoordenador);
        });
    } else {
        enviarParaCoordenador(dadosFiltrados[0], dadosFiltrados);
    }

    res.json({ success: true, message: 'Mensagens enviadas com sucesso!' });
});


const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
