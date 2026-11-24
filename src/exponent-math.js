/*
 * Lógica pura del visualizador: textos, formato de números y geometría.
 * No toca el DOM, así que se puede probar con Node (`npm test`).
 *
 * Se carga como script clásico (window.ExponentMath) para que la app siga
 * funcionando al abrir `index.html` directamente con file://, y como módulo
 * CommonJS en las pruebas.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ExponentMath = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const LOCALE = 'es-MX';
    const TIMES = ' × ';
    const MINUS = '−';
    const MAX_DECIMALS = 4;

    /** n elevado a k para enteros no negativos, sin errores de coma flotante. */
    function intPow(base, exp) {
        let result = 1;
        for (let i = 0; i < exp; i++) {
            result *= base;
        }
        return result;
    }

    /** Número con signo tipográfico (− en lugar de -). */
    function formatSigned(value) {
        return value < 0 ? `${MINUS}${Math.abs(value)}` : String(value);
    }

    function formatNumber(value) {
        return value.toLocaleString(LOCALE, { maximumFractionDigits: MAX_DECIMALS });
    }

    /**
     * Valor de 1/denominator como fracción y decimal, indicando si el
     * decimal mostrado es exacto ("=") o una aproximación ("≈").
     */
    function formatReciprocal(denominator) {
        const value = 1 / denominator;
        const rounded = Math.round(value * 10 ** MAX_DECIMALS) / 10 ** MAX_DECIMALS;
        const exact = Math.abs(rounded - value) < 1e-12;
        return {
            fraction: `1/${denominator}`,
            decimal: formatNumber(value),
            exact,
            text: `1/${denominator} ${exact ? '=' : '≈'} ${formatNumber(value)}`,
        };
    }

    function repeatProduct(base, times) {
        return Array(times).fill(base).join(TIMES);
    }

    /**
     * Describe n^k para la interfaz.
     *
     * kind:
     *  - 'undefined'   0 con exponente negativo (división entre cero).
     *  - 'zero'        0 con exponente positivo.
     *  - 'unit'        exponente 0 (incluye la convención 0^0 = 1).
     *  - 'one'         base 1 con exponente distinto de 0.
     *  - 'expansion'   n >= 2, k > 0.
     *  - 'compression' n >= 2, k < 0.
     */
    function describe(base, exponent) {
        const absExp = Math.abs(exponent);
        const count = intPow(base, absExp);
        const power = `${base}^${formatSigned(exponent)}`;

        if (base === 0 && exponent < 0) {
            return {
                kind: 'undefined',
                count: 0,
                resultText: 'Indefinido',
                formula: absExp === 1 ? '1 / 0' : `1 / (${repeatProduct(0, absExp)}) = 1 / 0`,
                explanation: 'No se puede partir la unidad en 0 partes: la división entre cero no está definida.',
                summary: `${power} no está definido: es una división entre cero.`,
            };
        }

        if (exponent === 0) {
            const explanation = base === 0
                ? 'Por convención 0⁰ = 1: con exponente 0 no se multiplica nada (producto vacío) y queda la unidad.'
                : 'Con exponente 0 no se repite ni se parte nada: queda la unidad base (1).';
            return {
                kind: 'unit',
                count: 1,
                resultText: '1',
                formula: '1',
                explanation,
                summary: `${power} es igual a 1: la unidad base.`,
            };
        }

        if (base === 0) {
            return {
                kind: 'zero',
                count: 0,
                resultText: '0',
                formula: repeatProduct(0, absExp),
                explanation: 'Repetir algo 0 veces no deja nada: el resultado es 0.',
                summary: `${power} es igual a 0.`,
            };
        }

        if (base === 1) {
            const verb = exponent > 0 ? 'Repetir la unidad 1 vez' : 'Partir la unidad en 1 parte';
            return {
                kind: 'one',
                count: 1,
                resultText: '1',
                formula: exponent > 0 ? repeatProduct(1, absExp) : `1 / (${repeatProduct(1, absExp)})`,
                explanation: `${verb} la deja igual: 1 elevado a cualquier exponente es 1.`,
                summary: `${power} es igual a 1.`,
            };
        }

        if (exponent > 0) {
            const previous = `${base}${toSuperscript(exponent - 1)}`;
            return {
                kind: 'expansion',
                count,
                resultText: formatNumber(count),
                formula: repeatProduct(base, absExp),
                explanation: `La unidad se expande: ${base}${toSuperscript(exponent)} son ${base} copias de ${previous}. `
                    + `Tienes ${formatNumber(count)} unidades de valor 1.`,
                summary: `${power} es igual a ${formatNumber(count)}: ${count} unidades de valor 1.`,
            };
        }

        const reciprocal = formatReciprocal(count);
        const times = absExp === 1 ? 'una vez' : `${absExp} veces`;
        return {
            kind: 'compression',
            count,
            resultText: reciprocal.text,
            formula: absExp === 1 ? `1 / ${base}` : `1 / (${repeatProduct(base, absExp)})`,
            explanation: `La unidad se comprime: se parte en ${base} partes, ${times}. `
                + `Tienes ${count} partes de valor ${reciprocal.fraction}.`,
            summary: `${power} es igual a ${reciprocal.text}: la unidad partida en ${count} partes.`,
        };
    }

    const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

    function toSuperscript(value) {
        const digits = String(Math.abs(value))
            .split('')
            .map((d) => SUPERSCRIPT_DIGITS[Number(d)])
            .join('');
        return value < 0 ? `⁻${digits}` : digits;
    }

    /** Dígito `position` de `index` escrito en base `base`. */
    function digitAt(index, base, position) {
        return Math.floor(index / intPow(base, position)) % base;
    }

    /**
     * Paso en el que apareció la unidad `index` al construir n^k repitiendo
     * n veces el bloque anterior: 0 para la unidad original y j para las
     * copias creadas en el paso j (índices de n^(j-1) a n^j - 1).
     */
    function groupOf(index, base) {
        if (index <= 0 || base < 2) {
            return 0;
        }
        let group = 0;
        let remaining = index;
        while (remaining > 0) {
            remaining = Math.floor(remaining / base);
            group++;
        }
        return group;
    }

    /** Los pasos impares repiten en horizontal y los pares en vertical. */
    function isHorizontalStep(step) {
        return step % 2 === 1;
    }

    /**
     * Geometría de n^k construido como n copias de n^(k-1), alternando
     * dirección en cada paso. La unidad mide 1 × 1 y entre las copias del
     * paso j hay un hueco de gapRatio × ⌈j/2⌉ para que se lean los grupos.
     *
     * Devuelve las celdas (una por unidad), los marcos de cada bloque n^j
     * (1 <= j <= k, con el margen padX/padY que los separa del contenido)
     * y el tamaño total. Coordenadas con origen arriba a la
     * izquierda.
     */
    function expansionLayout(base, steps, gapRatio = 0.12) {
        const widths = [1];
        const heights = [1];
        const gaps = [0];
        for (let step = 1; step <= steps; step++) {
            // El hueco crece cada dos pasos para que con k par quede un cuadrado.
            const gap = gapRatio * Math.ceil(step / 2);
            gaps.push(gap);
            if (isHorizontalStep(step)) {
                widths.push(base * widths[step - 1] + (base - 1) * gap);
                heights.push(heights[step - 1]);
            } else {
                widths.push(widths[step - 1]);
                heights.push(base * heights[step - 1] + (base - 1) * gap);
            }
        }

        const count = intPow(base, steps);
        const cells = [];
        for (let index = 0; index < count; index++) {
            let x = 0;
            let y = 0;
            for (let step = 1; step <= steps; step++) {
                const digit = digitAt(index, base, step - 1);
                if (isHorizontalStep(step)) {
                    x += digit * (widths[step - 1] + gaps[step]);
                } else {
                    y += digit * (heights[step - 1] + gaps[step]);
                }
            }
            cells.push({ index, x, y, w: 1, h: 1, group: groupOf(index, base) });
        }

        const frames = [];
        if (base >= 2) {
            for (let level = 1; level <= steps; level++) {
                const size = intPow(base, level);
                for (let first = 0; first < count; first += size) {
                    const origin = cells[first];
                    // Crece con el nivel (marcos anidados) sin llegar a la mitad del
                    // hueco que separa este bloque de sus vecinos.
                    const pad = gapRatio * (0.15 + 0.2 * (level - 1));
                    frames.push({
                        level,
                        x: origin.x,
                        y: origin.y,
                        w: widths[level],
                        h: heights[level],
                        padX: pad,
                        padY: pad,
                    });
                }
            }
        }

        return {
            cells,
            frames,
            width: widths[steps],
            height: heights[steps],
            gaps,
        };
    }

    /**
     * Geometría de n^-k: la misma estructura que n^k pero comprimida dentro
     * de un cuadrado de lado `size`. Cada paso parte las piezas en n, en
     * horizontal o en vertical, así que las piezas pueden ser rectángulos.
     */
    function partitionLayout(base, steps, size = 1, gapRatio = 0.12) {
        const layout = expansionLayout(base, steps, gapRatio);
        const sx = size / layout.width;
        const sy = size / layout.height;
        const scale = (r) => ({ ...r, x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy });
        const scaleFrame = (f) => ({ ...scale(f), padX: f.padX * sx, padY: f.padY * sy });
        return {
            cells: layout.cells.map(scale),
            frames: layout.frames.map(scaleFrame),
            width: size,
            height: size,
            scaleX: sx,
            scaleY: sy,
        };
    }

    /** Cuántos píxeles por unidad hacen falta para que un rectángulo quepa. */
    function fitZoom(contentWidth, contentHeight, viewWidth, viewHeight, margin = 0.85) {
        if (contentWidth <= 0 || contentHeight <= 0) {
            return 1;
        }
        return Math.min((viewWidth * margin) / contentWidth, (viewHeight * margin) / contentHeight);
    }

    // ------------------------------------------------- Estado en la URL

    // Mismo formato que exponent-dimensions: #b=<base>&e=<exponente>&lang=<es|en>.
    const LIMITS = { baseMin: 0, baseMax: 4, exponentMin: -4, exponentMax: 4 };
    const LANGS = ['es', 'en'];
    const DIMENSIONS_URL = 'https://exponent-dimensions.rovisoft.net/';
    const DIMENSIONS_LIMITS = { baseMin: 1, baseMax: 10, exponentMax: 3 };

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    /** Entero decimal estricto ("3", "-2"); cualquier otra cosa da null. */
    function parseInteger(text) {
        return typeof text === 'string' && /^-?\d{1,3}$/.test(text) ? Number(text) : null;
    }

    /**
     * Lee el hash (con o sin "#"). Los números fuera de rango se ajustan al
     * más cercano; los inválidos o ausentes no aparecen en el resultado.
     */
    function parseHashState(hash) {
        const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
        const state = {};
        const base = parseInteger(params.get('b'));
        const exponent = parseInteger(params.get('e'));
        const lang = params.get('lang');
        if (base !== null) {
            state.base = clamp(base, LIMITS.baseMin, LIMITS.baseMax);
        }
        if (exponent !== null) {
            state.exponent = clamp(exponent, LIMITS.exponentMin, LIMITS.exponentMax);
        }
        if (LANGS.includes(lang)) {
            state.lang = lang;
        }
        return state;
    }

    /** Hash sin "#", en el orden b, e, lang (lang solo si se conoce). */
    function formatHashState({ base, exponent, lang }) {
        const params = new URLSearchParams({ b: String(base), e: String(exponent) });
        if (LANGS.includes(lang)) {
            params.set('lang', lang);
        }
        return params.toString();
    }

    /**
     * Enlace equivalente en exponent-dimensions (base 1–10, exponente 0–3):
     * se usa |k| porque allá no hay exponentes negativos.
     */
    function dimensionsLink(base, exponent, lang) {
        const target = {
            base: clamp(base, DIMENSIONS_LIMITS.baseMin, DIMENSIONS_LIMITS.baseMax),
            exponent: Math.min(Math.abs(exponent), DIMENSIONS_LIMITS.exponentMax),
            lang,
        };
        return {
            ...target,
            adjusted: target.base !== base || target.exponent !== exponent,
            url: `${DIMENSIONS_URL}#${formatHashState(target)}`,
        };
    }

    return {
        LIMITS,
        dimensionsLink,
        formatHashState,
        parseHashState,
        describe,
        expansionLayout,
        fitZoom,
        formatReciprocal,
        formatSigned,
        groupOf,
        intPow,
        partitionLayout,
        toSuperscript,
    };
});
