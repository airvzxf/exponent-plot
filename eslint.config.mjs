import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['src/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: { ...globals.browser, module: 'readonly' },
        },
    },
    {
        files: ['test/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: globals.node,
        },
    },
    {
        files: ['test/**/*.mjs', '*.mjs'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            // Node y, dentro de page.evaluate(), el navegador.
            globals: { ...globals.node, ...globals.browser },
        },
    },
    {
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            eqeqeq: 'error',
            'prefer-const': 'error',
        },
    },
];
