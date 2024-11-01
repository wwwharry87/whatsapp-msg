const express = require('express');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const axios = require('axios');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const pdfMake = require('pdfmake/build/pdfmake');
const pdfFonts = require('pdfmake/build/vfs_fonts');
const session = require('express-session');
const bcrypt = require('bcryptjs'); // Usando bcryptjs

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configuração de sessão para expirar após 1 minuto de inatividade
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60000 } // Sessão expira em 1 minuto (60.000 ms)
}));

// Middleware para verificar se a sessão está autenticada
app.use((req, res, next) => {
    // Permite acesso a arquivos estáticos como logo.png e outros arquivos na pasta public
    if (!req.session.authenticated && !req.path.startsWith('/login.html') && !req.path.startsWith('/logo.png')) {
        res.redirect('/login.html');
    } else {
        next();
    }
});

// Rota principal para redirecionar automaticamente para a página de login
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Middleware para servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Middleware para redirecionar o domínio da Render para o domínio personalizado
app.use((req, res, next) => {
    if (req.hostname === 'whatsapp-msg-n4wh.onrender.com') {
        return res.redirect(301, `https://www.bwsolucoesinteligentes.com${req.originalUrl}`);
    }
    next();
});

// Rota para verificar se a sessão ainda está ativa
app.get('/api/check-session', (req, res) => {
    if (req.session.authenticated) {
        res.json({ authenticated: true });
    } else {
        res.json({ authenticated: false });
    }
});

// Rota para encerrar a sessão (logout)
app.get('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.sendStatus(200); // Envia uma resposta de sucesso
    });
});

let municipiosData = [];
let qrCodeData = null;
let clientReady = false;

// Carregar dados dos municípios
fs.createReadStream('municipios.txt')
    .pipe(csv({ separator: ';', headers: ['municipio', 'url'] }))
    .on('data', (row) => {
        municipiosData.push(row);
    })
    .on('end', () => {
        console.log('Arquivo de municípios carregado com sucesso.');
    });

// Configuração do cliente WhatsApp
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
            console.error('Erro ao gerar código QR:', err);
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

// Lista de usuários com senhas hash
const usuarios = [
    { username: 'admin', password: bcrypt.hashSync('admin8718', 10) }, // senha: admin8718
    { username: 'user1', password: bcrypt.hashSync('senha123', 10) },  // senha: senha123
    { username: 'user2', password: bcrypt.hashSync('senha456', 10) }   // senha: senha456
];

// Rota para autenticar o login
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Verifica se o usuário existe
    const usuarioValido = usuarios.find(user => user.username === username);
    if (usuarioValido && bcrypt.compareSync(password, usuarioValido.password)) {
        req.session.authenticated = true;
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// Middleware para proteger as rotas após o login
function verificarAutenticacao(req, res, next) {
    if (req.session.authenticated) {
        next();
    } else {
        res.redirect('/'); // Redireciona para a página de login
    }
}

// Protege a rota para index.html
app.get('/index.html', verificarAutenticacao, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota para verificar o status do WhatsApp
app.get('/api/check-whatsapp', verificarAutenticacao, (req, res) => {
    if (clientReady) {
        res.json({ connected: true });
    } else if (qrCodeData) {
        res.json({ connected: false, qr: qrCodeData });
    } else {
        res.json({ connected: false, qr: null });
    }
});

// Rota para obter os municípios
app.get('/api/municipios', verificarAutenticacao, (req, res) => {
    const municipios = municipiosData.map(row => row.municipio);
    res.json([...new Set(municipios)]);
});

// Rota para obter os dados de um município específico
app.get('/api/dados', verificarAutenticacao, async (req, res) => {
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

// Função para carregar dados do município
const carregarDadosPorMunicipio = async (url) => {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const data = [];
    const csvString = response.data.toString('utf-8');
    csvString.split('\n').forEach((line, index) => {
        if (index === 0) return;
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

// Função para gerar o PDF
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
    if (!coordenador) {
        console.error('Coordenador não definido.');
        return;
    }

    const telefone = coordenador.telefone ? `55${coordenador.telefone.replace(/\D/g, '')}@c.us` : null;
    console.log(`Coordenador: ${JSON.stringify(coordenador)}`);
    console.log(`Tentando enviar mensagem para: ${coordenador.coordenador}, Telefone: ${telefone}`);

    if (!telefone) {
        console.error(`Telefone não encontrado ou inválido para o coordenador: ${coordenador.coordenador}`);
        return;
    }

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

// Rota para enviar mensagens
app.post('/api/enviar-mensagem', verificarAutenticacao, async (req, res) => {
    const { municipio, coordenador, escola, dados } = req.body;

    console.log('Dados recebidos no backend:');
    console.log(`Município: ${municipio}`);
    console.log(`Coordenador: ${coordenador}`);
    console.log(`Escola: ${escola}`);

    if (!clientReady) {
        return res.status(500).json({ error: 'WhatsApp não está conectado' });
    }

    const dadosFiltrados = dados.filter(dado =>
        (!coordenador || dado.coordenador === coordenador) &&
        (!escola || dado.escola === escola) &&
        dado.telefone
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

// Configuração do servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
