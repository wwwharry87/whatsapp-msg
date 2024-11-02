const fs = require('fs');
const bcrypt = require('bcryptjs');

// Função para carregar e criptografar os usuários
function atualizarUsuarios() {
    fs.readFile('usuarios.txt', 'utf-8', (err, data) => {
        if (err) {
            console.error('Erro ao ler o arquivo usuarios.txt:', err);
            return;
        }

        // Dividir as linhas e criptografar as senhas
        const usuarios = data.split('\n').filter(line => line.trim() !== '');
        const usuariosCriptografados = usuarios.map(line => {
            const [username, password, telefone] = line.split(',');
            const senhaCriptografada = bcrypt.hashSync(password.trim(), 10);
            return `${username.trim()},${senhaCriptografada},${telefone.trim()}`;
        });

        // Salvar no arquivo user.txt
        fs.writeFile('user.txt', usuariosCriptografados.join('\n'), (err) => {
            if (err) {
                console.error('Erro ao salvar o arquivo user.txt:', err);
            } else {
                console.log('Usuários atualizados e salvos em user.txt com senhas criptografadas!');
            }
        });
    });
}

atualizarUsuarios();