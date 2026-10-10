import { contrastRatio, exportCss, harmonies, parseHex, recommendedText, wcag } from './core.mjs';

const $ = (id) => document.getElementById(id);
const storeKey = 'huedock.palette-shelf.v1';
const paletteNames = { analogous: 'Analogous', complementary: 'Complementary', triadic: 'Triadic', tetradic: 'Tetradic' };
let saved = readShelf();
let activePalette = [];
let activeBase = '#5d70d6';

function readShelf() {
  try {
    const value = JSON.parse(localStorage.getItem(storeKey) || '[]');
    if (!Array.isArray(value)) return [];
    return value.slice(0, 36).flatMap((item) => {
      try {
        if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || !item.name.trim() || !Object.hasOwn(paletteNames, item.harmony) || !Array.isArray(item.colors) || item.colors.length !== 5) return [];
        const colors = item.colors.map((color) => parseHex(color).hex);
        const base = parseHex(item.base || colors[2]).hex;
        const createdAt = typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) ? item.createdAt : new Date(0).toISOString();
        return [{ id: item.id.slice(0, 80), name: item.name.trim().slice(0, 50), harmony: item.harmony, colors, base, createdAt }];
      } catch { return []; }
    });
  }
  catch { return []; }
}

function announce(text, error = false) {
  const node = $('studio-message');
  node.textContent = text;
  node.classList.toggle('error', error);
}

function syncColor(inputId, pickerId) {
  const parsed = parseHex($(inputId).value);
  $(inputId).value = parsed.hex.toUpperCase();
  $(pickerId).value = parsed.hex;
  return parsed.hex;
}

function contrastBadge(fg, bg, size) {
  const ratio = contrastRatio(fg, bg);
  const grade = wcag(ratio)[size];
  return { ratio, ...grade };
}

function renderContrast() {
  try {
    const fg = syncColor('foreground-hex', 'foreground-picker');
    const bg = syncColor('background-hex', 'background-picker');
    const normal = contrastBadge(fg, bg, 'normal');
    const large = contrastBadge(fg, bg, 'large');
    $('contrast-ratio').textContent = `${normal.ratio.toFixed(2)}:1`;
    $('contrast-preview').style.setProperty('--preview-fg', fg);
    $('contrast-preview').style.setProperty('--preview-bg', bg);
    $('contrast-grade').replaceChildren();
    for (const [label, result] of [['AA · Normal', normal], ['AAA · Normal', { label: wcag(normal.ratio).normal.aaa ? 'AAA' : 'Fail' }], ['AA · Large', large], ['AAA · Large', { label: wcag(large.ratio).large.aaa ? 'AAA' : 'Fail' }]]) {
      const row = document.createElement('span');
      row.className = `grade ${result.label === 'Fail' ? 'fail' : 'pass'}`;
      row.innerHTML = `<span>${label}</span><b>${result.label}</b>`;
      $('contrast-grade').append(row);
    }
  } catch { $('contrast-ratio').textContent = '—'; $('contrast-grade').replaceChildren(); }
}

function makeSwatch(color, index, base) {
  const wrapper = document.createElement('article');
  wrapper.className = `swatch ${color === base ? 'is-base' : ''}`;
  const colorButton = document.createElement('button');
  colorButton.type = 'button';
  colorButton.className = 'swatch-color';
  colorButton.style.backgroundColor = color;
  colorButton.style.color = recommendedText(color);
  colorButton.setAttribute('aria-label', `Copy ${color}`);
  colorButton.innerHTML = `<span class="swatch-number">0${index + 1}</span><span class="copy-mark">↗</span>`;
  colorButton.addEventListener('click', () => copyText(color, `Copied ${color}`));
  const info = document.createElement('div');
  info.className = 'swatch-info';
  const value = document.createElement('button');
  value.type = 'button';
  value.className = 'swatch-hex';
  value.textContent = color.toUpperCase();
  value.title = 'Copy HEX';
  value.addEventListener('click', () => copyText(color, `Copied ${color}`));
  const contrast = contrastRatio(recommendedText(color), color);
  const badge = document.createElement('span');
  badge.className = 'swatch-contrast';
  badge.textContent = `${contrast.toFixed(1)}:1 text`;
  info.append(value, badge);
  wrapper.append(colorButton, info);
  return wrapper;
}

function renderPalette() {
  try {
    const base = syncColor('base-hex', 'base-picker');
    activeBase = base;
    activePalette = harmonies(base)[$('harmony').value];
    $('picker-preview').style.backgroundColor = base;
    $('palette-grid').replaceChildren(...activePalette.map((color, index) => makeSwatch(color, index, base)));
    $('swatch-count').textContent = String(activePalette.length).padStart(2, '0');
    renderContrast();
    announce(`Generated a ${paletteNames[$('harmony').value].toLowerCase()} palette from ${base}.`);
  } catch (error) { announce(error.message, true); }
}

