const express = require('express');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const axios = require('axios');
const ExcelJS = require('exceljs');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const iconv = require('iconv-lite');  // Garantir codificação UTF-8
const pdfMake = require('pdfmake/build/pdfmake');
const pdfFonts = require('pdfmake/build/vfs_fonts');
pdfMake.vfs = pdfFonts.pdfMake.vfs;
const session = require('express-session');  // Gerenciamento de sessão para login

const app = express();

// Configurações da sessão
app.use(session({
    secret: 'segredo-super-seguro', // Troque para uma string mais segura
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Defina 'true' se estiver usando HTTPS
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let municipiosData = [];
let qrCodeData = null;
let clientReady = false;

// Simulação de um banco de dados de usuários
const users = {
    'admin': '1234',  // Usuário: admin, Senha: 1234
    'user1': 'senha1' // Você pode adicionar mais usuários e senhas
};

// Middleware para verificar se o usuário está logado
function verificarAutenticacao(req, res, next) {
    if (req.session.loggedIn) {
        next(); // Usuário autenticado, pode acessar a aplicação
    } else {
        res.status(401).json({ message: 'Não autenticado. Faça o login para acessar.' });
    }
}

// Rotas de login e logout
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (users[username] && users[username] === password) {
        req.session.loggedIn = true;
        req.session.username = username;
        res.json({ success: true, message: 'Login bem-sucedido!' });
    } else {
        res.status(401).json({ success: false, message: 'Usuário ou senha incorretos.' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Logout realizado com sucesso.' });
});

// Todas as rotas abaixo desta linha precisam de autenticação
app.use(verificarAutenticacao);

// Rotas de WhatsApp, municípios e geração de PDFs continuam aqui...
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

// Função para carregar os dados do CSV e garantir a codificação UTF-8
const carregarDadosPorMunicipio = async (url) => {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const csvString = iconv.decode(Buffer.from(response.data), 'utf-8');  // Garantir codificação UTF-8
    const data = [];
    csvString.split('\n').forEach((line, index) => {
        if (index === 0) return;  // Ignorar cabeçalho do CSV
        const columns = line.split(',');
        data.push({
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

// Função para gerar Excel
const gerarExcel = async (coordenador, dados) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Relatório de Pendências');

    worksheet.columns = [
        { header: 'Turma', key: 'turma', width: 15 },
        { header: 'Professor', key: 'professor', width: 30 },
        { header: 'Disciplina', key: 'disciplina', width: 20 },
        { header: 'Data', key: 'data', width: 25 },
        { header: 'Falta', key: 'falta', width: 30 }
    ];

    worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'D3D3D3' }
        };
    });

    dados.forEach((dado, index) => {
        const row = worksheet.addRow({
            turma: dado.turma,
            professor: dado.professor,
            disciplina: dado.disciplina,
            data: dado.data,
            falta: dado.falta
        });

        if (index % 2 === 0) {
            row.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'F5F5F5' }
                };
            });
        }

        row.font = { size: 10 };
    });

    worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell, colNumber) => {
            cell.alignment = { wrapText: true };
        });
    });

    const nomeArquivoExcel = `upload/${coordenador.replace(/\s+/g, '_')}.xlsx`;

    if (!fs.existsSync('upload')) {
        fs.mkdirSync('upload');
    }

    await workbook.xlsx.writeFile(nomeArquivoExcel);

    return nomeArquivoExcel;
};

// Função para gerar PDF com PDFMake
const gerarPDF = async (coordenador, dados, callback) => {
    const tableBody = [
        [{ text: 'Turma', bold: true }, { text: 'Professor', bold: true }, { text: 'Disciplina', bold: true }, { text: 'Data', bold: true }, { text: 'Falta', bold: true }]
    ];

    // Inserir os dados na tabela
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

app.post('/api/enviar-mensagem', async (req, res) => {
    const { municipio, coordenador, dados } = req.body;

    if (!clientReady) {
        return res.status(500).json({ error: 'WhatsApp não está conectado' });
    }

    const enviarMensagem = () => {
        try {
            const telefone = dados[0].telefone;
            if (!telefone) {
                throw new Error('Número de telefone não fornecido.');
            }

            const telefoneCorrigido = `55${telefone.replace(/\D/g, '')}@c.us`;
            const welcomeMessage = `Olá *${coordenador}*! Aqui é o Assistente Virtual.\nIdentificamos pendências no preenchimento do *Diário de Classe*. Confira o relatório anexado.`;

            client.sendMessage(telefoneCorrigido, welcomeMessage).then(() => {
                gerarPDF(coordenador, dados, (nomeArquivoPDF) => {
                    const media = new MessageMedia('application/pdf', fs.readFileSync(nomeArquivoPDF).toString('base64'), `relatorio_${coordenador.replace(/\s+/g, '_')}.pdf`);
                    client.sendMessage(telefoneCorrigido, media).then(() => {
                        res.json({ success: true, message: 'Mensagem e arquivos enviados com sucesso!' });
                    }).catch(err => {
                        console.error("Erro ao enviar PDF via WhatsApp:", err);
                        res.status(500).json({ error: 'Erro ao enviar PDF via WhatsApp.', details: err.message });
                    });
                });
            }).catch(err => {
                console.error("Erro ao enviar mensagem inicial via WhatsApp:", err);
                res.status(500).json({ error: 'Erro ao enviar mensagem inicial via WhatsApp.', details: err.message });
            });

        } catch (error) {
            console.error("Erro ao processar envio de mensagem:", error);
            res.status(500).json({ error: 'Erro ao processar envio de mensagem.', details: error.message });
        }
    };

    enviarMensagem();
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
