const express = require('express');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const axios = require('axios');
const ExcelJS = require('exceljs');
const { jsPDF } = require('jspdf');
require('jspdf-autotable');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const iconv = require('iconv-lite');  // Corrigir codificação UTF-8

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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

// Função para gerar PDF com jsPDF e ajuste de margem e codificação UTF-8
const gerarPDF = async (coordenador, dados, callback) => {
    const doc = new jsPDF({
        unit: 'pt',
        format: 'a4'
    });

    const tableData = dados.map(dado => [
        iconv.decode(Buffer.from(dado.turma, 'binary'), 'utf8'),
        iconv.decode(Buffer.from(dado.professor, 'binary'), 'utf8'),
        iconv.decode(Buffer.from(dado.disciplina, 'binary'), 'utf8'),
        iconv.decode(Buffer.from(dado.data, 'binary'), 'utf8'),
        iconv.decode(Buffer.from(dado.falta, 'binary'), 'utf8')
    ]);

    doc.setFont('helvetica', 'normal');  // Definir fonte Helvetica UTF-8
    doc.setFontSize(14);
    doc.text(`Relatório de Pendências - Coordenador: ${coordenador}`, 40, 40);  // Ajustando a margem superior
    doc.setFontSize(10);

    doc.autoTable({
        head: [['Turma', 'Professor', 'Disciplina', 'Data', 'Falta']],
        body: tableData,
        styles: {
            font: 'helvetica',
            fontSize: 10,
            cellPadding: 5,
            halign: 'left',
            valign: 'middle'
        },
        columnStyles: {
            0: { cellWidth: 55 },  // Aumentar a largura da coluna "Turma"
            1: { cellWidth: 150 },  // Aumentar a largura da coluna "Professor"
            2: { cellWidth: 135 },  // Aumentar a largura da coluna "Disciplina"
            3: { cellWidth: 80 },  // Aumentar a largura da coluna "Data"
            4: { cellWidth: 100 }   // Aumentar a largura da coluna "Falta"
        },
        theme: 'grid',
        startY: 60  // Ajuste de margem superior para começar a tabela
    });

    const nomeArquivoPDF = `upload/${coordenador.replace(/\s+/g, '_')}.pdf`;
    fs.writeFileSync(nomeArquivoPDF, doc.output());

    callback(nomeArquivoPDF);
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

    enviarMensagem();
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
