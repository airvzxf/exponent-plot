'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/exponent-math.js');

test('describe: expansión con base >= 2', () => {
    const info = M.describe(2, 3);
    assert.equal(info.kind, 'expansion');
    assert.equal(info.count, 8);
    assert.equal(info.resultText, '8');
    assert.equal(info.formula, '2 × 2 × 2');
    assert.match(info.explanation, /2³ son 2 copias de 2²/);
    assert.match(info.explanation, /8 unidades de valor 1/);
});

test('describe: compresión muestra fracción y decimal exacto o aproximado', () => {
    assert.equal(M.describe(2, -3).resultText, '1/8 = 0.125');
    assert.equal(M.describe(4, -4).resultText, '1/256 ≈ 0.0039');
    assert.equal(M.describe(3, -1).resultText, '1/3 ≈ 0.3333');
    assert.equal(M.describe(3, -1).formula, '1 / 3');
    assert.equal(M.describe(3, -2).formula, '1 / (3 × 3)');
    assert.match(M.describe(2, -1).explanation, /una vez/);
    assert.match(M.describe(2, -3).explanation, /8 partes de valor 1\/8/);
});

test('describe: base 0', () => {
    const zero = M.describe(0, 3);
    assert.equal(zero.kind, 'zero');
    assert.equal(zero.resultText, '0');
    assert.doesNotMatch(zero.resultText, /e/);

    const undef = M.describe(0, -2);
    assert.equal(undef.kind, 'undefined');
    assert.equal(undef.resultText, 'Indefinido');

    const zeroZero = M.describe(0, 0);
    assert.equal(zeroZero.kind, 'unit');
    assert.equal(zeroZero.resultText, '1');
    assert.match(zeroZero.explanation, /convención/);
});

test('describe: base 1 y exponente 0', () => {
    assert.equal(M.describe(1, 4).kind, 'one');
    assert.equal(M.describe(1, -4).kind, 'one');
    assert.doesNotMatch(M.describe(1, 4).explanation, /1 unidades|1 partes/);
    assert.equal(M.describe(3, 0).kind, 'unit');
});

test('formatSigned y toSuperscript usan el signo menos tipográfico', () => {
    assert.equal(M.formatSigned(-3), '−3');
    assert.equal(M.formatSigned(4), '4');
    assert.equal(M.toSuperscript(-3), '⁻³');
    assert.equal(M.toSuperscript(12), '¹²');
});

test('groupOf: paso en el que aparece cada unidad', () => {
    // Base 2: [0] [1] [2,3] [4..7] [8..15]
    const groups = Array.from({ length: 16 }, (_, i) => M.groupOf(i, 2));
    assert.deepEqual(groups, [0, 1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4]);
    // Potencias exactas no sufren errores de coma flotante.
    assert.equal(M.groupOf(27, 3), 4);
    assert.equal(M.groupOf(26, 3), 3);
    assert.equal(M.groupOf(64, 4), 4);
    assert.equal(M.groupOf(63, 4), 3);
});

test('expansionLayout: n^k es n copias de n^(k-1)', () => {
    for (const base of [2, 3, 4]) {
        for (let steps = 0; steps <= 4; steps++) {
            const layout = M.expansionLayout(base, steps);
            assert.equal(layout.cells.length, M.intPow(base, steps));

            // Las celdas no se superponen.
            const keys = new Set(layout.cells.map((c) => `${c.x.toFixed(6)},${c.y.toFixed(6)}`));
            assert.equal(keys.size, layout.cells.length);

            // Todas caben en el tamaño total.
            for (const c of layout.cells) {
                assert.ok(c.x >= 0 && c.y >= 0);
                assert.ok(c.x + c.w <= layout.width + 1e-9);
                assert.ok(c.y + c.h <= layout.height + 1e-9);
            }

            if (steps >= 1) {
                // Cada copia del bloque anterior es una traslación exacta de la primera.
                const previous = M.intPow(base, steps - 1);
                for (let copy = 1; copy < base; copy++) {
                    const dx = layout.cells[copy * previous].x - layout.cells[0].x;
                    const dy = layout.cells[copy * previous].y - layout.cells[0].y;
                    for (let i = 0; i < previous; i++) {
                        const a = layout.cells[i];
                        const b = layout.cells[copy * previous + i];
                        assert.ok(Math.abs(b.x - a.x - dx) < 1e-9);
                        assert.ok(Math.abs(b.y - a.y - dy) < 1e-9);
                    }
                }
            }
        }
    }
});

test('expansionLayout: k par forma un cuadrado', () => {
    const square = M.expansionLayout(3, 2);
    assert.ok(Math.abs(square.width - square.height) < 1e-9);
    const quad = M.expansionLayout(2, 4);
    assert.ok(Math.abs(quad.width - quad.height) < 1e-9);
});

test('expansionLayout: marcos por cada bloque n^j', () => {
    const layout = M.expansionLayout(2, 3);
    // 4 bloques de 2, 2 bloques de 4 y 1 bloque de 8.
    assert.equal(layout.frames.length, 4 + 2 + 1);
    assert.deepEqual(layout.frames.map((f) => f.level), [1, 1, 1, 1, 2, 2, 3]);
    assert.equal(M.expansionLayout(1, 3).frames.length, 0);
});

test('partitionLayout: las partes caben en la unidad', () => {
    for (const base of [2, 3, 4]) {
        for (let steps = 1; steps <= 4; steps++) {
            const layout = M.partitionLayout(base, steps, 1);
            assert.equal(layout.width, 1);
            assert.equal(layout.height, 1);
            for (const c of layout.cells) {
                assert.ok(c.x >= -1e-9 && c.y >= -1e-9);
                assert.ok(c.x + c.w <= 1 + 1e-9);
                assert.ok(c.y + c.h <= 1 + 1e-9);
            }
            // Las partes tienen la proporción n^-ceil(k/2) × n^-floor(k/2) (sin huecos).
            const gapless = M.partitionLayout(base, steps, 1, 0).cells[0];
            const ratio = gapless.w / gapless.h;
            const expected = steps % 2 === 1 ? 1 / base : 1;
            assert.ok(Math.abs(ratio - expected) < 1e-9, `base ${base}, k ${steps}`);
        }
    }
});

test('fitZoom', () => {
    assert.equal(M.fitZoom(2, 1, 100, 100, 1), 50);
    assert.equal(M.fitZoom(1, 4, 100, 100, 1), 25);
    assert.equal(M.fitZoom(0, 1, 100, 100), 1);
});

test('expansionLayout: los marcos de bloques vecinos no se tocan', () => {
    for (const base of [2, 3, 4]) {
        const layout = M.expansionLayout(base, 4);
        for (const frame of layout.frames) {
            const step = frame.level + 1;
            if (step > 4) {
                continue;
            }
            // Los vecinos del mismo nivel están separados por el hueco del paso siguiente.
            assert.ok(2 * frame.padX < layout.gaps[step], `nivel ${frame.level}`);
        }
        const pads = [...new Set(layout.frames.map((f) => f.padX))];
        assert.deepEqual(pads, [...pads].sort((a, b) => a - b));
    }
});
