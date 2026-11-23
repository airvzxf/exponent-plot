// Prueba de humo en un Chrome real sin interfaz: abre src/index.html y
// recorre los estados principales. Usa el Chrome de CHROME_PATH o uno de
// las rutas habituales.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const PAGE_URL = pathToFileURL(fileURLToPath(new URL('../../src/index.html', import.meta.url))).href;
const CANDIDATES = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));

let browser;
let page;
const errors = [];

before(async () => {
    assert.ok(executablePath, `no se encontró Chrome; define CHROME_PATH (probé: ${CANDIDATES.join(', ')})`);
    browser = await puppeteer.launch({ executablePath, args: ['--no-sandbox'] });
    page = await browser.newPage();
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    });
    // Sin animaciones: cada estado se dibuja en el primer cuadro.
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(PAGE_URL);
});

after(async () => {
    await browser?.close();
});

const settle = () => page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

async function setControls(base, exponent) {
    await page.evaluate((b, k) => {
        for (const [id, value] of [['base-slider', b], ['exponent-slider', k]]) {
            const input = document.getElementById(id);
            input.value = value;
            input.dispatchEvent(new Event('input'));
        }
    }, base, exponent);
    await settle();
}

const text = (id) => page.$eval(`#${id}`, (el) => el.textContent.trim());

/** Píxeles pintados en el lienzo (alfa > 0). */
const paintedPixels = () => page.$eval('#exponent-canvas', (canvas) => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) {
            count++;
        }
    }
    return count;
});

test('carga sin errores y dibuja el estado inicial', async () => {
    await settle();
    assert.equal(await text('math-display'), '23 = 8');
    assert.ok(await paintedPixels() > 1000);
});

test('textos de los casos principales', async () => {
    const cases = [
        [4, 4, '44 = 256', '4 × 4 × 4 × 4'],
        [2, -3, '2−3 = 1/8 = 0.125', '1 / (2 × 2 × 2)'],
        [4, -4, '4−4 = 1/256 ≈ 0.0039', '1 / (4 × 4 × 4 × 4)'],
        [0, 3, '03 = 0', '0 × 0 × 0'],
        [0, -2, '0−2 = Indefinido', '1 / (0 × 0) = 1 / 0'],
        [0, 0, '00 = 1', '1'],
        [1, 3, '13 = 1', '1 × 1 × 1'],
    ];
    for (const [base, exponent, equation, formula] of cases) {
        await setControls(base, exponent);
        assert.equal(await text('math-display'), equation);
        assert.equal(await text('formula-text'), formula);
        assert.ok(await paintedPixels() > 0, `${base}^${exponent} no dibujó nada`);
    }
});

test('la cancelación termina en la unidad', async () => {
    await setControls(3, 2);
    await page.click('#cancellation-btn');
    await settle();
    assert.equal(await text('math-display'), '32 · 3−2 = 30 = 1');
    assert.match(await text('result-explanation'), /regresas a 1/);

    await setControls(0, 2);
    assert.equal(await page.$eval('#cancellation-btn', (b) => b.disabled), true);
});

test('el lienzo sigue el tamaño de su contenedor', async () => {
    const sizes = () => page.$eval('#exponent-canvas', (canvas) => {
        const rect = canvas.parentElement.getBoundingClientRect();
        return {
            canvas: [canvas.width / devicePixelRatio, canvas.height / devicePixelRatio],
            container: [Math.round(rect.width), Math.round(rect.height)],
        };
    });
    for (const [width, height] of [[1280, 900], [900, 700], [390, 844]]) {
        await page.setViewport({ width, height });
        await new Promise((resolve) => setTimeout(resolve, 200));
        await settle();
        const { canvas, container } = await sizes();
        assert.deepEqual(canvas.map(Math.round), container, `${width}x${height}`);
    }
});

test('sin errores de JavaScript', () => {
    assert.deepEqual(errors, []);
});
