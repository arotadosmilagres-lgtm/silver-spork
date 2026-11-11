// Content — servidor local. Sem dependências: precisa só do Node 18+.
// Rode com: node server.js  → abra http://localhost:3000
const _log = (m) => { try { require('fs').appendFileSync(require('path').join(process.pkg ? require('path').dirname(process.execPath) : __dirname, 'erro.txt'), new Date().toISOString() + ' ' + m + '\n'); } catch (e) {} };
const _die = (m) => { console.log('\nERRO: ' + m + '\n\nEsta janela fica aberta por 5 minutos para você ler. Um arquivo erro.txt foi salvo ao lado do programa.'); _log(m); setTimeout(() => process.exit(1), 300000); };
process.on('uncaughtException', (e) => _die(e && e.stack || String(e)));
process.on('unhandledRejection', (e) => _log('rejection: ' + (e && e.stack || e)));
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const VERSION = '2.0.0';
const UPDATE_BASE = process.env.CONTENT_UPDATE_URL || 'https://raw.githubusercontent.com/arotadosmilagres-lgtm/silver-spork/content-app/';
const PORT = process.env.PORT || 3000;
const newer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
// Baixa a versão nova do GitHub, confere se os arquivos estão inteiros e só então troca.
async function fetchUpdate() {
  const r = await fetch(UPDATE_BASE + 'versao.json?t=' + Date.now(), { signal: AbortSignal.timeout(8000) }).catch(() => { throw new Error('sem internet ou o GitHub não respondeu'); });
  if (!r.ok) throw new Error('Não consegui ver se há versão nova (' + r.status + ').');
  const info = await r.json();
  if (!info.version || !Array.isArray(info.files)) throw new Error('Informação de versão inválida.');
  return info;
}
async function applyUpdate(info) {
  const got = {};
  for (const f of info.files) {
    if (!/^[a-zA-Z0-9_\-./]+$/.test(f) || f.includes('..')) throw new Error('Arquivo de atualização inválido: ' + f);
    const r = await fetch(UPDATE_BASE + f + '?v=' + info.version, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error('Não consegui baixar ' + f + ' (' + r.status + ').');
    got[f] = await r.text();
    if (f.endsWith('.js')) new (require('vm').Script)('(function (exports, require, module, __filename, __dirname) {' + got[f] + '\n})', { filename: f });
    if (f.endsWith('.html') && !got[f].includes('</html>')) throw new Error('O arquivo ' + f + ' veio incompleto.');
  }
  for (const [f, txt] of Object.entries(got)) {
    const dest = path.join(__dirname, f); fs.mkdirSync(path.dirname(dest), { recursive: true });
    try { fs.copyFileSync(dest, dest + '.anterior'); } catch {}
    fs.writeFileSync(dest + '.novo', txt); fs.renameSync(dest + '.novo', dest);
  }
  try { const dd = process.env.CONTENT_DATA || path.join(os.homedir(), 'Content', 'data'); fs.mkdirSync(dd, { recursive: true }); fs.writeFileSync(path.join(dd, 'atualizado.json'), JSON.stringify({ from: VERSION, to: info.version, notes: info.notes || '', at: Date.now() })); } catch {}
}
// O processo principal só vigia: procura atualização, inicia o app e reinicia quando ele pede.
if (!process.env.CONTENT_CHILD && !process.pkg) {
  (async () => {
    try { const info = await fetchUpdate(); if (newer(info.version, VERSION)) { console.log('Atualizando o Content para a versão ' + info.version + '...'); await applyUpdate(info); console.log('Atualizado!'); } } catch (e) { console.log('(Sem atualização agora: ' + e.message + ')'); }
    let first = true;
    const start = () => {
      const ch = require('child_process').spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: 'inherit', env: { ...process.env, CONTENT_CHILD: '1', CONTENT_FIRST: first ? '1' : '' } });
      first = false;
      ch.on('exit', (code) => { if (code === 75) { console.log('Reiniciando o Content...'); setTimeout(start, 500); } else process.exit(code || 0); });
    };
    start();
  })();
  return;
}
const openBrowser = () => { if (!process.env.CONTENT_FIRST && process.env.CONTENT_CHILD) return;  try { const u = `http://localhost:${PORT}`, c = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', u]] : process.platform === 'darwin' ? ['open', [u]] : ['xdg-open', [u]]; require('child_process').spawn(c[0], c[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch (e) {} };
// Os dados ficam SEMPRE na mesma pasta (C:\\Users\\<você>\\Content\\data), não importa de onde o app foi aberto.
const DATA = process.env.CONTENT_DATA || path.join(os.homedir(), 'Content', 'data');
const DB = path.join(DATA, 'db.json');
fs.mkdirSync(DATA, { recursive: true });
// Primeira vez nesta pasta: traz os dados de uma instalação antiga, se houver uma.
if (!fs.existsSync(DB)) {
  const found = [];
  const look = (dir, depth) => {
    let list; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      if (!e.isDirectory() || /^(node_modules|\.|AppData|Windows|Program)/i.test(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.name === 'data' && p !== DATA) { try { const st = fs.statSync(path.join(p, 'db.json')); found.push({ p, t: st.mtimeMs }); } catch {} }
      else if (depth > 0) look(p, depth - 1);
    }
  };
  look(__dirname, 0);
  for (const d of ['Downloads', 'Desktop', 'Documents', 'Área de Trabalho', 'Documentos', 'OneDrive']) look(path.join(os.homedir(), d), 4);
  found.sort((a, b) => b.t - a.t);
  if (found[0]) { try { fs.cpSync(found[0].p, DATA, { recursive: true }); console.log('Recuperei seus dados de: ' + found[0].p); } catch (e) { console.log('Não consegui copiar dados antigos: ' + e.message); } }
}
// Backup automático diário (guarda os últimos 30 dias).
const BKDIR = path.join(DATA, 'backups');
const autoBackup = (tag) => {
  try {
    if (!fs.existsSync(DB)) return; fs.mkdirSync(BKDIR, { recursive: true });
    const f = path.join(BKDIR, 'db-' + new Date().toISOString().slice(0, 10) + (tag ? '-' + tag : '') + '.json');
    if (tag || !fs.existsSync(f)) fs.copyFileSync(DB, f);
    const all = fs.readdirSync(BKDIR).filter((x) => x.startsWith('db-')).sort(); while (all.length > 30) fs.unlinkSync(path.join(BKDIR, all.shift()));
  } catch (e) { _log('backup: ' + e.message); }
};
autoBackup(); setInterval(() => autoBackup(), 6 * 3600e3);

const DEFAULT = {
  settings: {
    provider: 'gemini',
    keys: { anthropic: '', gemini: '', groq: '', openrouter: '', xai: '', agnes: '' },
    imageProvider: 'gemini',
    limits: { maxTexts: 0, maxImages: 0 },
    models: { claude: 'claude-sonnet-5-5', image: 'gemini-2.5-flash-image', agnesImage: 'agnes-image-2.1-flash', agnesSize: '2K', gemini: 'gemini-flash-latest', groq: 'openai/gpt-oss-120b', openrouter: 'meta-llama/llama-3.3-70b-instruct:free', xai: 'grok-4-1-fast' },
    profile: {
      who: 'Advogada trabalhista há 12 anos, atendendo trabalhadores e pequenas empresas.',
      audience: 'Trabalhadores CLT com dúvidas sobre demissão, férias e horas extras.',
      positioning: 'Direito do trabalho sem juridiquês: o trabalhador precisa entender o que é dele.',
      tone: 'Direto, acolhedor, sem termos difíceis',
      phrases: 'na prática; olha só',
      topics: 'demissão, FGTS, férias, horas extras',
      blocked: 'política partidária, futebol, BBB, eleição',
    },
  },
  ideas: [],
};
const load = () => {
  let d; try { d = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { d = {}; }
  const def = structuredClone(DEFAULT), st = d.settings || {};
  d.settings = { ...def.settings, ...st, keys: { ...def.settings.keys, ...(st.keys || {}) }, models: { ...def.settings.models, ...(st.models || {}) }, profile: { ...def.settings.profile, ...(st.profile || {}) } };
  if (!d.clients) d.clients = [{ id: 'c1', name: 'Cliente 1', profile: { ...d.settings.profile }, ideas: d.ideas || [] }];
  d.clients.forEach((c) => { c.styles = c.styles || []; c.scripts = c.scripts || []; c.ideas = c.ideas || []; c.profile = c.profile || {}; });
  if (!d.clients.some((c) => c.id === d.active)) d.active = d.clients[0].id;
  delete d.ideas;
  return d;
};
const save = (d) => { fs.writeFileSync(DB + '.tmp', JSON.stringify(d, null, 1)); fs.renameSync(DB + '.tmp', DB); };
const CDIR = path.join(DATA, 'carousels');
fs.mkdirSync(CDIR, { recursive: true });
const cid = (x) => String(x || '').replace(/[^a-zA-Z0-9]/g, '');
function bump(db, kind) {
  const d = new Date().toISOString().slice(0, 10), m = d.slice(0, 7);
  const u = (db.usage = db.usage && db.usage.day === d ? db.usage : { ...(db.usage || {}), day: d, texts: 0, images: 0 });
  if (u.month !== m) { u.month = m; u.mTexts = 0; u.mImages = 0; }
  const mx = +(db.settings.limits || {})[kind === 'texts' ? 'maxTexts' : 'maxImages'] || 0;
  if (mx && u[kind] >= mx) throw new Error(`Limite diário de ${kind === 'texts' ? 'textos' : 'imagens'} atingido (${mx}). Aumente em Configurações → Custos e limites.`);
  u[kind]++; const mk = kind === 'texts' ? 'mTexts' : 'mImages'; u[mk] = (u[mk] || 0) + 1; save(db);
}
async function agnesImage(key, models, prompt, refs = []) {
  const tier = /^[1-4]K$/i.test(models.agnesSize || '') ? models.agnesSize.toUpperCase() : '2K';
  let r, j;
  try {
    r = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: models.agnesImage || 'agnes-image-2.1-flash', prompt: prompt + ' Vertical composition, no text, no letters.', size: tier, ratio: '3:4', extra_body: { response_format: 'url', ...(refs.length ? { image: refs } : {}) } }),
      signal: AbortSignal.timeout(240000),
    });
  } catch (e) { throw new Error('Não consegui falar com a Agnes: ' + (e.name === 'TimeoutError' ? 'demorou demais.' : e.message)); }
  const raw = await r.text(); try { j = JSON.parse(raw); } catch { j = {}; }
  if (!r.ok) {
    const m = (typeof j.error === 'string' ? j.error : j.error?.message) || j.message || j.detail || raw.slice(0, 200);
    throw new Error(`Agnes respondeu ${r.status}: ${m || 'sem detalhes'}${r.status === 401 || r.status === 403 ? ' (confira a chave da Agnes)' : ''}`);
  }
  const item = j.data?.[0] || {};
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  const url = item.url || j.url;
  if (!url || !/^https:\/\//.test(url)) throw new Error('A Agnes respondeu, mas sem imagem: ' + raw.slice(0, 200));
  const img = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!img.ok) throw new Error('Não consegui baixar a imagem da Agnes (' + img.status + ').');
  return `data:${img.headers.get('content-type') || 'image/png'};base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}`;
}
const IMG_STYLES = {
  photo: 'Photorealistic cinematic photograph, natural lighting, shallow depth of field.',
  illustration: 'Hand-drawn flat illustration in a cartoon style with clean outlines and a cohesive color palette. Not photorealistic, no real people, no photographs.',
  '3d': 'Stylized 3D render with soft lighting and smooth materials, original character design, not photorealistic.',
  minimal: 'Minimalist flat vector graphic with simple geometric shapes and a limited color palette, not photorealistic.',
  watercolor: 'Soft watercolor painting with gentle textures and visible brush strokes, not photorealistic.',
  none: '',
};
const okRefs = (a) => (Array.isArray(a) ? a : []).filter((x) => typeof x === 'string' && /^data:image\/(png|jpe?g|webp);base64,/.test(x)).slice(0, 3);
const PEOPLE_DEFAULT = 'Brazilian people, with the natural diverse mix of skin tones and features found in Brazil';
const REF_TXT = { character: 'Use the attached reference image(s) to keep the same character design and visual style.', style: 'The attached images are ONLY a loose mood and color reference. Create a completely NEW and different scene from the description above. Do NOT copy or reproduce any text, words, letters, logos, phones, screens, layout, people or objects from them. The final image must contain no text at all.' };
const composeImage = (b, db) => [(b.wide ? 'Composition: ONE single hero object only, centered and FULLY visible (never cropped), occupying only about the central 45% of the frame, with very large empty margins on all four sides, on a clean uncluttered background. The image will be cropped to a wide strip, so keep everything important in the exact middle. ' : 'Composition: ONE single hero object only, centered, large, on a clean uncluttered background that fits the visual style, with generous empty negative space around it so a headline can be placed over it.') + ' No clutter, no floating random shapes, no people unless essential. The hero object represents this idea: ' + b.prompt + '.', IMG_STYLES[b.style] ?? IMG_STYLES.photo, b.look ? `Render the subject above in this visual style (style only, do not add unrelated objects): ${String(b.look).slice(0, 700)}` : '', b.character ? `Recurring character to include: ${String(b.character).slice(0, 400)}.` : '', `If any people appear in the image, they are: ${String((db && cur(db).profile.people) || PEOPLE_DEFAULT).slice(0, 200)}.`, okRefs(b.refs).length ? (REF_TXT[b.refsKind] || REF_TXT.style) : ''].filter(Boolean).join(' ');
const okAssets = (a) => (Array.isArray(a) ? a : []).filter((x) => x && typeof x.src === 'string' && /^data:image\/(png|jpe?g|webp|svg\+xml);base64,/.test(x.src)).slice(0, 12).map((x) => ({ name: String(x.name || 'Elemento').slice(0, 40), src: x.src }));
const cur = (db) => db.clients.find((c) => c.id === db.active) || db.clients[0];
const mask = (k) => (k ? '••••' + k.slice(-4) : '');

