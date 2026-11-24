'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../src/exponent-math.js');

test('parseHashState lee base, exponente e idioma', () => {
    assert.deepEqual(M.parseHashState('#b=3&e=-2&lang=en'), { base: 3, exponent: -2, lang: 'en' });
    assert.deepEqual(M.parseHashState('b=0&e=0'), { base: 0, exponent: 0 });
    assert.deepEqual(M.parseHashState(''), {});
    assert.deepEqual(M.parseHashState(undefined), {});
});

test('parseHashState ajusta los valores fuera de rango', () => {
    assert.deepEqual(M.parseHashState('#b=10&e=-9'), { base: 4, exponent: -4 });
    assert.deepEqual(M.parseHashState('#b=-1&e=7'), { base: 0, exponent: 4 });
});

test('parseHashState ignora valores inválidos', () => {
    for (const hash of ['#b=2.5', '#b=abc', '#b=', '#b=1e2', '#b=+2', '#b=99999', '#e=--1']) {
        assert.deepEqual(M.parseHashState(hash), {}, hash);
    }
    assert.deepEqual(M.parseHashState('#lang=fr&b=2'), { base: 2 });
});

test('formatHashState es la inversa de parseHashState', () => {
    assert.equal(M.formatHashState({ base: 2, exponent: -3 }), 'b=2&e=-3');
    assert.equal(M.formatHashState({ base: 4, exponent: 1, lang: 'en' }), 'b=4&e=1&lang=en');
    assert.equal(M.formatHashState({ base: 1, exponent: 0, lang: 'fr' }), 'b=1&e=0');
    for (let b = M.LIMITS.baseMin; b <= M.LIMITS.baseMax; b++) {
        for (let e = M.LIMITS.exponentMin; e <= M.LIMITS.exponentMax; e++) {
            assert.deepEqual(M.parseHashState(M.formatHashState({ base: b, exponent: e })), { base: b, exponent: e });
        }
    }
});

test('dimensionsLink ajusta a base 1–10 y exponente 0–3', () => {
    assert.deepEqual(M.dimensionsLink(3, 2), {
        base: 3, exponent: 2, lang: undefined, adjusted: false,
        url: 'https://exponent-dimensions.rovisoft.net/#b=3&e=2',
    });
    const negative = M.dimensionsLink(2, -3, 'en');
    assert.equal(negative.url, 'https://exponent-dimensions.rovisoft.net/#b=2&e=3&lang=en');
    assert.equal(negative.adjusted, true);
    assert.equal(M.dimensionsLink(0, 4).url, 'https://exponent-dimensions.rovisoft.net/#b=1&e=3');
    assert.equal(M.dimensionsLink(0, 4).adjusted, true);
});