function renderShelf() {
  $('saved-grid').replaceChildren();
  $('saved-empty').hidden = saved.length > 0;
  for (const item of saved) {
    const card = document.createElement('article');
    card.className = 'saved-card';
    const row = document.createElement('div');
    row.className = 'saved-colors';
    for (const color of item.colors) {
      const dot = document.createElement('button');
      dot.type = 'button'; dot.className = 'saved-dot'; dot.style.backgroundColor = color; dot.title = `Copy ${color}`;
      dot.addEventListener('click', () => copyText(color, `Copied ${color}`));
      row.append(dot);
    }
    const title = document.createElement('strong'); title.textContent = item.name;
    const meta = document.createElement('span'); meta.textContent = `${paletteNames[item.harmony] || 'Custom'} · ${new Date(item.createdAt).toLocaleDateString()}`;
    const actions = document.createElement('div'); actions.className = 'saved-actions';
    actions.append(button('Apply', () => { $('base-hex').value = item.base; $('harmony').value = item.harmony; renderPalette(); window.location.hash = 'studio'; }), button('CSS', () => copyText(exportCss(Object.fromEntries(item.colors.map((c, i) => [`${item.name}-${i + 1}`, c]))), 'CSS tokens copied.')), button('Remove', () => removeSaved(item.id)));
    card.append(row, title, meta, actions); $('saved-grid').append(card);
  }
}

function button(label, onClick) { const node = document.createElement('button'); node.type = 'button'; node.className = 'small-action'; node.textContent = label; node.addEventListener('click', onClick); return node; }
function persistShelf() { localStorage.setItem(storeKey, JSON.stringify(saved)); renderShelf(); }
function removeSaved(id) { saved = saved.filter((item) => item.id !== id); persistShelf(); announce('Palette removed from your shelf.'); }

function savePalette() {
  const name = prompt('Name this palette', `${paletteNames[$('harmony').value]} ${new Date().toLocaleDateString()}`);
  if (name === null) return;
  const cleanName = name.trim().slice(0, 50);
  if (!cleanName) { announce('Enter a palette name first.', true); return; }
  saved.unshift({ id: crypto.randomUUID(), name: cleanName, harmony: $('harmony').value, colors: activePalette, base: activeBase, createdAt: new Date().toISOString() });
  saved = saved.slice(0, 36);
  try { persistShelf(); announce(`Saved “${cleanName}” on this device.`); }
  catch { saved.shift(); announce('Browser storage is full. Export or remove older palettes.', true); }
}

async function copyText(text, success) {
  try { await navigator.clipboard.writeText(text); announce(success); }
  catch { announce('Clipboard access is unavailable. Select and copy the value manually.', true); }
}

function cssTokens() {
  return exportCss(Object.fromEntries(activePalette.map((color, index) => [`palette-${index + 1}`, color])));
}

function exportLibrary() {
  const data = JSON.stringify({ app: 'HueDock', version: 1, palettes: saved }, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'huedock-palettes.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importLibrary(file) {
  if (!file) return;
  try {
    if (file.size > 1_000_000) throw new Error('Backup exceeds 1 MB.');
    const data = JSON.parse(await file.text());
    if (data?.app !== 'HueDock' || data.version !== 1 || !Array.isArray(data.palettes) || data.palettes.length > 36) throw new Error('This is not a valid HueDock backup.');
    const incoming = data.palettes.map((item) => {
      if (typeof item.name !== 'string' || !item.name.trim() || !Array.isArray(item.colors) || item.colors.length !== 5 || !Object.hasOwn(paletteNames, item.harmony)) throw new Error('A saved palette is malformed.');
      return { id: crypto.randomUUID(), name: item.name.trim().slice(0, 50), harmony: item.harmony, colors: item.colors.map((color) => parseHex(color).hex), base: parseHex(item.base || item.colors[2]).hex, createdAt: new Date().toISOString() };
    });
    saved = [...incoming, ...saved].slice(0, 36); persistShelf(); announce(`Imported ${incoming.length} palette(s).`);
  } catch (error) { announce(error.message || 'Could not import this backup.', true); }
  finally { $('import-library').value = ''; }
}

$('base-hex').addEventListener('change', renderPalette);
$('base-picker').addEventListener('input', () => { $('base-hex').value = $('base-picker').value.toUpperCase(); renderPalette(); });
$('harmony').addEventListener('change', renderPalette);
$('randomize').addEventListener('click', () => { $('base-picker').value = `#${crypto.getRandomValues(new Uint8Array(3)).reduce((s, n) => s + n.toString(16).padStart(2, '0'), '')}`; $('base-hex').value = $('base-picker').value.toUpperCase(); renderPalette(); });
$('save-palette').addEventListener('click', savePalette);
$('copy-css').addEventListener('click', () => copyText(cssTokens(), 'CSS custom properties copied.'));
for (const [picker, input] of [['foreground-picker', 'foreground-hex'], ['background-picker', 'background-hex']]) {
  $(picker).addEventListener('input', () => { $(input).value = $(picker).value.toUpperCase(); renderContrast(); });
  $(input).addEventListener('change', renderContrast);
}
$('export-library').addEventListener('click', exportLibrary);
$('import-library-button').addEventListener('click', () => $('import-library').click());
$('import-library').addEventListener('change', () => importLibrary($('import-library').files?.[0]));
$('theme-toggle').addEventListener('click', () => { const dark = document.documentElement.dataset.theme !== 'dark'; document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('huedock.theme', dark ? 'dark' : 'light'); });
document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('base-hex').focus(); $('base-hex').select(); } });
document.documentElement.dataset.theme = localStorage.getItem('huedock.theme') || 'light';
renderPalette(); renderShelf();
