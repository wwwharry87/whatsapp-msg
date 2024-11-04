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
const bcrypt = require('bcryptjs');
const crypto = require('crypto'); // Para gerar tokens seguros

pdfMake.vfs = pdfFonts.pdfMake.vfs;

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60000 }
}));

app.use(express.static(path.join(__dirname, 'public')));

let usuarios = [];

// Carregar dados dos usuários a partir do arquivo user.txt
function carregarUsuarios() {
    fs.readFile('user.txt', 'utf-8', (err, data) => {
        if (err) {
            console.error('Erro ao carregar o arquivo de usuários:', err);
            return;
        }
        usuarios = data.split('\n').map(line => {
            const [username, password, telefone] = line.split(',');
            return {
                username: username ? username.trim() : '',
                password: password ? password.trim() : '',
                telefone: telefone ? telefone.trim() : ''
            };
        }).filter(user => user.username && user.password && user.telefone);
        console.log('Usuários carregados com sucesso:', usuarios);
    });
}
carregarUsuarios();

app.post('/api/verificar-usuario', (req, res) => {
    const { username } = req.body;
    const usuarioExistente = usuarios.some(user => user.username === username);
    res.json({ usuarioExistente });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    console.log('Usuário digitado:', username);
    console.log('Senha digitada:', password);

    const usuarioValido = usuarios.find(user => user.username === username);
    if (usuarioValido) {
        const senhaCorreta = bcrypt.compareSync(password, usuarioValido.password);
        if (senhaCorreta) {
            req.session.authenticated = true;
            res.json({ success: true });
        } else {
            res.json({ success: false });
        }
    } else {
        res.json({ success: false });
    }
});

// Funcionalidade de redefinição de senha
const redefinicaoTokens = {}; // Armazena tokens temporários para redefinição de senha

app.post('/api/solicitar-redefinicao', (req, res) => {
    const { username } = req.body;
    const usuario = usuarios.find(user => user.username === username);

    if (!usuario) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const token = crypto.randomBytes(20).toString('hex');
    redefinicaoTokens[token] = username;

    // Enviar o link de redefinição de senha via WhatsApp
    const telefone = `55${usuario.telefone.replace(/\D/g, '')}@c.us`;
    const mensagem = `Olá, ${username}. Clique no link para redefinir sua senha: https://bwsolucoesinteligentes.com/nova-senha.html?token=${token}`;

    client.sendMessage(telefone, mensagem)
        .then(() => res.json({ success: true }))
        .catch(err => {
            console.error('Erro ao enviar mensagem de redefinição:', err);
            res.status(500).json({ error: 'Erro ao enviar mensagem de redefinição.' });
        });
});

app.post('/api/redefinir-senha', (req, res) => {
    const { token, novaSenha } = req.body;
    const username = redefinicaoTokens[token];

    if (!username) {
        return res.status(400).json({ error: 'Token inválido ou expirado.' });
    }

    const usuario = usuarios.find(user => user.username === username);
    if (!usuario) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    usuario.password = bcrypt.hashSync(novaSenha, 10);
    delete redefinicaoTokens[token];

    // Atualizar o arquivo user.txt
    fs.writeFile('user.txt', usuarios.map(user => `${user.username},${user.password},${user.telefone}`).join('\n'), (err) => {
        if (err) {
            console.error('Erro ao atualizar arquivo de usuários:', err);
            return res.status(500).json({ error: 'Erro ao atualizar senha.' });
        }
        res.json({ success: true });
    });
});

app.use((req, res, next) => {
    if (!req.session.authenticated && !req.path.startsWith('/index.html') && !req.path.startsWith('/logo.png') && !req.path.startsWith('/favicon.ico') && req.path !== '/login') {
        return res.redirect('/index.html');
    }
    next();
});

app.get('/', (req, res) => {
    if (req.session.authenticated) {
        return res.redirect('/home.html');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/check-session', (req, res) => {
    res.json({ authenticated: req.session.authenticated || false });
});

app.get('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.sendStatus(200);
    });
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

function verificarAutenticacao(req, res, next) {
    if (req.session.authenticated) {
        next();
    } else {
        res.redirect('/index.html');
    }
}

app.get('/home.html', verificarAutenticacao, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/api/check-whatsapp', verificarAutenticacao, (req, res) => {
    if (clientReady) {
        res.json({ connected: true });
    } else if (qrCodeData) {
        res.json({ connected: false, qr: qrCodeData });
    } else {
        res.json({ connected: false, qr: null });
    }
});

app.get('/api/municipios', verificarAutenticacao, async (req, res) => {
    try {
        // Filtrar municípios que têm dados
        const municipiosComDados = [];
        
        for (const municipio of municipiosData) {
            const url = municipio.url;
            try {
                const dados = await carregarDadosPorMunicipio(url);
                if (dados.length > 0) {
                    municipiosComDados.push(municipio.municipio);
                }
            } catch (error) {
                console.error(`Erro ao carregar dados para o município ${municipio.municipio}:`, error);
            }
        }

        res.json([...new Set(municipiosComDados)]);
    } catch (error) {
        console.error('Erro ao filtrar municípios:', error);
        res.status(500).json({ error: 'Erro ao filtrar municípios.' });
    }
});


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

app.post('/api/enviar-mensagem', verificarAutenticacao, async (req, res) => {
    const { municipio, coordenador, escola, dados } = req.body;
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

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
