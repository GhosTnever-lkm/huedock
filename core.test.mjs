import test from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, exportCss, harmonies, hslToRgb, parseHex, recommendedText, relativeLuminance, rgbToHex, rgbToHsl, safeVarName, wcag } from './core.mjs';

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
