// Plugin do Content: monta no Figma os carrosséis enviados pelo app (textos, formas e imagens editáveis).
figma.showUI(__html__, { width: 340, height: 520, themeColors: true });

const W = 1080, H = 1350, GAP = 60;
const hexRgb = (c) => {
  c = String(c || '').trim();
  let m = /^#([0-9a-f]{3})$/i.exec(c); if (m) c = '#' + m[1].split('').map((x) => x + x).join('');
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c);
  if (m) { const n = parseInt(m[1], 16); return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 }; }
  m = /rgba?\(([^)]+)\)/i.exec(c);
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p[3] == null ? 1 : p[3] }; }
  return null;
};
const solid = (c, op) => { const x = hexRgb(c); if (!x) return []; return [{ type: 'SOLID', color: { r: x.r, g: x.g, b: x.b }, opacity: (op == null ? 1 : op) * x.a }]; };
const stop = (c, pos, a) => { const x = hexRgb(c) || { r: 0, g: 0, b: 0, a: 1 }; return { position: pos, color: { r: x.r, g: x.g, b: x.b, a: a == null ? x.a : a } }; };
const DOWN = [[0, 1, 0], [-1, 0, 1]]; // gradiente de cima para baixo
const ACROSS = [[1, 0, 0], [0, 1, 0]];

// Fontes: tenta a do app e cai para Inter se não existir no Figma.
const WEIGHTS = { 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semi Bold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };
const loaded = {};
async function tryFont(f) { const k = f.family + '|' + f.style; if (k in loaded) return loaded[k]; try { await figma.loadFontAsync(f); loaded[k] = true; } catch (e) { loaded[k] = false; } return loaded[k]; }
async function pickFont(kind, weight) {
  const w = +weight || 400, bold = w >= 600, list = [];
  if (kind === 'display') list.push({ family: 'Anton', style: 'Regular' }, { family: 'Bebas Neue', style: 'Regular' }, { family: 'Inter', style: 'Black' });
  else if (kind === 'grotesk') list.push({ family: 'Space Grotesk', style: w >= 700 ? 'Bold' : w >= 600 ? 'SemiBold' : w >= 500 ? 'Medium' : 'Regular' }, { family: 'Space Grotesk', style: bold ? 'Bold' : 'Regular' });
  else if (kind === 'serif') list.push({ family: 'Georgia', style: bold ? 'Bold' : 'Regular' }, { family: 'Playfair Display', style: bold ? 'Bold' : 'Regular' });
  list.push({ family: 'Inter', style: WEIGHTS[Math.round(w / 100) * 100] || 'Regular' }, { family: 'Inter', style: bold ? 'Bold' : 'Regular' }, { family: 'Roboto', style: 'Regular' });
  for (const f of list) if (await tryFont(f)) return f;
  throw new Error('Nenhuma fonte disponível.');
}

// Rotação igual à do app (em volta do centro, sentido horário).
function rotate(n, e, h) {
  if (!e.rot) return;
  const a = (e.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cx = e.x + e.w / 2, cy = e.y + h / 2;
  n.relativeTransform = [[c, -s, cx - (c * e.w / 2 - s * h / 2)], [s, c, cy - (s * e.w / 2 + c * h / 2)]];
}
const effects = (e) => {
  const fx = [];
  if (e.blur) fx.push({ type: 'LAYER_BLUR', radius: e.blur * 2, visible: true });
  if (e.sh) fx.push({ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.5 }, offset: { x: 0, y: e.sh / 3 }, radius: e.sh, spread: 0, visible: true, blendMode: 'NORMAL' });
  return fx;
};