const OPENAI_LIKE = { groq: 'https://api.groq.com/openai/v1', openrouter: 'https://openrouter.ai/api/v1', xai: 'https://api.x.ai/v1' };
const NOMES = { anthropic: 'Anthropic (Claude)', gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter', xai: 'Grok (xAI)' };

// Tenta o provedor escolhido; se ele estiver sobrecarregado ou sem cota, tenta sozinho os outros que têm chave.
const busyErr = (status, msg) => { const e = new Error(msg); e.retry = [408, 429, 500, 502, 503, 504, 529].includes(status) || /overload|high demand|quota|rate.?limit|unavailable|capacity|try again/i.test(msg); return e; };
async function claude(db, system, user, max = 4000, images = []) {
  const { keys, provider } = db.settings;
  const vision = (p) => p === 'anthropic' || p === 'gemini';
  if (!keys[provider]) throw new Error(`Cadastre a chave de ${NOMES[provider]} em Configurações → Conta e chaves.`);
  if (images.length && !vision(provider) && !['anthropic', 'gemini'].some((p) => keys[p])) throw new Error('Para estudar prints, escolha Gemini ou Claude em Configurações → Quem escreve os textos.');
  bump(db, 'texts');
  const order = [provider, ...Object.keys(NOMES).filter((p) => p !== provider && keys[p])].filter((p) => !images.length || vision(p));
  let last;
  for (const p of order) {
    try { const out = await callAI(db, p, system, user, max, images); if (p !== provider) out._via = NOMES[p]; return out; }
    catch (e) { last = e; if (!e.retry && !(e.cause && e.cause.code)) throw e; _log(`${p} falhou, tentando outro: ${e.message}`); }
  }
  throw new Error((last?.message || 'Erro na IA') + (order.length > 1 ? ' (tentei também os outros provedores com chave, e nenhum respondeu)' : ' — dica: cadastre a chave de um segundo provedor (Groq é grátis) e o Content troca sozinho quando um estiver ocupado.'));
}
async function callAI(db, provider, system, user, max, images) {
  const { keys, models } = db.settings, key = keys[provider];
  const im = images.map((u) => { const m = /^data:([^;]+);base64,(.+)$/.exec(u); if (!m) throw new Error('Imagem inválida.'); return { mime: m[1], data: m[2] }; });
  let text;
  if (provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: models.claude, max_tokens: max, system, messages: [{ role: 'user', content: im.length ? [...im.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.data } })), { type: 'text', text: user }] : user }] }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw busyErr(r.status, j.error?.message || 'Erro na API da Anthropic');
    text = j.content.map((c) => c.text || '').join('');
  } else if (provider === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${models.gemini}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [...im.map((i) => ({ inlineData: { mimeType: i.mime, data: i.data } })), { text: user }] }], generationConfig: { maxOutputTokens: max * 2, responseMimeType: 'application/json' } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw busyErr(r.status, 'Gemini: ' + (j.error?.message || 'erro na API'));
    text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  } else {
    const r = await fetch(OPENAI_LIKE[provider] + '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: models[provider], max_tokens: max, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw busyErr(r.status, `${NOMES[provider]}: ` + (j.error?.message || 'erro na API'));
    text = j.choices?.[0]?.message?.content || '';
  }
  const a = text.indexOf('{'), z = text.lastIndexOf('}');
  if (a < 0) throw new Error('A IA não devolveu um resultado válido. Tente de novo ou troque o modelo.');
  try { return JSON.parse(text.slice(a, z + 1)); } catch { throw new Error('A IA devolveu um texto cortado. Tente de novo.'); }
}

