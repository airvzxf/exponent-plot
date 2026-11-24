'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../src/exponent-math.js');

const near = (a, b) => Math.abs(a - b) < 1e-9;

test('foldLayout sin pliegues es expansionLayout', () => {
    for (const base of [2, 3, 4]) {
        for (let steps = 1; steps <= 4; steps++) {
            const fold = M.foldLayout(base, steps, 0);
            const expansion = M.expansionLayout(base, steps);
            assert.ok(near(fold.width, expansion.width) && near(fold.height, expansion.height));
            fold.cells.forEach((cell, i) => {
                const e = expansion.cells[i];
                assert.ok(near(cell.x, e.x) && near(cell.y, e.y) && near(cell.w, 1) && near(cell.h, 1), `${base}^${steps} celda ${i}`);
            });
        }
    }
});

test('cada pliegue deja la huella de n^(k-j) y las piezas valen 1/n^j', () => {
    for (const base of [2, 3, 4]) {
        for (let steps = 1; steps <= 4; steps++) {
            for (let folded = 0; folded <= steps; folded++) {
                const fold = M.foldLayout(base, steps, folded);
                const open = M.expansionLayout(base, steps - folded);
                const tag = `${base}^${steps}, j=${folded}`;
                assert.ok(near(fold.width, open.width) && near(fold.height, open.height), tag);
                assert.equal(fold.cells.length, M.intPow(base, steps), tag);
                // Área de cada pieza: 1/n^j.
                const area = fold.cells[0].w * fold.cells[0].h;
                assert.ok(near(area, 1 / M.intPow(base, folded)), tag);
                // Todas dentro de la huella y sin superponerse.
                const keys = new Set();
                for (const c of fold.cells) {
                    assert.ok(c.x >= -1e-9 && c.y >= -1e-9, tag);
                    assert.ok(c.x + c.w <= fold.width + 1e-9 && c.y + c.h <= fold.height + 1e-9, tag);
                    keys.add(`${c.x.toFixed(6)},${c.y.toFixed(6)}`);
                }
                assert.equal(keys.size, fold.cells.length, tag);
            }
        }
    }
});

test('plegado completo: las n^k piezas llenan la unidad sin huecos', () => {
    for (const base of [2, 3, 4]) {
        for (let steps = 1; steps <= 4; steps++) {
            const fold = M.foldLayout(base, steps, steps);
            assert.ok(near(fold.width, 1) && near(fold.height, 1));
            const total = fold.cells.reduce((sum, c) => sum + c.w * c.h, 0);
            assert.ok(near(total, 1), `${base}^${steps}: suma ${total}`);
        }
    }
});

test('foldLayout: marcos de los niveles plegados y abiertos', () => {
    const fold = M.foldLayout(2, 3, 1);
    // 4 bloques de 2, 2 de 4 y 1 de 8; solo el nivel 3 está plegado.
    assert.deepEqual(fold.frames.map((f) => f.folded), [false, false, false, false, false, false, true]);
    const whole = fold.frames[fold.frames.length - 1];
    assert.ok(near(whole.w, fold.width) && near(whole.h, fold.height));
});
