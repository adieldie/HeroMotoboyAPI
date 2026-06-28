const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ==========================================
// FRONTEND HÍBRIDO (PWA)
// ==========================================
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

// ==========================================
// API JSON BACKEND (MOTOBOY PRO MOTOR)
// ==========================================

// Autenticação (Teste de Credenciais Seguro)
app.post('/api/auth/test', async (req, res) => {
    const { cpf, password } = req.body;
    if (!cpf || !password) return res.status(400).send("Preencha tudo.");
    try {
        await getClientAndLogin(cpf, password);
        res.send("OK");
    } catch (error) {
        res.status(401).send("Credenciais inválidas.");
    }
});

// Middleware para verificar cabeçalhos (CORS-friendly)
function checkAuth(req, res, next) {
    const hero_cpf = req.headers['x-hero-cpf'];
    const hero_password = req.headers['x-hero-password'];
    if (!hero_cpf || !hero_password) {
        return res.status(401).send("Não autenticado");
    }
    req.hero_cpf = hero_cpf;
    req.hero_password = hero_password;
    next();
}

async function extractReceiptData(pedidoId, cpf, password, existingClient) {
    let total = "";
    let endereco = "";
    try {
        const html = await getReceiptHtml(pedidoId, cpf, password, existingClient);
        const cheerio = require('cheerio');
        const $ = cheerio.load(html);
        total = $('#payment-details-total strong').text().trim() || $('#payment-details-total span:last-child').text().trim();
        
        let rua = "";
        let bairro = "";
        $('span').each((i, el) => {
            const text = $(el).text().trim();
            if (text.includes('Endereço:') || text.includes('Endereo:')) rua = $(el).next().text().trim();
            if (text.includes('Bairro:')) bairro = $(el).next().text().trim();
        });
        if (rua && bairro) endereco = `${rua}, ${bairro}`;
        else if (rua) endereco = rua;
    } catch(e) {}
    return { total, endereco };
}

app.post('/api/pegar/:pedidoId', checkAuth, async (req, res) => {
    try {
        const client = await processOrder(req.params.pedidoId, req.hero_cpf, req.hero_password, 'vincularEntregador');
        const data = await extractReceiptData(req.params.pedidoId, req.hero_cpf, req.hero_password, client);
        res.json({ success: true, ...data });
    } catch (e) {
        let errorMsg = e.message;
        if (e.response && e.response.data) {
            errorMsg += ' - Detalhes: ' + (typeof e.response.data === 'string' ? e.response.data.substring(0, 200) : JSON.stringify(e.response.data));
        }
        res.status(500).send(errorMsg);
    }
});

app.post('/api/devolver/:pedidoId', checkAuth, async (req, res) => {
    try {
        await processOrder(req.params.pedidoId, req.hero_cpf, req.hero_password, 'desvincularEntregador');
        res.send("OK");
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.post('/api/finalizar/:pedidoId', checkAuth, async (req, res) => {
    try {
        await processOrder(req.params.pedidoId, req.hero_cpf, req.hero_password, 'marcarComoEntregue');
        res.send("OK");
    } catch (e) {
        let errorMsg = e.message;
        if (e.response && e.response.data) {
            errorMsg += ' - Detalhes: ' + (typeof e.response.data === 'string' ? e.response.data.substring(0, 200) : JSON.stringify(e.response.data));
        }
        res.status(500).send(errorMsg);
    }
});

app.get('/api/comprovante/:pedidoId', checkAuth, async (req, res) => {
    try {
        const html = await getReceiptHtml(req.params.pedidoId, req.hero_cpf, req.hero_password);
        res.send(html);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.get('/api/ativos', checkAuth, async (req, res) => {
    try {
        const { client } = await getClientAndLogin(req.hero_cpf, req.hero_password);
        const painelPage = await client.get('/painel/entregador/pedidos');
        
        const regex = /desvincularEntregador\\((\\d+)\\)/g;
        const matches = [...painelPage.data.matchAll(regex)];
        const ativos = matches.map(m => m[1]);
        
        const pedidosComData = [];
        for (const pedidoId of ativos) {
            const data = await extractReceiptData(pedidoId, req.hero_cpf, req.hero_password, client);
            pedidosComData.push({ id: pedidoId, ...data });
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        res.json({ success: true, pedidos: pedidosComData });
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
    if (preRes.data.includes('As credenciais') || preRes.data.includes('incorretas')) {
        throw new Error('Credenciais incorretas.');
    }

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
    require('fs').writeFileSync('painel_debug.html', painelPage.data);
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
        headers: { 
            'Content-Type': 'application/json', 
            'Accept': 'application/json', 
            'X-Livewire': 'true', 
            'X-CSRF-TOKEN': newCsrfToken,
            'Referer': `${baseURL}/painel/entregador/pedidos` 
        }
    });

    return client;
}

async function getReceiptHtml(pedidoId, cpf, password, existingClient) {
    let client;
    if (existingClient) {
        client = existingClient;
    } else {
        const result = await getClientAndLogin(cpf, password);
        client = result.client;
    }
    
    const previewUrl = `https://zecentral.herodelivery.com.br/pedidos/preview/${pedidoId}`;
    
    const res = await client.get(previewUrl);
    let html = res.data;
    html = html.replace(/window\.print\(\);/g, '');
    html = html.replace(/href="\//g, 'href="https://zecentral.herodelivery.com.br/');
    html = html.replace(/src="\//g, 'src="https://zecentral.herodelivery.com.br/');
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    const customCss = `<style>
        html { display: flex; justify-content: center; background: #f4f6f9 !important; width: 100%; height: 100%; }
        body { width: 250px !important; margin: 20px 0 !important; padding: 10px !important; background: #fff !important; color: #000 !important; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-radius: 8px; height: max-content !important; min-height: auto !important; }
        #print-container { width: 100% !important; margin: 0 !important; border: none !important; box-sizing: border-box; }
    </style>`;
    html = html.replace('</head>', customCss + '</head>');
    return html;
}

app.listen(port, () => {
    console.log(`🚀 API Híbrida do Motoboy rodando na porta ${port}`);
});