const profileText = (p) =>
  `Quem sou: ${p.who}\nPúblico: ${p.audience}\nPosicionamento: ${p.positioning}\nNível do público: ${p.level || 'Iniciante'}\nTom de voz: ${p.tone}\nExpressões que uso: ${p.phrases}\nTemas: ${p.topics}\nNunca abordar: ${p.blocked}`;


// ---------- Radar: notícias dos temas monitorados viram ideias ----------
const csv = (t) => String(t || '').split(',').map((x) => x.trim()).filter(Boolean);
const decode = (t) => t.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const g = (t) => { const r = m[1].match(new RegExp('<' + t + '[^>]*>([\\s\\S]*?)</' + t + '>')); return r ? decode(r[1]) : ''; };
    return { title: g('title'), link: g('link'), date: g('pubDate'), source: g('source') };
  }).filter((i) => /^https?:\/\//.test(i.link));
}
async function getFeed(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('Fonte respondeu ' + r.status);
  return parseRss(await r.text());
}
const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:7d')}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
async function radarRun(db, c) {
  const p = c.profile, block = csv(p.radarblock || p.blocked).map((x) => x.toLowerCase());
  const urls = [...csv(p.radar || p.topics).map(gnews), ...String(p.feeds || '').split('\n').map((x) => x.trim()).filter(Boolean)];
  if (!urls.length) throw new Error('Cadastre os temas monitorados ou fontes em Configurações → Perfil do cliente.');
  let items = [], erro = '';
  for (const u of urls) { try { items.push(...(await getFeed(u)).slice(0, 6)); } catch (e) { erro = e.message; } }
  const seen = new Set();
  items = items.filter((i) => i.title && !seen.has(i.title) && seen.add(i.title) && !block.some((b) => i.title.toLowerCase().includes(b))).slice(0, 30);
  if (!items.length) throw new Error('Não encontrei notícias novas.' + (erro ? ' (' + erro + ')' : ''));
  const out = await claude(db, 'Você é estrategista de conteúdo para Instagram. Responda SOMENTE com JSON válido.',
    `${profileText(p)}\n\nNotícias recentes:\n${items.map((i, n) => `${n + 1}. ${i.title} (${i.source})`).join('\n')}\n\nEscolha as melhores para este perfil e crie até 6 ideias de conteúdo. Dê nota de 0 a 100 pelo potencial de engajamento e relevância para o público.\nFormato: {"ideas":[{"title":"","hook":"","format":"Carrossel|Reel","score":0,"n":número da notícia}]}`, 3000);
  const have = new Set(c.ideas.map((x) => x.title)); let added = 0;
  for (const x of out.ideas || []) {
    if (!x.title || have.has(x.title)) continue;
    c.ideas.unshift({ title: x.title, hook: x.hook || '', format: x.format || 'Carrossel', score: Math.max(0, Math.min(100, +x.score || 0)), origin: 'Radar', link: items[(x.n || 0) - 1]?.link || '' }); added++;
  }
  c.radar = { last: Date.now(), items: items.slice(0, 20), msg: `${added} ideias novas` }; save(db);
  return added;
}
setInterval(async () => {
  const db = load();
  for (const c of db.clients) {
    const h = +c.profile.auto; if (!h || Date.now() - (c.radar?.last || 0) < h * 3600e3) continue;
    try { await radarRun(db, c); } catch (e) { c.radar = { ...(c.radar || {}), last: Date.now(), msg: e.message }; save(db); }
  }
}, 10 * 60 * 1000);

