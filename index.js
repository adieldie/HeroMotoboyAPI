require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cookieParser = require('cookie-parser');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Tela principal (App do Motoboy)
app.get('/', (req, res) => {
    const cpf = req.cookies.hero_cpf;
    const password = req.cookies.hero_password;

    if (!cpf || !password) {
        return res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Login - Motoboy</title>
            <style>
                body { font-family: sans-serif; background-color: #f0f2f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .login-box { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 100%; max-width: 320px; text-align: center; }
                input { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
                button { width: 100%; padding: 12px; background-color: #2299dd; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; }
            </style>
        </head>
        <body>
            <div class="login-box">
                <h2>Vincular Celular</h2>
                <form action="/auth" method="POST">
                    <input type="text" name="cpf" placeholder="Seu CPF (ex: 000.000.000-00)" required>
                    <input type="password" name="password" placeholder="Sua Senha" required>
                    <button type="submit">Entrar no Scanner</button>
                </form>
            </div>
        </body>
        </html>
        `);
    }

    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Autenticação
app.post('/auth', (req, res) => {
    const { cpf, password } = req.body;
    if (!cpf || !password) return res.status(400).send("Preencha tudo.");
    const oneYear = 1000 * 60 * 60 * 24 * 365;
    res.cookie('hero_cpf', cpf, { maxAge: oneYear, httpOnly: true });
    res.cookie('hero_password', password, { maxAge: oneYear, httpOnly: true });
    res.redirect('/');
});

// A Rota antiga pra quem escanear pelo celular normal sem usar o app
app.get('/pegar/:pedidoId', (req, res) => {
    // Apenas redirecionamos para o Super Scanner
    res.redirect('/');
});


// ==========================================
// API JSON PARA O FRONTEND DO SCANNER
// ==========================================

// Middleware para verificar se o cookie existe
function checkAuth(req, res, next) {
    if (!req.cookies.hero_cpf || !req.cookies.hero_password) {
        return res.status(401).send("Não autenticado");
    }
    next();
}

app.post('/api/pegar/:pedidoId', checkAuth, async (req, res) => {
    try {
        await processOrder(req.params.pedidoId, req.cookies.hero_cpf, req.cookies.hero_password, 'vincularEntregador');
        res.send("OK");
    } catch (e) {
        if (e.message.includes('incorretas')) {
            res.clearCookie('hero_cpf');
            res.clearCookie('hero_password');
        }
        res.status(500).send(e.message);
    }
});

app.post('/api/devolver/:pedidoId', checkAuth, async (req, res) => {
    try {
        await processOrder(req.params.pedidoId, req.cookies.hero_cpf, req.cookies.hero_password, 'desvincularEntregador');
        res.send("OK");
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.get('/api/comprovante/:pedidoId', checkAuth, async (req, res) => {
    try {
        const html = await getReceiptHtml(req.params.pedidoId, req.cookies.hero_cpf, req.cookies.hero_password);
        res.send(html);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// ==========================================
// FUNÇÕES CORE (Engenharia Reversa Livewire)
// ==========================================

async function getClientAndLogin(cpf, password) {
    const jar = new CookieJar();
    const baseURL = process.env.HERO_BASE_URL || 'https://zecentral.herodelivery.com.br';
    const client = wrapper(axios.create({
        jar, withCredentials: true, baseURL,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' }
    }));

    const loginPage = await client.get('/login');
    const $login = cheerio.load(loginPage.data);
    const csrfToken = $login('meta[name="csrf-token"]').attr('content');

    const preLoginData = new URLSearchParams();
    preLoginData.append('_token', csrfToken);
    preLoginData.append('cpf', cpf);
    preLoginData.append('password', password);

    const preRes = await client.post('/set-function', preLoginData, { headers: { 'Referer': `${baseURL}/login` }});
    if (preRes.data.includes('As credenciais')) throw new Error('Credenciais incorretas.');

    const $pre = cheerio.load(preRes.data);
    const newToken = $pre('input[name="_token"]').attr('value') || csrfToken;

    const finalData = new URLSearchParams();
    finalData.append('_token', newToken);
    finalData.append('cpf', cpf);
    finalData.append('password', password);
    finalData.append('funcao', 'Entregador');

    const loginResponse = await client.post('/login', finalData, { headers: { 'Referer': `${baseURL}/set-function` }, maxRedirects: 5 });
    if (loginResponse.request.res.responseUrl && loginResponse.request.res.responseUrl.includes('/login')) {
        throw new Error('Login falhou na escolha de função.');
    }
    
    return { client, baseURL };
}

async function processOrder(pedidoId, cpf, password, actionType) {
    const { client, baseURL } = await getClientAndLogin(cpf, password);

    const painelPage = await client.get('/painel/entregador/pedidos');
    const $painel = cheerio.load(painelPage.data);
    
    const componentDiv = $painel('[wire\\:snapshot]');
    if (componentDiv.length === 0) throw new Error('Livewire não encontrado.');

    const snapshotRaw = componentDiv.attr('wire:snapshot');
    const newCsrfToken = $painel('meta[name="csrf-token"]').attr('content');
    
    const livewirePayload = {
        _token: newCsrfToken,
        components: [{
            snapshot: snapshotRaw,
            updates: {},
            calls: [{ path: "", method: actionType, params: [ parseInt(pedidoId, 10) ] }]
        }]
    };

    await client.post('/livewire/update', livewirePayload, {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Livewire': 'true', 'Referer': `${baseURL}/painel/entregador/pedidos` }
    });
}

async function getReceiptHtml(pedidoId, cpf, password) {
    const { client } = await getClientAndLogin(cpf, password);
    const previewUrl = `https://zecentral.herodelivery.com.br/pedidos/preview/${pedidoId}`;
    
    const res = await client.get(previewUrl);
    let html = res.data;
    html = html.replace(/window\.print\(\);/g, '');
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    return html;
}

app.listen(port, () => {
    console.log(`🚀 Central do Motoboy rodando na porta ${port}`);
});
