'use strict';

// El dominio de producción sirve CSS y JS con caché de navegador de un año
// (el HTML no se guarda). Cada versión cambia la URL de los recursos con
// ?v=<version> para que nadie combine el HTML nuevo con un script viejo.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const localAssets = [...html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map((m) => m[1]);

test('index.html carga los recursos locales esperados', () => {
    const files = localAssets.map((url) => url.split('?')[0]).sort();
    assert.deepEqual(files, ['exponent-math.js', 'script.js', 'style.css']);
    for (const file of files) {
        assert.ok(fs.existsSync(path.join(root, 'src', file)), `falta src/${file}`);
    }
});

test('cada recurso local lleva ?v= con la versión de package.json', () => {
    for (const url of localAssets) {
        assert.equal(url.split('?')[1], `v=${version}`, url);
    }
});