const ENUM = (x, a, d) => (a.includes(x) ? x : d);
const lay = (l) => ({ pos: ENUM(l?.text_pos, ['top', 'middle', 'bottom'], 'bottom'), align: ENUM(l?.align, ['left', 'center', 'right'], 'left'), size: ENUM(l?.title_size, ['s', 'm', 'l', 'xl', 'xxl'], 'l'), img: ENUM(l?.image, ['full', 'top', 'bottom', 'none'], 'full'), decor: ENUM(l?.decor, ['bar', 'none', 'frame', 'circle', 'glow'], 'bar') });
async function analyzeStyle(db, images, note) {
  const L = '{"text_pos":"top|middle|bottom (onde fica o bloco de texto)","align":"left|center|right","title_size":"s|m|l|xl|xxl (xxl = título gigante que ocupa boa parte do slide; xl = muito grande; escolha pelo tamanho real nos prints)","image":"full (imagem ocupa o slide todo, texto por cima) | top (imagem na metade de cima, texto embaixo) | bottom (imagem embaixo, texto em cima) | none (SOMENTE se o slide é puramente tipográfico, sem foto, sem ilustração, sem objeto 3D e sem orbes; objetos 3D, formas de vidro e brilhos contam como imagem, então use full)","decor":"bar (barrinha de destaque) | frame (moldura fina) | circle (círculo chapado de cor) | glow (brilho difuso e desfocado de cor, como luz neon) | none"}';
  const g = await claude(db, 'Você é diretor de arte. Analise os prints de carrosséis de Instagram e extraia o estilo visual completo: cores, tipografia, DIAGRAMAÇÃO e o visual das imagens. Responda SOMENTE com JSON válido.',
    `Observação do usuário: ${note || 'nenhuma'}\nFormato: {"dark":true se o fundo predominante é escuro (senão false),"bg":["#hex","#hex"] (as duas cores principais do fundo, usadas em gradiente),"text":"#hex" (cor principal do texto),"accent":"#hex" (cor de destaque),"heading_font":"sans" (sem serifa comum) | "serif" (com serifa) | "display" (condensada pesada, estilo cartaz, tipo Anton ou Bebas, comum em títulos gigantes) | "grotesk" (grotesca geométrica moderna, tipo Space Grotesk),"heading_weight":"400" ou "600" ou "800","title_caps":true se os títulos dos prints estão em CAIXA ALTA (senão false),"description":"duas frases em português descrevendo layout, tipografia e clima","image_style":"photo" se as imagens são fotos, "illustration" se são desenhos ou cartoon, "3d" se são renders 3D, "minimal" se são formas vetoriais simples, "watercolor" se são aquarela,"image_look":"descrição detalhada em inglês (40 a 70 palavras) de COMO são as imagens dos prints: meio (foto, ilustração, 3D), iluminação, textura, paleta, enquadramento, nível de detalhe, traço do desenho. Não mencione texto nem layout","layouts":{"cover":${L},"content":${L},"cta":${L}} (descreva a diagramação da capa, dos slides do meio e do último slide, como aparecem nos prints),"characters":"descrição curta em inglês de personagens ou mascotes que se repetem nos prints (aparência, roupas, estilo de desenho), ou string vazia se não houver"}`, 3000, images);
  g.dark = !!g.dark; g.bg = [hex(g.bg?.[0], '#0b1020'), hex(g.bg?.[1], '#1a2a6c')]; g.text = hex(g.text, g.dark ? '#ffffff' : '#1c1b19'); g.accent = hex(g.accent, '#3d6bff');
  g.heading_font = ENUM(g.heading_font, ['sans', 'serif', 'display', 'grotesk'], 'sans'); g.heading_weight = ENUM(String(g.heading_weight), ['400', '600', '800'], '600'); g.title_caps = !!g.title_caps; g.description = String(g.description || '');
  g.image_style = Object.keys(IMG_STYLES).includes(g.image_style) && g.image_style !== 'none' ? g.image_style : 'photo'; g.characters = String(g.characters || '').slice(0, 400); g.image_look = String(g.image_look || '').slice(0, 700);
  g.layouts = { cover: lay(g.layouts?.cover), content: lay(g.layouts?.content), cta: lay(g.layouts?.cta) };
  return g;
}
const hex = (x, d) => (/^#[0-9a-f]{6}$/i.test(x) ? x : d);
const routes = {
  'GET /api/settings': (db) => {
    const s = db.settings;
    const d = new Date().toISOString().slice(0, 10), u = db.usage || {};
    const usage = { texts: u.day === d ? u.texts : 0, images: u.day === d ? u.images : 0, mTexts: u.month === d.slice(0, 7) ? u.mTexts || 0 : 0, mImages: u.month === d.slice(0, 7) ? u.mImages || 0 : 0 };
    return { version: VERSION, dataDir: DATA, limits: s.limits, usage, imageProvider: s.imageProvider, provider: s.provider, keys: Object.fromEntries(Object.keys(s.keys).map((k) => [k, mask(s.keys[k])])), models: s.models, profile: cur(db).profile, name: cur(db).name, active: cur(db).id, clients: db.clients.map((c) => ({ id: c.id, name: c.name })) };
  },
  'POST /api/settings': (db, body) => {
    for (const k of Object.keys(db.settings.keys)) if (body.keys?.[k]) db.settings.keys[k] = body.keys[k].trim();
    if (body.provider) db.settings.provider = body.provider;
    if (body.imageProvider) db.settings.imageProvider = body.imageProvider;
    if (body.limits) db.settings.limits = { maxTexts: Math.max(0, +body.limits.maxTexts || 0), maxImages: Math.max(0, +body.limits.maxImages || 0) };
    if (body.models) Object.assign(db.settings.models, body.models);
    if (body.profile) Object.assign(cur(db).profile, body.profile);
    if (body.name) cur(db).name = body.name.trim();
    save(db);
    return { ok: true };
  },
  'GET /api/carousels': (db) =>
    fs.readdirSync(CDIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(CDIR, f), 'utf8'))).filter((c) => (c.client || db.clients[0].id) === db.active).map((c) => ({ id: c.id, title: c.title, updated: c.updated, count: c.slides.length, status: c.status || 'Rascunho', date: c.date || '' })).sort((a, b) => b.updated - a.updated),
  'POST /api/carousels/open': (db, b) => JSON.parse(fs.readFileSync(path.join(CDIR, cid(b.id) + '.json'), 'utf8')),
  'POST /api/carousels/save': (db, b) => {
    const c = b.carousel; c.id = cid(c.id) || Date.now().toString(36); c.updated = Date.now(); c.client = c.client || db.active;
    fs.writeFileSync(path.join(CDIR, c.id + '.json'), JSON.stringify(c));
    return { id: c.id };
  },
  'POST /api/carousels/delete': (db, b) => { try { fs.unlinkSync(path.join(CDIR, cid(b.id) + '.json')); } catch {} return { ok: true }; },
  'POST /api/clients/add': (db, b) => {
    const name = String(b.name || '').trim(); if (!name) throw new Error('Digite o nome do cliente.');
    const id = 'c' + Date.now().toString(36);
    db.clients.push({ id, name, profile: { who: '', audience: '', positioning: '', tone: '', phrases: '', topics: '', blocked: '', handle: '', level: 'Iniciante', pace: '2.6', radar: '', radarblock: '', feeds: '', auto: '' }, ideas: [], scripts: [], styles: [] });
    db.active = id; save(db); return { id };
  },
  'POST /api/clients/select': (db, b) => { if (!db.clients.some((c) => c.id === b.id)) throw new Error('Cliente não encontrado.'); db.active = b.id; save(db); return { ok: true }; },
  'POST /api/clients/delete': (db, b) => {
    if (db.clients.length < 2) throw new Error('Você precisa ter pelo menos um cliente.');
    const first = db.clients[0].id;
    for (const f of fs.readdirSync(CDIR)) { try { const c = JSON.parse(fs.readFileSync(path.join(CDIR, f), 'utf8')); if ((c.client || first) === b.id) fs.unlinkSync(path.join(CDIR, f)); } catch {} }
    db.clients = db.clients.filter((c) => c.id !== b.id); db.active = db.clients[0].id; save(db); return { ok: true };
  },
  'GET /api/backup': (db) => ({ app: 'content', version: VERSION, date: new Date().toISOString(), db, carousels: fs.readdirSync(CDIR).filter((f) => f.endsWith('.json')).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(CDIR, f), 'utf8')); } catch { return null; } }).filter(Boolean) }),
  'POST /api/backup/restore': (db, b) => {
    if (b.app !== 'content' || !b.db || !Array.isArray(b.db.clients)) throw new Error('Este arquivo não é um backup do Content.');
    autoBackup('antes-de-restaurar');
    save(b.db);
    for (const c of b.carousels || []) { const id = cid(c.id); if (id) fs.writeFileSync(path.join(CDIR, id + '.json'), JSON.stringify(c)); }
    return { ok: true, clients: b.db.clients.length, carousels: (b.carousels || []).length };
  },
  'GET /api/update/check': async () => { const info = await fetchUpdate(); return { current: VERSION, latest: info.version, notes: info.notes || '', has: newer(info.version, VERSION) }; },
  'POST /api/update/apply': async () => {
    const info = await fetchUpdate(); if (!newer(info.version, VERSION)) return { ok: true, same: true };
    await applyUpdate(info); setTimeout(() => process.exit(75), 300); return { ok: true, version: info.version };
  },
  'GET /api/update/status': () => { const f = path.join(DATA, 'atualizado.json'); try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); fs.unlinkSync(f); return j; } catch { return {}; } },
  'GET /api/scripts': (db) => cur(db).scripts,
  'POST /api/scripts': (db, b) => { cur(db).scripts = b.scripts; save(db); return { ok: true }; },
  'POST /api/script': async (db, b) => {
    const pace = +b.pace || 2.6, secs = +b.seconds || 45, words = Math.round(secs * pace);
    const out = await claude(
      db,
      'Você escreve roteiros de vídeos curtos (Reels) para falar em voz alta. Responda SOMENTE com JSON válido, sem markdown.',
      `${profileText(cur(db).profile)}\n\nIdeia: ${b.title}\nGancho: ${b.hook || ''}\nDuração alvo: ${secs} segundos, o que dá cerca de ${words} palavras faladas no total (o ritmo de fala é ${pace} palavras por segundo).\nNível do público: ${b.level || 'Iniciante'} (Iniciante = linguagem muito simples e sem termos técnicos; Intermediário = alguns termos explicados; Avançado = pode aprofundar).\nInstrução extra: ${b.instruction || 'nenhuma'}\n\nEscreva em primeira pessoa, na voz do criador, em português do Brasil. Frases curtas, naturais para falar em voz alta, sem emojis na fala. Estrutura: um bloco "Gancho" (prende nos primeiros 3 segundos), de 2 a 4 blocos "Desenvolvimento" e um bloco final "CTA".\nPara cada bloco: "speech" (o que falar), "visual" (o que aparece na tela, em português), "scene_prompt" (descrição curta da cena em inglês, para gerar vídeo ou imagem, sem texto na imagem).\nFormato: {"caption":"legenda do post","blocks":[{"label":"","speech":"","visual":"","scene_prompt":""}]}`,
      5000
    );
    if (!Array.isArray(out.blocks) || !out.blocks.length) throw new Error('A IA não devolveu o roteiro. Tente de novo.');
    return out;
  },
  'GET /api/radar': (db) => cur(db).radar || {},
  'POST /api/radar/run': async (db) => ({ added: await radarRun(db, cur(db)) }),
  'GET /api/styles': (db) => cur(db).styles,
  'POST /api/styles': (db, b) => { cur(db).styles = b.styles; save(db); return { ok: true }; },
  'POST /api/styles/analyze': async (db, b) => {
    if (!b.images?.length) throw new Error('Envie os prints do estilo (de 3 a 12).');
    const g = await analyzeStyle(db, b.images.slice(0, 12), b.note);
    const c = cur(db), st = { id: 's' + Date.now().toString(36), name: String(b.name || 'Estilo').trim(), guide: g, thumbs: b.images.slice(0, 6), note: b.note || '', isDefault: !!b.isDefault, imageStyle: g.image_style, character: g.characters, useThumbs: false, refs: okRefs(b.refs), assets: okAssets(b.assets) };
    if (st.isDefault) c.styles.forEach((x) => (x.isDefault = false));
    c.styles.unshift(st); save(db); return st;
  },
  'POST /api/styles/reanalyze': async (db, b) => {
    const st = cur(db).styles.find((x) => x.id === b.id); if (!st) throw new Error('Estilo não encontrado.');
    const imgs = (st.thumbs || []).filter((x) => typeof x === 'string' && x.startsWith('data:image/'));
    if (!imgs.length) throw new Error('Este estilo não tem prints salvos. Crie o estilo de novo enviando os prints.');
    const old = st.guide || {}; st.guide = await analyzeStyle(db, imgs, st.note); for (const k of ['forceImages','mFont','mSize','mCaps','mGlow','mFx']) if (old[k]) st.guide[k] = old[k]; st.imageStyle = st.guide.image_style; if (!st.character) st.character = st.guide.characters; save(db); return st;
  },
  'POST /api/slide/rewrite': async (db, b) => {
    const out = await claude(db, 'Você reescreve o texto de um slide de carrossel de Instagram. Responda SOMENTE com JSON válido.',
      `${profileText(cur(db).profile)}\n\nTema do carrossel: ${b.theme || ''}\nOutros slides: ${(b.others || []).join(' | ')}\n\nSlide atual:\nTítulo: ${b.title}\nTexto: ${b.body}\n\nInstrução: ${b.instruction || 'reescreva de outro jeito, mais claro e mais forte'}\nRegras: título com até 12 palavras; texto com até 25 palavras; português do Brasil, sem juridiquês.\nFormato: {"title":"","body":""}`, 1500);
    return { title: String(out.title || ''), body: String(out.body || '') };
  },
  'GET /api/ideas': (db) => cur(db).ideas,
  'POST /api/ideas': (db, body) => { cur(db).ideas = body.ideas; save(db); return { ok: true }; },

  // Radar simples: o Claude sugere pautas com nota de 0 a 100
  'POST /api/ideas/suggest': async (db, body) => {
    const out = await claude(
      db,
      'Você é estrategista de conteúdo para Instagram. Responda SOMENTE com JSON válido.',
      `${profileText(cur(db).profile)}\n\nTema/gatilho (opcional): ${body.topic || 'livre, dentro dos temas'}\n\nCrie 5 ideias de pauta. Formato: {"ideas":[{"title":"","hook":"","format":"Carrossel|Reel","score":0-100}]}`
    );
    return out.ideas;
  },

  // Gera os slides em JSON estruturado
  'POST /api/carousel': async (db, b) => {
    const out = await claude(
      db,
      'Você é um redator sênior de Instagram, especialista em carrosséis que prendem e que as pessoas salvam e compartilham. Escreva como uma pessoa falaria: direto, concreto, com personalidade, sem clichê de IA (nada de "No mundo de hoje", "é fundamental", "descubra como", "você sabia que" em excesso). Cada slide tem UMA ideia clara. Prefira detalhes específicos, exemplos do dia a dia, comparações inesperadas e curiosidades reais a frases genéricas. Nunca invente estatísticas, estudos, nomes ou datas: se não tiver certeza de um número, não o use e prefira um fato de conhecimento geral ou um exemplo prático. Responda SOMENTE com JSON válido, sem markdown.',
      `${profileText(cur(db).profile)}\n\nIdeia: ${b.title}\nGancho: ${b.hook || ''}\nQuantidade de slides: ${b.count}\nInstrução extra: ${b.instruction || 'nenhuma'}\n\n${+b.count === 1 ? 'Regras: este é um POST DE IMAGEM ÚNICA. Gere exatamente 1 slide, com título forte de até 12 palavras e texto de apoio de até 20 palavras. A "caption" deve ser uma legenda completa de Instagram: de 3 a 6 parágrafos curtos, terminando com uma chamada para ação e de 3 a 5 hashtags. Português do Brasil, sem juridiquês.' : 'Regras de conteúdo: (1) Slide 1 = capa com gancho que gera curiosidade ou quebra uma crença (ex.: afirmação contraintuitiva, erro comum, pergunta específica, promessa concreta), sem entregar a resposta. (2) Slides do meio = um ponto por slide, cada um com um fato, exemplo ou mini-história concreta que surpreenda; o título do slide enuncia a ideia e o corpo explica com um exemplo real, não com frase vaga. (3) Cada slide deve dar vontade de passar para o próximo (termine com uma tensão ou promessa quando fizer sentido). (4) Inclua pelo menos uma curiosidade ou dado de conhecimento geral verdadeiro e fácil de checar, sem números inventados. (5) Penúltimo slide = a lição principal em uma frase forte. (6) Último slide = CTA natural (salvar, comentar uma palavra, enviar para alguém) alinhado ao perfil. Tamanho: títulos até 10 palavras; corpo de 15 a 30 palavras, frases curtas. Português do Brasil, linguagem de conversa, sem juridiquês e sem enrolação.'}\nEm TODOS os slides, preencha "image_prompt" com uma descrição em inglês de uma imagem de fundo que combine com o texto do slide A imagem deve ilustrar de forma CLARA o assunto daquele slide: escolha UM único objeto ou metáfora concreta e reconhecível ligada ao tema (ex.: slide sobre cores → uma paleta/pincel/gotas de tinta; sobre fonte → uma letra grande em 3D; sobre celular → um celular), em composição simples, com o objeto principal grande e centralizado e espaço vazio para o texto. Evite montes de formas abstratas aleatórias e evite pessoas, a não ser que o tema peça. Descreva só a cena e o sujeito, em inglês; não cite estilo visual (isso é aplicado depois); sem texto, sem letras, sem logotipos. Nunca deixe vazio.\nFormato: {"caption":"legenda do post","slides":[{"title":"","body":"","image_prompt":""}]}`,
      6000
    );
    return out;
  },

  // Gera imagem com Gemini
  'POST /api/image': async (db, b) => {
    const chosen = db.settings.imageProvider || 'gemini', keys = db.settings.keys;
    const order = [chosen, ...['agnes', 'gemini'].filter((p) => p !== chosen && keys[p])];
    let last;
    for (const p of order) {
      try { const out = await makeImage(db, b, p); if (p !== chosen) out.via = p === 'agnes' ? 'Agnes' : 'Gemini'; return out; }
      catch (e) { last = e; if (p === chosen && !keys[p] && p !== 'free') throw e; _log('imagem ' + p + ' falhou: ' + e.message); }
    }
    throw last;
  },
};
async function makeImage(db, b, prov) {
  {
    const { keys, models } = db.settings;
    if (prov === 'free') {
      bump(db, 'images');
      const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(composeImage(b, db).slice(0, 1400) + ' No text, no letters.') + '?model=flux&width=1080&height=1440&nologo=true&enhance=false&seed=' + Math.floor(Math.random() * 1e9);
      const r = await fetch(url, { signal: AbortSignal.timeout(120000) }).catch((e) => { throw new Error('Não consegui falar com o gerador gratuito: ' + e.message); });
      if (!r.ok) throw new Error('O gerador gratuito respondeu com erro ' + r.status + '. Tente de novo em alguns minutos (ele fica sobrecarregado).');
      const buf = Buffer.from(await r.arrayBuffer()), ct = r.headers.get('content-type') || 'image/jpeg';
      if (!ct.startsWith('image/')) throw new Error('O gerador gratuito não devolveu uma imagem. Tente de novo.');
      return { image: `data:${ct};base64,${buf.toString('base64')}` };
    }
    if (prov === 'agnes') {
      if (!keys.agnes) throw new Error('Cadastre a chave da Agnes em Configurações → Conta e chaves.');
      bump(db, 'images');
      return { image: await agnesImage(keys.agnes, models, composeImage(b, db), okRefs(b.refs)) };
    }
    if (!keys.gemini) throw new Error('Cadastre a chave do Gemini em Configurações → Conta e chaves.');
    bump(db, 'images');
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${models.image}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': keys.gemini },
      body: JSON.stringify({ contents: [{ parts: [...okRefs(b.refs).map((u) => { const m = /^data:([^;]+);base64,(.+)$/.exec(u); return { inlineData: { mimeType: m[1], data: m[2] } }; }), { text: composeImage(b, db) + ' Vertical 4:5 composition, no text, no letters.' }] }] }),
    });
    const j = await r.json();
    if (!r.ok) {
      const msg = j.error?.message || '';
      if (r.status === 429 || /quota/i.test(msg)) throw new Error('O Gemini não libera imagens no plano gratuito. Ative o billing no Google AI Studio ou deixe "Imagens por IA" em 0.');
      throw new Error(msg || 'Erro na API do Gemini');
    }
    const part = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData || p.inline_data);
    const d = part?.inlineData || part?.inline_data;
    if (!d) throw new Error('O Gemini não devolveu imagem. Tente outro prompt ou outro modelo.');
    return { image: `data:${d.mimeType || d.mime_type};base64,${d.data}` };
  }
}

