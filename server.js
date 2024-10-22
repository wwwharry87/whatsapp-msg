const express = require('express');
const app = express();
const path = require('path');

// Middleware para servir arquivos estáticos
app.use(express.static('public'));

// Endpoint de API para testar a comunicação com o backend
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend funcionando corretamente!' });
});

// Iniciar o servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
