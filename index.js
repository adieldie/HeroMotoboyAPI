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
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="theme-color" content="#121212">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <title>Motoboy Pro</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/html5-qrcode"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        :root { --bg: #121212; --card: #1e1e1e; --text: #e0e0e0; --accent: #2299dd; --success: #00d26a; --danger: #ff453a; }
        body { font-family: 'Inter', sans-serif; background-color: var(--bg); margin: 0; padding: 0; color: var(--text); -webkit-font-smoothing: antialiased; padding-bottom: 80px; }
        
        /* Glassmorphism Header */
        .header { position: sticky; top: 0; z-index: 100; background: rgba(30, 30, 30, 0.7); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255,255,255,0.05); padding: 20px 15px 15px; text-align: center; font-size: 18px; font-weight: 800; color: #fff; letter-spacing: 0.5px; }
        .header i { color: var(--accent); margin-right: 8px; }
        
        /* Scanner Section */
        .status-bar { text-align: center; padding: 15px; font-size: 14px; color: #aaa; font-weight: 600; }
        .scanner-wrapper { position: relative; width: 250px; height: 250px; margin: 10px auto; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 210, 106, 0.05), inset 0 0 0 1px rgba(255,255,255,0.1); background: #000; }
        .scanner-container { width: 100%; height: 100%; position: relative; z-index: 1; }
        #reader { width: 100%; height: 100%; }
        
        /* Laser Animation */
        .laser { position: absolute; top: 0; left: 0; width: 100%; height: 2px; background: var(--success); box-shadow: 0 0 15px 5px rgba(0, 210, 106, 0.5); z-index: 2; animation: scan 2.5s infinite linear; display: none; }
        @keyframes scan { 0% { top: 5%; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 95%; opacity: 0; } }
        
        /* Controls */
        .controls { display: flex; justify-content: center; margin-top: 20px; }
        .btn-toggle { background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.1); padding: 12px 24px; border-radius: 30px; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(5px); display: flex; align-items: center; gap: 8px; }
        .btn-toggle:active { transform: scale(0.95); background: rgba(255,255,255,0.2); }
        
        /* Manual Input */
        .manual-input { background: var(--card); border-radius: 20px; max-width: 320px; margin: 25px auto; padding: 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); }
        .manual-input p { font-size: 12px; color: #888; margin: 0 0 12px 0; font-weight: 800; text-align: center; text-transform: uppercase; letter-spacing: 1px; }
        .input-group { display: flex; gap: 10px; }
        .input-group input { flex: 1; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 12px 15px; border-radius: 12px; font-family: 'Inter', sans-serif; font-size: 15px; outline: none; transition: border 0.3s; }
        .input-group input:focus { border-color: var(--accent); }
        .input-group button { background: var(--accent); color: white; border: none; padding: 0 20px; border-radius: 12px; font-weight: 800; font-family: 'Inter', sans-serif; font-size: 14px; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 10px rgba(34, 153, 221, 0.3); }
        .input-group button:active { transform: scale(0.92); }
        
        /* Orders List */
        .orders-section { max-width: 500px; margin: 30px auto 0; padding: 0 20px; }
        .orders-title { font-size: 18px; font-weight: 800; margin-bottom: 15px; color: #fff; display: flex; justify-content: space-between; align-items: center; }
        .badge { background: var(--accent); color: white; font-size: 12px; padding: 4px 12px; border-radius: 20px; box-shadow: 0 2px 8px rgba(34, 153, 221, 0.3); }
        
        .order-card { background: var(--card); border-radius: 16px; padding: 18px; margin-bottom: 15px; box-shadow: 0 6px 16px rgba(0,0,0,0.2); border-left: 4px solid var(--success); display: flex; justify-content: space-between; align-items: center; opacity: 0; transform: translateY(20px); animation: fadeInUp 0.4s forwards cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        @keyframes fadeInUp { to { opacity: 1; transform: translateY(0); } }
        
        .order-info h3 { margin: 0 0 6px 0; font-size: 16px; font-weight: 800; color: #fff; }
        .order-info p { margin: 0; font-size: 13px; color: #aaa; display: flex; align-items: center; gap: 6px; font-weight: 600; }
        .order-info p i { color: var(--success); font-size: 11px; }
        
        .order-actions { display: flex; gap: 8px; }
        .order-actions button { border: none; width: 44px; height: 44px; border-radius: 12px; display: flex; justify-content: center; align-items: center; font-size: 16px; cursor: pointer; transition: all 0.2s; }
        .btn-view { background-color: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.05); }
        .btn-view:active { transform: scale(0.9); background-color: rgba(255,255,255,0.15); }
        .btn-return { background-color: rgba(255, 69, 58, 0.1); color: var(--danger); border: 1px solid rgba(255, 69, 58, 0.2); }
        .btn-return:active { transform: scale(0.9); background-color: var(--danger); color: white; }
        
        /* Modal & Toast */
        .toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-100px); background: var(--success); color: #000; padding: 14px 25px; border-radius: 30px; font-size: 14px; font-weight: 800; box-shadow: 0 10px 30px rgba(0, 210, 106, 0.3); z-index: 3000; transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); display: flex; align-items: center; gap: 8px; }
        .toast.show { transform: translateX(-50%) translateY(0); }
        
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 2000; justify-content: center; align-items: flex-end; }
        .modal-content { background: var(--card); width: 100%; height: 88vh; border-radius: 28px 28px 0 0; display: flex; flex-direction: column; overflow: hidden; animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 -10px 40px rgba(0,0,0,0.5); }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .modal-header { padding: 22px 25px; background: var(--card); display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 18px; color: #fff; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .modal-close { cursor: pointer; color: var(--text); background: rgba(255,255,255,0.1); width: 38px; height: 38px; display: flex; justify-content: center; align-items: center; border-radius: 50%; transition: all 0.2s; }
        .modal-close:active { transform: scale(0.9); }
        .modal-body { flex: 1; padding: 0; display: flex; justify-content: center; background: #000; }
        .receipt-frame { width: 100%; height: 100%; border: none; background: #fff; max-width: 500px; }
    </style>
</head>
<body>

    <div class="header">
        <i class="fas fa-bolt"></i> MOTOBOY PRO
    </div>
    
    <div class="status-bar" id="statusMsg">
        Aponte a câmera para o QR Code
    </div>

    <div class="scanner-wrapper" id="scannerWrapper">
        <div class="laser" id="laserLine"></div>
        <div class="scanner-container">
            <div id="reader"></div>
        </div>
    </div>
    
    <div class="controls">
        <button class="btn-toggle" onclick="toggleCamera()" id="btnToggleCam">
            <i class="fas fa-camera-slash"></i> Ocultar Câmera
        </button>
    </div>

    <div class="manual-input">
        <p>Procurar código manual</p>
        <div class="input-group">
            <input type="number" id="manualId" placeholder="Ex: 19476">
            <button onclick="simulateScan()">IR</button>
        </div>
    </div>

    <div class="orders-section">
        <div class="orders-title">Meus Pedidos <span class="badge" id="orderCount">0</span></div>
        <div id="ordersList"></div>
    </div>

    <div class="toast" id="toast"><i class="fas fa-check-circle"></i> <span id="toastMsg"></span></div>

    <div class="modal" id="receiptModal">
        <div class="modal-content">
            <div class="modal-header">
                <span id="modalTitle">Pedido #00000</span>
                <div class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></div>
            </div>
            <div class="modal-body" id="modalBody">
                <div style="padding: 30px; color: #fff; font-weight: 600;">Carregando comprovante...</div>
            </div>
        </div>
    </div>

    <script>
        const orders = new Set();
        let isProcessing = false;
        let cameraVisible = true;

        function showToast(msg) {
            const toast = document.getElementById('toast');
            document.getElementById('toastMsg').innerText = msg;
            toast.classList.add('show');
            setTimeout(() => { toast.classList.remove('show'); }, 3000);
        }

        function setStatus(msg, color = '#aaa') {
            const sb = document.getElementById('statusMsg');
            sb.innerText = msg;
            sb.style.color = color;
        }

        function toggleCamera() {
            const wrapper = document.getElementById('scannerWrapper');
            const btn = document.getElementById('btnToggleCam');
            const laser = document.getElementById('laserLine');
            
            if (cameraVisible) {
                wrapper.style.display = 'none';
                laser.style.display = 'none';
                btn.innerHTML = '<i class="fas fa-camera"></i> Mostrar Câmera';
                cameraVisible = false;
            } else {
                wrapper.style.display = 'block';
                laser.style.display = 'block';
                btn.innerHTML = '<i class="fas fa-camera-slash"></i> Ocultar Câmera';
                cameraVisible = true;
            }
        }

        async function processScan(url) {
            if (isProcessing) return;
            const match = url.match(/\\/(\\d+)$/);
            if (!match) return; 
            const pedidoId = match[1];
            if (orders.has(pedidoId)) return; 
            
            isProcessing = true;
            setStatus(\`Vinculando Pedido #\${pedidoId}...\`, '#2299dd');
            document.getElementById('laserLine').style.background = '#2299dd';
            document.getElementById('laserLine').style.boxShadow = '0 0 15px 5px rgba(34, 153, 221, 0.5)';
            
            try {
                const res = await fetch(\`/api/pegar/\${pedidoId}\`, { method: 'POST' });
                if (res.ok) {
                    orders.add(pedidoId);
                    addOrderCard(pedidoId);
                    showToast(\`Pedido #\${pedidoId} vinculado!\`);
                    setStatus('Aponte a câmera para o próximo pedido.', '#aaa');
                } else {
                    const txt = await res.text();
                    setStatus(\`Erro no #\${pedidoId}: \${txt}\`, 'var(--danger)');
                }
            } catch (e) {
                setStatus(\`Erro de conexão ao pegar #\${pedidoId}\`, 'var(--danger)');
            }
            
            document.getElementById('laserLine').style.background = 'var(--success)';
            document.getElementById('laserLine').style.boxShadow = '0 0 15px 5px rgba(0, 210, 106, 0.5)';
            setTimeout(() => { isProcessing = false; }, 2000); 
        }

        async function returnOrder(pedidoId) {
            if (!confirm(\`Tem certeza que deseja DEVOLVER o pedido #\${pedidoId}?\`)) return;
            setStatus(\`Devolvendo Pedido #\${pedidoId}...\`, 'var(--danger)');
            try {
                const res = await fetch(\`/api/devolver/\${pedidoId}\`, { method: 'POST' });
                if (res.ok) {
                    orders.delete(pedidoId);
                    
                    const card = document.getElementById(\`card-\${pedidoId}\`);
                    card.style.animation = 'none'; // reset
                    card.style.transition = 'all 0.3s';
                    card.style.transform = 'scale(0.9)';
                    card.style.opacity = '0';
                    
                    setTimeout(() => {
                        card.remove();
                        document.getElementById('orderCount').innerText = orders.size;
                        showToast(\`Pedido devolvido!\`);
                        setStatus('Aponte a câmera para ler QR Codes.', '#aaa');
                    }, 300);
                    
                } else {
                    const txt = await res.text();
                    setStatus(\`Erro ao devolver #\${pedidoId}: \${txt}\`, 'var(--danger)');
                }
            } catch (e) {
                setStatus(\`Erro de conexão ao devolver #\${pedidoId}\`, 'var(--danger)');
            }
        }

        async function viewReceipt(pedidoId) {
            const modal = document.getElementById('receiptModal');
            const title = document.getElementById('modalTitle');
            const body = document.getElementById('modalBody');
            
            title.innerText = \`Pedido #\${pedidoId}\`;
            body.innerHTML = '<div style="padding: 30px; color: #fff; font-weight: 600;">Buscando comprovante...</div>';
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
                    body.innerHTML = '<div style="padding: 30px; color: var(--danger); font-weight: 600;">Erro ao carregar detalhes do pedido.</div>';
                }
            } catch(e) {
                body.innerHTML = '<div style="padding: 30px; color: var(--danger); font-weight: 600;">Erro de conexão.</div>';
            }
        }

        function closeModal() { document.getElementById('receiptModal').style.display = 'none'; }

        function addOrderCard(pedidoId) {
            const list = document.getElementById('ordersList');
            const card = document.createElement('div');
            card.className = 'order-card';
            card.id = \`card-\${pedidoId}\`;
            card.innerHTML = \`
                <div class="order-info">
                    <h3>Pedido #\${pedidoId}</h3>
                    <p><i class="fas fa-check-circle"></i> Vinculado com sucesso</p>
                </div>
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
        const config = { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 };
        html5QrCode.start({ facingMode: "environment" }, config, (decodedText) => { processScan(decodedText); }).then(() => {
            document.getElementById('laserLine').style.display = 'block';
        }).catch(() => { 
            setStatus("Erro ao acessar a câmera.", "var(--danger)"); 
        });
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
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
            <meta name="theme-color" content="#121212">
            <meta name="apple-mobile-web-app-capable" content="yes">
            <title>Motoboy Pro - Login</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
            <style>
                body { font-family: 'Inter', sans-serif; background-color: #121212; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; color: #fff; -webkit-font-smoothing: antialiased; }
                .login-box { background: #1e1e1e; padding: 40px 30px; border-radius: 24px; box-shadow: 0 15px 35px rgba(0,0,0,0.5); width: 100%; max-width: 320px; text-align: center; border: 1px solid rgba(255,255,255,0.05); }
                .icon { font-size: 44px; color: #2299dd; margin-bottom: 15px; filter: drop-shadow(0 0 10px rgba(34,153,221,0.5)); }
                h2 { margin: 0 0 8px 0; font-size: 22px; font-weight: 800; }
                p { font-size: 13px; color: #aaa; margin-bottom: 30px; line-height: 1.5; font-weight: 600; }
                input { width: 100%; padding: 15px; margin-bottom: 15px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: #fff; border-radius: 12px; box-sizing: border-box; font-family: 'Inter', sans-serif; font-size: 15px; transition: 0.3s; outline: none; }
                input:focus { border-color: #2299dd; box-shadow: 0 0 0 2px rgba(34,153,221,0.2); }
                button { width: 100%; padding: 15px; background: linear-gradient(135deg, #2299dd, #1a7bb5); color: white; border: none; border-radius: 12px; font-weight: 800; font-family: 'Inter', sans-serif; font-size: 16px; cursor: pointer; transition: 0.2s; box-shadow: 0 6px 15px rgba(34, 153, 221, 0.3); margin-top: 5px; }
                button:active { transform: scale(0.95); box-shadow: 0 2px 8px rgba(34, 153, 221, 0.3); }
            </style>
        </head>
        <body>
            <div class="login-box">
                <div class="icon"><i class="fas fa-bolt"></i></div>
                <h2>MOTOBOY PRO</h2>
                <p>Acesse com seu CPF e senha da Hero uma única vez para ativar este aparelho.</p>
                <form action="/auth" method="POST">
                    <input type="text" name="cpf" placeholder="Seu CPF (ex: 000.000.000-00)" required>
                    <input type="password" name="password" placeholder="Sua Senha" required>
                    <button type="submit">Ativar Scanner</button>
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
        headers: { 
            'Content-Type': 'application/json', 
            'Accept': 'application/json', 
            'X-Livewire': 'true', 
            'X-CSRF-TOKEN': newCsrfToken,
            'Referer': `${baseURL}/painel/entregador/pedidos` 
        }
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