http
  .createServer(async (req, res) => {
    const url = req.url.split('?')[0];
    const handler = routes[`${req.method} ${url}`];
    if (!handler) {
      const f = path.join(__dirname, 'public', url === '/' ? 'index.html' : url);
      if (f.startsWith(path.join(__dirname, 'public')) && fs.existsSync(f) && fs.statSync(f).isFile()) {
        res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain' });
        return res.end(fs.readFileSync(f));
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Não encontrado.\nProcurei em: ' + f + '\nA pasta "public" com o index.html precisa estar ao lado do server.js.');
    }
    let raw = '';
    for await (const c of req) raw += c;
    try {
      const out = await handler(load(), raw ? JSON.parse(raw) : {});
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      _log((e && e.stack) || e);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  })
  .on('error', (e) => {
    if (e.code === 'EADDRINUSE') { console.log('O Content já está aberto. Abrindo o navegador...'); openBrowser(); setTimeout(() => process.exit(0), 1500); return; }
    _die(e.message);
  })
  .listen(PORT, () => {
    console.log(`Content rodando em http://localhost:${PORT}`);
    console.log('Deixe esta janela aberta enquanto usa o Content. Feche-a para encerrar.');
    console.log(`Versão ${VERSION}. Seus dados ficam em: ${DATA}`);
    openBrowser();
  });
