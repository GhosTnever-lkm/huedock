import test from 'node:test';
import assert from 'node:assert/strict';
import { addSavedPalette, contrastRatio, exportCss, harmonies, hslToRgb, mergeSavedPalettes, parseHex, recommendedText, relativeLuminance, rgbToHex, rgbToHsl, safeVarName, wcag } from './core.mjs';

test('parses and canonicalizes short and long HEX', () => {
  assert.deepEqual(parseHex('#abc'), { hex: '#aabbcc', r: 170, g: 187, b: 204 });
  assert.equal(parseHex(' #AABBCC ').hex, '#aabbcc');
  for (const value of ['#ab', '#gggggg', 'ffffff', '#1234567', 'rgb(1,2,3)']) assert.throws(() => parseHex(value));
});

test('calculates WCAG luminance and black/white contrast', () => {
  assert.equal(relativeLuminance('#000'), 0);
  assert.equal(relativeLuminance('#fff'), 1);
  assert.equal(contrastRatio('#000', '#fff'), 21);
  assert.equal(contrastRatio('#f00', '#00f'), contrastRatio('#00f', '#f00'));
});

test('reports WCAG 2.x normal and large text thresholds', () => {
  assert.deepEqual(wcag(7), { normal: { aa: true, aaa: true, label: 'AAA' }, large: { aa: true, aaa: true, label: 'AAA' } });
  assert.equal(wcag(4.5).normal.label, 'AA');
  assert.equal(wcag(3).large.label, 'AA');
  assert.equal(wcag(2.9).large.label, 'Fail');
  assert.throws(() => wcag(22));
});

test('recommends the higher-contrast text color', () => {
  assert.equal(recommendedText('#123456'), '#ffffff');
  assert.equal(recommendedText('#ffe65c'), '#000000');
});

test('converts RGB and HSL with hue wrap and bounded saturation/lightness', () => {
  const hex = '#37a6df';
  assert.equal(rgbToHex(hslToRgb(rgbToHsl(hex))), hex);
  assert.deepEqual(hslToRgb({ h: -360, s: 2, l: 0.5 }), hslToRgb({ h: 0, s: 1, l: 0.5 }));
  assert.equal(rgbToHex(hslToRgb({ h: 360, s: 0, l: 0.25 })), '#404040');
  assert.throws(() => hslToRgb({ h: NaN, s: 0, l: 0 }));
});

test('generates five canonical swatches for every harmony and wraps hue', () => {
  const set = harmonies('#ff1234');
  for (const key of ['analogous', 'complementary', 'triadic', 'tetradic']) {
    assert.equal(set[key].length, 5);
    assert.ok(set[key].every((color) => /^#[0-9a-f]{6}$/.test(color)));
  }
  assert.equal(set.analogous[2], '#ff1234');
});

test('sanitizes CSS variable names and exports only valid color values', () => {
  assert.equal(safeVarName('Brand / Primary'), '--brand-primary');
  assert.equal(exportCss({ 'Brand Primary': '#abc', accent: '#123456' }), ':root {\n  --brand-primary: #aabbcc;\n  --accent: #123456;\n}');
  assert.throws(() => exportCss({ '!!!': '#fff' }));
  assert.throws(() => exportCss({ accent: 'url(javascript:alert(1))' }));
});

test('keeps CSS variables unique when distinct labels sanitize to the same name', () => {
  assert.equal(
    exportCss({ 'Brand / Primary': '#f00', 'brand-primary': '#00f', 'brand-primary-2': '#0f0', 'brand primary': '#fff' }),
    ':root {\n  --brand-primary: #ff0000;\n  --brand-primary-2: #0000ff;\n  --brand-primary-2-2: #00ff00;\n  --brand-primary-3: #ffffff;\n}',
  );
});

test('refuses saving past the shelf limit without dropping existing palettes', () => {
  const existing = Array.from({ length: 36 }, (_, index) => ({ id: String(index) }));
  assert.throws(() => addSavedPalette(existing, { id: 'new' }), /shelf is full/);
  assert.equal(existing.length, 36);
  assert.equal(existing[0].id, '0');
});

test('rejects imports that would crowd out saved palettes', () => {
  const existing = Array.from({ length: 30 }, (_, index) => ({ id: `saved-${index}` }));
  const incoming = Array.from({ length: 7 }, (_, index) => ({ id: `imported-${index}` }));
  assert.throws(() => mergeSavedPalettes(existing, incoming), /exceed the 36-palette shelf limit/);
  assert.equal(existing.length, 30);
  assert.equal(incoming.length, 7);
  assert.equal(mergeSavedPalettes(existing, incoming.slice(0, 6)).length, 36);
});