async function buildSlide(s, i, title, imgs) {
  const f = figma.createFrame();
  f.name = `${title} — slide ${i + 1}`; f.resize(W, H); f.clipsContent = true;
  const dark = (s.bg || 'dark') === 'dark', gc = String(s.bgcss || '').match(/#[0-9a-f]{6}/gi);
  if (gc) f.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: DOWN, gradientStops: [stop(gc[0], 0), stop(gc[1] || gc[0], 1)] }];
  else if (dark) {
    f.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: DOWN, gradientStops: [stop('#050816', 0), stop('#0a1650', 1)] }];
    const g = figma.createEllipse(); g.name = 'Brilho'; g.resize(1400, 1100); g.x = 972 - 700; g.y = 108 - 550; g.fills = solid('#3d6bff', 0.45); g.effects = [{ type: 'LAYER_BLUR', radius: 300, visible: true }]; f.appendChild(g);
  } else f.fills = solid('#f4f1ea');

  if (s.image && imgs[s.image]) {
    const hash = imgs[s.image];
    const b = s.box || { x: 0, y: 0, w: W, h: H };
    const r = figma.createRectangle(); r.name = s.box ? 'Imagem' : 'Imagem de fundo'; r.resize(b.w, b.h); r.x = b.x; r.y = b.y;
    r.fills = [{ type: 'IMAGE', imageHash: hash, scaleMode: 'FILL' }]; f.appendChild(r);
    if (!s.box && (s.dim == null ? 100 : s.dim) > 0) {
      const ov = figma.createRectangle(), c = dark ? '#050816' : '#f4f1ea'; ov.name = 'Escurecimento'; ov.resize(W, H);
      ov.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: DOWN, gradientStops: [stop(c, 0, dark ? 0.25 : 0.3), stop(c, 0.9, dark ? 0.94 : 0.95)] }];
      ov.opacity = (s.dim == null ? 100 : s.dim) / 100; f.appendChild(ov);
    }
  }

  let k = 0;
  for (const e of s.els || []) {
    k++;
    const op = (e.op == null ? 100 : e.op) / 100;
    let n;
    if (e.type === 'text') {
      n = figma.createText();
      n.fontName = await pickFont(e.font, e.weight);
      n.characters = String(e.text || ' ');
      n.fontSize = Math.max(1, +e.size || 40);
      n.textAlignHorizontal = e.align === 'center' ? 'CENTER' : e.align === 'right' ? 'RIGHT' : 'LEFT';
      if (e.caps) n.textCase = 'UPPER';
      n.lineHeight = { unit: 'PERCENT', value: (e.lh || 1.25) * 100 };
      n.fills = solid(e.color || '#ffffff');
      n.resize(Math.max(1, e.w), 10); n.textAutoResize = 'HEIGHT';
      n.name = String(e.text || 'Texto').slice(0, 40);
      n.x = e.x; n.y = e.y; n.opacity = op; n.effects = effects(e);
      f.appendChild(n); rotate(n, e, n.height); continue;
    }
    if (e.type === 'image') {
      if (!imgs[e.src]) continue;
      n = figma.createRectangle(); n.name = 'Imagem ' + k;
      n.fills = [{ type: 'IMAGE', imageHash: imgs[e.src], scaleMode: e.fit === 'contain' ? 'FIT' : 'FILL' }];
    } else if (e.type === 'ellipse') {
      n = figma.createEllipse(); n.name = e.orb ? 'Esfera ' + k : 'Elipse ' + k;
      n.fills = e.orb ? [{ type: 'GRADIENT_RADIAL', gradientTransform: [[1, 0, -0.18], [0, 1, -0.24]], gradientStops: [stop('#ffffff', 0, 0.9), stop('#ffffff', 0.09, 0.28), stop(e.fill, 0.36), stop(e.fill2 || e.fill, 1)] }] : solid(e.fill);
    } else if (e.type === 'rect') {
      n = figma.createRectangle(); n.name = e.band ? 'Faixa ' + k : 'Retângulo ' + k;
      if (e.r) n.cornerRadius = +e.r;
      if (e.band) n.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: ACROSS, gradientStops: [stop(e.fill, 0, 0), stop(e.fill, 0.18), stop('#ffffff', 0.5), stop(e.fill, 0.82), stop(e.fill, 1, 0)] }];
      else if (e.stroke) { n.fills = []; n.strokes = solid(e.stroke); n.strokeWeight = e.sw || 4; n.strokeAlign = 'INSIDE'; }
      else n.fills = e.fill === 'transparent' ? [] : solid(e.fill);
    } else continue;
    n.resize(Math.max(1, e.w), Math.max(1, e.h)); n.x = e.x; n.y = e.y; n.opacity = op; n.effects = effects(e);
    f.appendChild(n); rotate(n, e, e.h);
  }
  return f;
}

async function buildCarousel(c, imgBytes) {
  const page = figma.currentPage;
  const imgs = {};
  for (const [src, bytes] of Object.entries(imgBytes)) { try { imgs[src] = figma.createImage(bytes).hash; } catch (e) {} }
  let y = 0; for (const n of page.children) y = Math.max(y, n.y + n.height + 200);
  const title = c.title || 'Carrossel', frames = [];
  for (let i = 0; i < c.slides.length; i++) {
    const f = await buildSlide(c.slides[i], i, title, imgs);
    f.x = i * (W + GAP); f.y = y; frames.push(f);
  }
  if (c.caption) {
    const t = figma.createText(); t.fontName = await pickFont('sans', 400); t.characters = 'LEGENDA\n\n' + c.caption; t.fontSize = 28; t.lineHeight = { unit: 'PERCENT', value: 140 };
    t.resize(700, 10); t.textAutoResize = 'HEIGHT'; t.name = 'Legenda'; t.x = frames.length * (W + GAP); t.y = y; t.fills = solid('#888888'); frames.push(t);
  }
  let holder;
  try {
    holder = figma.createSection(); holder.name = title; holder.x = -80; holder.y = y - 80;
    for (const f of frames) holder.appendChild(f);
    let mw = 0, mh = 0; for (const f of frames) { mw = Math.max(mw, f.x + f.width); mh = Math.max(mh, f.y + f.height); }
    holder.resizeWithoutConstraints(mw + 160, mh + 160);
    for (const f of frames) { f.x += 80; f.y = f.y - y + 80; }
  } catch (e) { holder = null; }
  figma.viewport.scrollAndZoomIntoView(holder ? [holder] : frames);
  return frames.length;
}

figma.ui.onmessage = async (m) => {
  if (m.type === 'build') {
    try { await buildCarousel(m.carousel, m.images || {}); figma.notify('“' + (m.carousel.title || 'Carrossel') + '” criado no Figma ✓'); figma.ui.postMessage({ type: 'done', id: m.carousel.id }); }
    catch (e) { figma.notify('Não consegui criar: ' + e.message, { error: true }); figma.ui.postMessage({ type: 'fail', id: m.carousel.id, msg: e.message }); }
  }
};
