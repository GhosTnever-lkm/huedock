const HEX = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;
const MAX_SAVED_PALETTES = 36;
const HARMONIES = Object.freeze({
  analogous: [-30, -15, 0, 15, 30],
  complementary: [0, 150, 180, 210, 330],
  triadic: [0, 60, 120, 240, 300],
  tetradic: [0, 90, 180, 270, 45],
});

export function parseHex(input) {
  if (typeof input !== 'string' || !HEX.test(input.trim())) throw new Error('Use a 3- or 6-digit HEX color.');
  let value = input.trim().slice(1).toLowerCase();
  if (value.length === 3) value = [...value].map((char) => char + char).join('');
  const number = Number.parseInt(value, 16);
  return { hex: `#${value}`, r: number >> 16, g: (number >> 8) & 255, b: number & 255 };
}

export function rgbToHex(color) {
  const { r, g, b } = readRgb(color);
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function readRgb(color) {
  if (typeof color === 'string') return parseHex(color);
  if (!color || typeof color !== 'object') throw new Error('Expected a HEX string or RGB object.');
  const { r, g, b } = color;
  if (![r, g, b].every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) throw new Error('RGB channels must be integers from 0 to 255.');
  return { r, g, b };
}

export function rgbToHsl(color) {
  const { r, g, b } = readRgb(color);
  const red = r / 255, green = g / 255, blue = b / 255;
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  let hue = 0, saturation = 0;
  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
  }
  return { h: hue, s: saturation, l: lightness };
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}

export function hslToRgb({ h, s, l } = {}) {
  const hue = ((finite(h, 'Hue') % 360) + 360) % 360 / 360;
  const sat = Math.max(0, Math.min(1, finite(s, 'Saturation')));
  const light = Math.max(0, Math.min(1, finite(l, 'Lightness')));
  if (sat === 0) { const gray = Math.round(light * 255); return { r: gray, g: gray, b: gray }; }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const hueToChannel = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: Math.round(hueToChannel(hue + 1 / 3) * 255), g: Math.round(hueToChannel(hue) * 255), b: Math.round(hueToChannel(hue - 1 / 3) * 255) };
}

function linear(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color) {
  const { r, g, b } = readRgb(color);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

export function wcag(ratio) {
  finite(ratio, 'Contrast ratio');
  if (ratio < 1 || ratio > 21) throw new Error('Contrast ratio must be between 1 and 21.');
  const grade = (aa, aaa) => ({ aa: ratio >= aa, aaa: ratio >= aaa, label: ratio >= aaa ? 'AAA' : ratio >= aa ? 'AA' : 'Fail' });
  return { normal: grade(4.5, 7), large: grade(3, 4.5) };
}

export function recommendedText(background) {
  const black = contrastRatio('#000000', background), white = contrastRatio('#ffffff', background);
  return black >= white ? '#000000' : '#ffffff';
}

export function harmonies(input) {
  const base = parseHex(input);
  const hsl = rgbToHsl(base);
  return Object.fromEntries(Object.entries(HARMONIES).map(([name, offsets]) => [name, offsets.map((angle) => rgbToHex(hslToRgb({ h: hsl.h + angle, s: hsl.s, l: hsl.l })))]));
}

export function safeVarName(name) {
  if (typeof name !== 'string') throw new Error('Variable name must be text.');
  const cleaned = name.trim().toLowerCase().replace(/[^a-z\d_-]+/g, '-').replace(/-+/g, '-').replace(/^[-_]+|[-_]+$/g, '');
  if (!cleaned) throw new Error('Variable name is empty after cleanup.');
  return `--${cleaned}`;
}

export function exportCss(variables) {
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) throw new Error('Expected a variable map.');
  const entries = Object.entries(variables);
  if (!entries.length || entries.length > 100) throw new Error('Provide between 1 and 100 color variables.');
  const usedNames = new Set();
  const lines = entries.map(([name, value]) => {
    const baseName = safeVarName(name);
    let variableName = baseName;
    let suffix = 2;
    while (usedNames.has(variableName)) variableName = `${baseName}-${suffix++}`;
    usedNames.add(variableName);
    return `  ${variableName}: ${parseHex(value).hex};`;
  });
  return `:root {\n${lines.join('\n')}\n}`;
}

export function addSavedPalette(existing, palette) {
  if (!Array.isArray(existing)) throw new Error('Expected a saved palette list.');
  if (existing.length >= MAX_SAVED_PALETTES) throw new Error(`Palette shelf is full (${MAX_SAVED_PALETTES}). Export a backup or remove a palette before saving another.`);
  return [palette, ...existing];
}

export function mergeSavedPalettes(existing, incoming) {
  if (!Array.isArray(existing) || !Array.isArray(incoming)) throw new Error('Expected saved palette lists.');
  if (existing.length + incoming.length > MAX_SAVED_PALETTES) throw new Error(`Import would exceed the ${MAX_SAVED_PALETTES}-palette shelf limit. Export or remove palettes, then try again.`);
  return [...incoming, ...existing];
}
