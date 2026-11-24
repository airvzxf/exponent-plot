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

/**
 * Chrome a veces no arranca a tiempo en los runners de GitHub (se vio una
 * vez en el release v1.0.0). Se reintenta una vez mostrando su salida para
 * que, si vuelve a fallar, el log diga por qué.
 */
async function launchChrome() {
    const options = {
        executablePath,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
        timeout: 60_000,
    };
    try {
        return await puppeteer.launch(options);
    } catch (err) {
        console.error(`Chrome no arrancó (${err.message}); reintentando con su salida visible.`);
        return puppeteer.launch({ ...options, dumpio: true });
    }
}

let browser;
let page;
const errors = [];

before(async () => {
    assert.ok(executablePath, `no se encontró Chrome; define CHROME_PATH (probé: ${CANDIDATES.join(', ')})`);
    browser = await launchChrome();
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

test('con exponente negativo las piezas conservan su color', async () => {
    // 2^-2: la unidad se parte en 2 × 2; la pieza de arriba a la derecha es
    // del paso 1 (índigo #818cf8). Se mide un punto de su relleno lejos de
    // la etiqueta; antes salía oscurecida (opacidad 0.45).
    await setControls(2, -2);
    const pixel = await page.$eval('#exponent-canvas', (canvas) => {
        const width = canvas.width / devicePixelRatio;
        const height = canvas.height / devicePixelRatio;
        const zoom = Math.min(width, height) * 0.85;
        const x = Math.round((width / 2 + zoom * 0.15) * devicePixelRatio);
        const y = Math.round((height / 2 - zoom * 0.43) * devicePixelRatio);
        return [...canvas.getContext('2d').getImageData(x, y, 1, 1).data];
    });
    const [r, g, b, a] = pixel;
    assert.equal(a, 255);
    for (const [actual, expected] of [[r, 0x81], [g, 0x8c], [b, 0xf8]]) {
        assert.ok(Math.abs(actual - expected) <= 3, `pixel ${pixel} no es #818cf8`);
    }
});

test('la cancelación termina en la unidad', async () => {
    await setControls(3, 2);
    await page.click('#cancellation-btn');
    await settle();
    assert.equal(await text('math-display'), '32 · 3−2 = 30 = 1');
    assert.equal(await text('formula-text'), '9 × 1/9 = 1');
    assert.match(await text('result-explanation'), /regresas a la unidad/);

    // Desde un exponente negativo se construye: la pieza se repite.
    await setControls(2, -3);
    await page.click('#cancellation-btn');
    await settle();
    assert.equal(await text('math-display'), '2−3 · 23 = 20 = 1');
    assert.equal(await text('formula-text'), '8 × 1/8 = 1');
    assert.match(await text('cancellation-hint'), /repitiendo la pieza 2 veces, 3 veces/);

    // Con base 1 no hay pasos, pero el cierre muestra la ecuación completa.
    await setControls(1, 2);
    await page.click('#cancellation-btn');
    await settle();
    assert.equal(await text('math-display'), '12 · 1−2 = 10 = 1');

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

test('el estado se lee de la URL y el enlace a dimensiones lo sigue', async () => {
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${PAGE_URL}#b=3&e=-2&lang=en`);
    await settle();
    assert.equal(await text('math-display'), '3−2 = 1/9 ≈ 0.1111');
    const link = () => page.$eval('#dimensions-link', (a) => ({ href: a.href, text: a.textContent }));
    assert.deepEqual(await link(), {
        href: 'https://exponent-dimensions.rovisoft.net/#b=3&e=2&lang=en',
        text: 'Ver 3² en 1D, 2D y 3D →',
    });
    assert.match(await text('dimensions-note'), /no hay exponentes negativos/);

    // Mover un control actualiza la URL (conservando lang) y el enlace.
    await setControls(2, 3);
    assert.equal(await page.evaluate(() => location.hash), '#b=2&e=3&lang=en');
    assert.equal((await link()).href, 'https://exponent-dimensions.rovisoft.net/#b=2&e=3&lang=en');
    assert.doesNotMatch(await text('dimensions-note'), /Se muestra/);

    // Editar el hash a mano también cambia el dibujo; fuera de rango se ajusta.
    await page.evaluate(() => {
        location.hash = '#b=9&e=1';
    });
    await page.waitForFunction(() => document.getElementById('base-value').textContent === '4');
    assert.equal(await text('math-display'), '41 = 4');
});

test('teclado sobre el dibujo', async () => {
    await setControls(2, 3);
    await page.focus('#exponent-canvas');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await settle();
    assert.equal(await text('math-display'), '34 = 81');
    // En el límite no se sale del rango.
    await page.keyboard.press('ArrowRight');
    await settle();
    assert.equal(await text('exponent-value'), '4');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowLeft');
    await settle();
    assert.equal(await text('math-display'), '23 = 8');
    await page.keyboard.press('c');
    await settle();
    assert.equal(await text('math-display'), '23 · 2−3 = 20 = 1');
});

test('sin errores de JavaScript', () => {
    assert.deepEqual(errors, []);
});
