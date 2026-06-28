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
const htmlApp = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Central do Motoboy</title>
    <script src="https://unpkg.com/html5-qrcode"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 0; color: #333; }
        .header { background-color: #2299dd; color: white; padding: 15px; text-align: center; font-size: 18px; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .scanner-container { width: 250px; height: 250px; margin: 20px auto; background: black; position: relative; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.15); }
        #reader { width: 100%; height: 100%; }
        .status-bar { text-align: center; padding: 10px; font-size: 14px; background: #fff; margin-bottom: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
        .orders-section { padding: 15px; max-width: 500px; margin: 0 auto; }
        .orders-title { font-size: 16px; font-weight: bold; margin-bottom: 10px; color: #555; }
        .order-card { background: white; border-radius: 8px; padding: 15px; margin-bottom: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center; border-left: 4px solid #28a745; }
        .order-info h3 { margin: 0 0 5px 0; font-size: 16px; color: #333; }
        .order-info p { margin: 0; font-size: 12px; color: #666; }
        .order-actions button { border: none; padding: 8px 12px; border-radius: 4px; font-weight: bold; cursor: pointer; margin-left: 5px; }
        .btn-view { background-color: #e9ecef; color: #333; }
        .btn-return { background-color: #dc3545; color: white; }
        
        .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: white; padding: 10px 20px; border-radius: 20px; font-size: 14px; display: none; z-index: 1000; }
        
        /* Modal do Comprovante */
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 2000; justify-content: center; align-items: flex-end; }
        .modal-content { background: #f4f6f9; width: 100%; height: 85vh; border-radius: 16px 16px 0 0; display: flex; flex-direction: column; overflow: hidden; animation: slideUp 0.3s ease-out; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .modal-header { padding: 15px 20px; background: white; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 16px; }
        .modal-close { cursor: pointer; color: #dc3545; font-size: 22px; padding: 5px; }
        .modal-body { flex: 1; padding: 0; display: flex; justify-content: center; background: #e9ecef; }
        .receipt-frame { width: 100%; height: 100%; border: none; background: white; max-width: 400px; box-shadow: 0 0 15px rgba(0,0,0,0.1); }
    </style>
</head>
<body>

    <div class="header">
        <i class="fas fa-motorcycle"></i> Central do Motoboy
    </div>
    
    <div class="status-bar" id="statusMsg">
        Aponte a câmera para o QR Code do pedido.
    </div>

    <div class="scanner-container">
        <div id="reader"></div>
    </div>

    <div style="padding: 15px; text-align: center; background: #fff; border-radius: 8px; max-width: 300px; margin: 15px auto; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
        <p style="font-size: 13px; color: #555; margin: 0 0 10px 0; font-weight: bold;">Procurar pedido pelo código</p>
        <div style="display: flex; justify-content: center; gap: 8px;">
            <input type="number" id="manualId" placeholder="Ex: 19476" style="width: 120px; padding: 10px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px;">
            <button onclick="simulateScan()" style="padding: 10px 15px; background: #28a745; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">Procurar</button>
        </div>
    </div>

    <div class="orders-section">
        <div class="orders-title">Meus Pedidos Escaneados (<span id="orderCount">0</span>)</div>
        <div id="ordersList">
        </div>
    </div>

    <div class="toast" id="toast">Aviso aqui</div>

    <div class="modal" id="receiptModal">
        <div class="modal-content">
            <div class="modal-header">
                <span id="modalTitle">Pedido #00000</span>
                <i class="fas fa-times modal-close" onclick="closeModal()"></i>
            </div>
            <div class="modal-body" id="modalBody">
                Carregando...
            </div>
        </div>
    </div>

    <script>
        const orders = new Set();
        let isProcessing = false;

        function showToast(msg) {
            const toast = document.getElementById('toast');
            toast.innerText = msg;
            toast.style.display = 'block';
            setTimeout(() => { toast.style.display = 'none'; }, 3000);
        }

        function setStatus(msg, color = '#333') {
            const sb = document.getElementById('statusMsg');
            sb.innerText = msg;
            sb.style.color = color;
        }

        async function processScan(url) {
            if (isProcessing) return;
            const match = url.match(/\\/(\\d+)$/);
            if (!match) return; 
            const pedidoId = match[1];
            if (orders.has(pedidoId)) return; 
            
            isProcessing = true;
            setStatus(\`Vinculando Pedido #\${pedidoId}...\`, '#2299dd');
            
            try {
                const res = await fetch(\`/api/pegar/\${pedidoId}\`, { method: 'POST' });
                if (res.ok) {
                    orders.add(pedidoId);
                    addOrderCard(pedidoId);
                    showToast(\`Pedido #\${pedidoId} vinculado!\`);
                    setStatus('Aponte a câmera para o próximo pedido.', '#28a745');
                } else {
                    const txt = await res.text();
                    setStatus(\`Erro no #\${pedidoId}: \${txt}\`, '#dc3545');
                }
            } catch (e) {
                setStatus(\`Erro de conexão ao pegar #\${pedidoId}\`, '#dc3545');
            }
            setTimeout(() => { isProcessing = false; }, 2000); 
        }

        async function returnOrder(pedidoId) {
            if (!confirm(\`Tem certeza que deseja DEVOLVER o pedido #\${pedidoId}?\`)) return;
            setStatus(\`Devolvendo Pedido #\${pedidoId}...\`, '#dc3545');
            try {
                const res = await fetch(\`/api/devolver/\${pedidoId}\`, { method: 'POST' });
                if (res.ok) {
                    orders.delete(pedidoId);
                    document.getElementById(\`card-\${pedidoId}\`).remove();
                    document.getElementById('orderCount').innerText = orders.size;
                    showToast(\`Pedido #\${pedidoId} devolvido!\`);
                    setStatus('Aponte a câmera para ler QR Codes.', '#333');
                } else {
                    const txt = await res.text();
                    setStatus(\`Erro ao devolver #\${pedidoId}: \${txt}\`, '#dc3545');
                }
            } catch (e) {
                setStatus(\`Erro de conexão ao devolver #\${pedidoId}\`, '#dc3545');
            }
        }

        async function viewReceipt(pedidoId) {
            const modal = document.getElementById('receiptModal');
            const title = document.getElementById('modalTitle');
            const body = document.getElementById('modalBody');
            
            title.innerText = \`Pedido #\${pedidoId}\`;
            body.innerHTML = '<div style="padding: 20px;">Buscando comprovante...</div>';
            modal.style.display = 'flex';
            
            try {
                const res = await fetch(\`/api/comprovante/\${pedidoId}\`);
                if (res.ok) {
                    const html = await res.text();
                    body.innerHTML = \`<iframe class="receipt-frame" id="receiptIframe"></iframe>\`;
                    const iframeDoc = document.getElementById('receiptIframe').contentWindow.document;
                    iframeDoc.open();
                    iframeDoc.write(html);
                    iframeDoc.close();
                } else {
                    body.innerHTML = '<div style="padding: 20px; color: red;">Erro ao carregar detalhes do pedido.</div>';
                }
            } catch(e) {
                body.innerHTML = '<div style="padding: 20px; color: red;">Erro de conexão.</div>';
            }
        }

        function closeModal() { document.getElementById('receiptModal').style.display = 'none'; }

        function addOrderCard(pedidoId) {
            const list = document.getElementById('ordersList');
            const card = document.createElement('div');
            card.className = 'order-card';
            card.id = \`card-\${pedidoId}\`;
            card.innerHTML = \`
                <div class="order-info"><h3>Pedido #\${pedidoId}</h3><p>Vinculado com sucesso</p></div>
                <div class="order-actions">
                    <button class="btn-view" onclick="viewReceipt('\${pedidoId}')"><i class="fas fa-eye"></i></button>
                    <button class="btn-return" onclick="returnOrder('\${pedidoId}')"><i class="fas fa-undo"></i></button>
                </div>\`;
            list.prepend(card);
            document.getElementById('orderCount').innerText = orders.size;
        }

        function simulateScan() {
            const input = document.getElementById('manualId').value;
            if (input) {
                processScan(\`https://localhost/pegar/\${input}\`);
                document.getElementById('manualId').value = '';
            }
        }
        
        const html5QrCode = new Html5Qrcode("reader");
        const config = { fps: 10, qrbox: { width: 180, height: 180 }, aspectRatio: 1.0 };
        html5QrCode.start({ facingMode: "environment" }, config, (decodedText) => { processScan(decodedText); }).catch(() => { setStatus("Erro ao acessar a câmera.", "#dc3545"); });
    </script>
</body>
</html>
`;

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

    res.send(htmlApp);
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
