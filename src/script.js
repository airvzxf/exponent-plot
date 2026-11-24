(function () {
    'use strict';

    const M = window.ExponentMath;

    const canvas = document.getElementById('exponent-canvas');
    const canvasContainer = canvas.parentElement;
    const ctx = canvas.getContext('2d');
    const baseSlider = document.getElementById('base-slider');
    const baseValue = document.getElementById('base-value');
    const exponentSlider = document.getElementById('exponent-slider');
    const exponentValue = document.getElementById('exponent-value');
    const mathDisplay = document.getElementById('math-display');
    const formulaText = document.getElementById('formula-text');
    const resultExplanation = document.getElementById('result-explanation');
    const cancelButton = document.getElementById('cancellation-btn');
    const cancelHint = document.getElementById('cancellation-hint');
    const container = document.getElementById('main-container');
    const fullscreenButton = document.getElementById('fullscreen-btn');
    const dimensionsLink = document.getElementById('dimensions-link');
    const dimensionsNote = document.getElementById('dimensions-note');

    // Tamaño máximo en pantalla de una unidad (px) cuando hay que alejarse.
    const MAX_UNIT_PX = 200;
    // Constante de tiempo del zoom suave (ms).
    const ZOOM_TIME_CONSTANT = 120;

    // Un color por paso: la unidad original y las copias de cada repetición.
    const GROUP_COLORS = [
        '#38bdf8', // Paso 0 (azul): la unidad original
        '#818cf8', // Paso 1 (índigo)
        '#c084fc', // Paso 2 (violeta)
        '#fb7185', // Paso 3 (rosa)
        '#fbbf24', // Paso 4 (ámbar)
        '#34d399', // Paso 5 (esmeralda)
    ];
    const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const COLOR_UNIT = cssVar('--color-unit');
    const COLOR_EXPANSION = cssVar('--color-expansion');
    const COLOR_PARTITION = cssVar('--color-partition');
    const COLOR_ZERO = '#334155';
    const COLOR_UNDEFINED = '#ef4444';

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const view = { width: 0, height: 0 };
    const camera = { zoom: 0, target: 1 };
    let scene = null;
    let cancellation = null;
    let rafId = null;
    let lastFrameTime = null;
    // Idioma con el que llegó el visitante desde exponent-dimensions; se
    // devuelve en el enlace de regreso (esta página solo está en español).
    let incomingLang;

    // ---------------------------------------------------------------- Texto

    /** Escribe una ecuación con exponentes en <sup> sin usar innerHTML. */
    function renderEquation(element, parts) {
        element.replaceChildren(...parts.map((part) => {
            if (typeof part === 'string') {
                return document.createTextNode(part);
            }
            const sup = document.createElement('sup');
            sup.textContent = M.formatSigned(part.sup);
            return sup;
        }));
    }

    function readControls() {
        return { base: baseSlider.valueAsNumber, exponent: exponentSlider.valueAsNumber };
    }

    function updateText(base, exponent, info) {
        baseValue.textContent = base;
        exponentValue.textContent = M.formatSigned(exponent);
        renderEquation(mathDisplay, [String(base), { sup: exponent }, ` = ${info.resultText}`]);
        formulaText.textContent = info.formula;
        resultExplanation.textContent = info.explanation;
        canvas.setAttribute('aria-label', info.summary);
        mathDisplay.dataset.kind = info.kind;
    }

    function updateCancellationControl(base, exponent) {
        let reason = '';
        if (exponent === 0) {
            reason = 'Elige un exponente distinto de 0.';
        } else if (base === 0) {
            reason = `0${M.toSuperscript(-Math.abs(exponent))} no está definido: elige otra base.`;
        }
        cancelButton.disabled = reason !== '';
        cancelButton.textContent = 'Ver cancelación';
        const steps = Math.abs(exponent);
        const times = `${steps} ${steps === 1 ? 'vez' : 'veces'}`;
        cancelHint.textContent = reason || (exponent > 0
            ? `Paso a paso: ${base}${M.toSuperscript(steps)} · ${base}${M.toSuperscript(-steps)} = 1, dividiendo entre ${base}, ${times}.`
            : `Paso a paso: ${base}${M.toSuperscript(-steps)} · ${base}${M.toSuperscript(steps)} = 1, repitiendo la pieza ${base} veces, ${times}.`);
    }

    // --------------------------------------------------------------- Escena

    function buildScene(base, exponent, info) {
        if (info.kind === 'undefined' || info.kind === 'zero') {
            return {
                mode: 'special',
                layout: M.expansionLayout(1, 0),
                color: info.kind === 'zero' ? COLOR_ZERO : COLOR_UNDEFINED,
                label: info.kind === 'zero' ? '0' : '!',
            };
        }
        const steps = Math.abs(exponent);
        if (info.kind === 'compression') {
            return { mode: 'compression', base, count: info.count, layout: M.partitionLayout(base, steps, 1) };
        }
        // 'expansion', 'unit' y 'one': con base 1 solo hay una unidad.
        return { mode: 'expansion', base, layout: M.expansionLayout(base, base === 1 ? 0 : steps) };
    }

    function zoomFor(currentScene) {
        if (currentScene.mode === 'compression') {
            // Microscopio: la unidad ocupa todo el lienzo para ver las partes.
            return M.fitZoom(1, 1, view.width, view.height);
        }
        const { width, height } = currentScene.layout;
        return Math.min(MAX_UNIT_PX, M.fitZoom(width, height, view.width, view.height));
    }

    // ------------------------------------------------- URL y enlaces

    /** Aplica #b=&e=&lang= a los controles; devuelve true si cambió algo. */
    function applyHash() {
        const state = M.parseHashState(location.hash);
        if (state.lang) {
            incomingLang = state.lang;
        }
        let changed = false;
        if (state.base !== undefined && state.base !== baseSlider.valueAsNumber) {
            baseSlider.value = state.base;
            changed = true;
        }
        if (state.exponent !== undefined && state.exponent !== exponentSlider.valueAsNumber) {
            exponentSlider.value = state.exponent;
            changed = true;
        }
        return changed;
    }

    /** Guarda el estado en la URL sin crear entradas en el historial. */
    function writeHash(base, exponent) {
        const hash = `#${M.formatHashState({ base, exponent, lang: incomingLang })}`;
        if (location.hash !== hash) {
            history.replaceState(null, '', hash);
        }
    }

    function updateDimensionsLink(base, exponent) {
        const link = M.dimensionsLink(base, exponent, incomingLang);
        const power = `${link.base}${M.toSuperscript(link.exponent)}`;
        dimensionsLink.href = link.url;
        dimensionsLink.textContent = `Ver ${power} en 1D, 2D y 3D →`;
        let note = 'La misma potencia como línea, cuadrado o cubo en el visualizador de dimensiones.';
        if (link.adjusted) {
            const reasons = [];
            if (link.base !== base) {
                reasons.push(`allá la base empieza en ${link.base}`);
            }
            if (link.exponent !== exponent) {
                reasons.push(exponent < 0
                    ? 'allá no hay exponentes negativos'
                    : `allá el exponente llega hasta ${link.exponent}`);
            }
            note = `Se muestra ${power}: ${reasons.join(' y ')}.`;
        }
        dimensionsNote.textContent = note;
        dimensionsLink.title = note;
    }

    function update() {
        stopCancellation();
        const { base, exponent } = readControls();
        const info = M.describe(base, exponent);
        updateText(base, exponent, info);
        updateCancellationControl(base, exponent);
        writeHash(base, exponent);
        updateDimensionsLink(base, exponent);
        scene = buildScene(base, exponent, info);
        camera.target = zoomFor(scene);
        requestFrame();
    }

    // ----------------------------------------------------------- Cancelación

    // La cancelación se cuenta paso a paso, con la misma regla que construye
    // las potencias:
    // - Desde n^k (k > 0), "plegar": multiplicar por n^-1 deshace una
    //   repetición. Las n copias del bloque anterior se comprimen a 1/n y
    //   caben en el lugar de una sola. Tras k pliegues, n^k piezas de 1/n^k
    //   ocupan una unidad.
    // - Desde n^-k (k < 0), "construir": se parte de la pieza de 1/n^k y
    //   multiplicar por n la repite n veces. Tras k repeticiones, las piezas
    //   llenan la unidad.
    // Cada paso se mueve y luego se detiene con su ecuación y su
    // explicación; al final las piezas se funden en un 1. La cámara sigue la
    // huella de cada paso con el mismo tope que la vista normal: en potencias
    // pequeñas casi no se mueve (se ve el encogimiento) y en las grandes se
    // acerca para que las piezas sigan legibles.
    const TIMING = { start: 1600, move: 1100, hold: 1500, merge: 1100 };

    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp01 = (t) => Math.min(1, Math.max(0, t));
    const pow = (base, exponent) => `${base}${M.toSuperscript(exponent)}`;
    const fraction = (denominator) => (denominator === 1 ? '1' : `1/${denominator}`);

    /** Celdas y marcos de un layout con el origen en su centro. */
    function centeredLayout(layout) {
        const dx = layout.width / 2;
        const dy = layout.height / 2;
        return {
            cells: layout.cells.map((c) => ({ ...c, x: c.x - dx, y: c.y - dy })),
            frames: layout.frames.map((f) => ({ ...f, x: f.x - dx, y: f.y - dy })),
            unit: { x: -dx, y: -dy, w: 1, h: 1 },
        };
    }

    /** Plegar: de n^k a 1 dividiendo entre n, k veces. */
    function foldKeyframes(base, exponent) {
        const steps = base === 1 ? 0 : exponent;
        const count = M.intPow(base, steps);
        const keyframes = [];
        for (let j = 0; j <= steps; j++) {
            const folded = M.foldLayout(base, steps, j);
            const layout = centeredLayout(folded);
            const pieceValue = M.intPow(base, j);
            const remaining = M.intPow(base, steps - j);
            let equation;
            let text;
            if (j === 0) {
                equation = [String(base), { sup: exponent }, ` = ${count}`];
                text = count === 1
                    ? `Empiezas con ${pow(base, exponent)} = 1: una sola unidad. Multiplicar por ${pow(base, -exponent)} = 1 no la cambia.`
                    : `Empiezas con ${pow(base, exponent)}: ${count} unidades de valor 1. Multiplicar por ${pow(base, -exponent)} `
                        + `es dividir entre ${base}, ${exponent} ${exponent === 1 ? 'vez' : 'veces'}: cada división deshace una repetición.`;
            } else {
                equation = [String(base), { sup: exponent }, ' · ', String(base), { sup: -j }, ' = ', String(base), { sup: exponent - j }];
                if (j === steps) {
                    equation.push(' = 1');
                }
                text = `× ${pow(base, -1)} (${j} de ${steps}): las ${base} copias de ${pow(base, steps - j)} se comprimen a 1/${base} `
                    + `y caben en el lugar de una sola. Quedan ${count} piezas de ${fraction(pieceValue)}`
                    + (j === steps ? ': ocupan exactamente una unidad.' : ` = ${remaining}.`);
            }
            keyframes.push({
                cells: layout.cells.map((c) => ({ ...c, alpha: 1 })),
                frames: layout.frames.map((f) => ({ ...f, alpha: f.folded ? 0.25 : 1 })),
                unit: layout.unit,
                // Función y no valor: se recalcula si el lienzo cambia de tamaño.
                zoom: () => Math.min(MAX_UNIT_PX, M.fitZoom(folded.width, folded.height, view.width, view.height)),
                label: (i) => (j === 0 ? String(i + 1) : fraction(pieceValue)),
                equation,
                formula: j === 0 ? `${count} × 1` : `${count} × ${fraction(pieceValue)} = ${remaining}`,
                text,
            });
        }
        return keyframes;
    }

    /** Construir: de la pieza 1/n^k a la unidad repitiendo n veces, k veces. */
    function buildKeyframes(base, exponent) {
        const total = Math.abs(exponent);
        const steps = base === 1 ? 0 : total;
        const count = M.intPow(base, steps);
        const layout = centeredLayout(M.foldLayout(base, steps, steps));
        const keyframes = [];
        for (let j = 0; j <= steps; j++) {
            const visible = M.intPow(base, j);
            const value = M.intPow(base, steps - j);
            let equation;
            let text;
            if (j === 0) {
                equation = [String(base), { sup: exponent }, ` = ${fraction(count)}`];
                text = count === 1
                    ? `Empiezas con ${pow(base, exponent)} = 1: la unidad entera. Multiplicar por ${pow(base, total)} = 1 no la cambia.`
                    : `Empiezas con ${pow(base, exponent)}: una pieza de ${fraction(count)}. Multiplicar por ${pow(base, total)} `
                        + `es repetirla ${base} veces, ${total} ${total === 1 ? 'vez' : 'veces'}: la misma regla que construye las potencias.`;
            } else {
                equation = [String(base), { sup: exponent }, ' · ', String(base), { sup: j }, ' = ', String(base), { sup: j - steps }];
                equation.push(` = ${fraction(value)}`);
                text = `× ${base} (${j} de ${steps}): lo que hay se repite ${base} veces. Ahora son ${visible} piezas de ${fraction(count)}`
                    + (j === steps ? ': llenan la unidad.' : ` = ${fraction(value)}.`);
            }
            keyframes.push({
                // Una copia que todavía no existe espera, invisible, sobre la
                // pieza de la que saldrá.
                cells: layout.cells.map((c, i) => (i < visible
                    ? { ...c, alpha: 1 }
                    : { ...layout.cells[i % visible], index: c.index, group: c.group, alpha: 0 })),
                frames: layout.frames.map((f, i) => {
                    const first = (i - layout.frames.findIndex((g) => g.level === f.level)) * M.intPow(base, f.level);
                    return { ...f, alpha: f.level <= j && first < visible ? 0.6 : 0 };
                }),
                unit: layout.unit,
                zoom: () => M.fitZoom(1, 1, view.width, view.height),
                label: () => fraction(count),
                highlightFirst: true,
                equation,
                formula: `${visible} × ${fraction(count)} = ${fraction(value)}`,
                text,
            });
        }
        return keyframes;
    }

    function startCancellation() {
        const { base, exponent } = readControls();
        const building = exponent < 0;
        const keyframes = building ? buildKeyframes(base, exponent) : foldKeyframes(base, exponent);
        const last = keyframes.length - 1;

        const segments = [{ kind: 'hold', to: 0, duration: TIMING.start }];
        for (let j = 1; j <= last; j++) {
            segments.push({ kind: 'move', from: j - 1, to: j, duration: TIMING.move });
            segments.push({ kind: 'hold', to: j, duration: TIMING.hold });
        }
        segments.push({ kind: 'merge', to: last, duration: TIMING.merge });
        const total = segments.reduce((sum, seg) => sum + seg.duration, 0);

        const steps = Math.abs(exponent);
        const opening = building ? [base, -steps] : [base, steps];
        const closing = building ? [base, steps] : [base, -steps];
        cancellation = {
            base,
            building,
            keyframes,
            segments,
            total,
            shown: null,
            start: performance.now() - (reducedMotion.matches ? total : 0),
            mergeText: `${pow(...opening)} · ${pow(...closing)} = ${base}⁰ = 1: regresas a la unidad.`,
            mergeEquation: [String(base), { sup: opening[1] }, ' · ', String(base), { sup: closing[1] }, ' = ', String(base), { sup: 0 }, ' = 1'],
        };

        canvas.setAttribute('aria-label', building
            ? `Animación: la pieza ${pow(base, exponent)} se repite ${base} veces, ${steps} veces, hasta llenar la unidad.`
            : `Animación: ${pow(base, exponent)} se divide entre ${base}, ${steps} veces, hasta ocupar una unidad.`);
        cancelButton.textContent = 'Repetir animación';
        requestFrame();
    }

    function stopCancellation() {
        cancellation = null;
    }

    /** Ecuación, fórmula y explicación del paso; solo cuando cambia. */
    function showStep(key, keyframe) {
        if (cancellation.shown === key) {
            return;
        }
        cancellation.shown = key;
        if (key === 'merge') {
            renderEquation(mathDisplay, cancellation.mergeEquation);
            mathDisplay.dataset.kind = 'unit';
            formulaText.textContent = keyframe.formula;
            resultExplanation.textContent = cancellation.mergeText;
            return;
        }
        renderEquation(mathDisplay, keyframe.equation);
        mathDisplay.dataset.kind = 'unit';
        formulaText.textContent = keyframe.formula;
        resultExplanation.textContent = keyframe.text;
    }

    function lerpRect(a, b, t) {
        return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) };
    }

    /** Dibuja la animación; devuelve true mientras no termine. */
    function drawCancellation(now) {
        const c = cancellation;
        // Segmento actual y su avance t (0–1); al terminar, el último con t = 1.
        let elapsed = now - c.start;
        let segment = null;
        let t = 1;
        for (const candidate of c.segments) {
            if (elapsed < candidate.duration) {
                segment = candidate;
                t = clamp01(elapsed / candidate.duration);
                break;
            }
            elapsed -= candidate.duration;
        }
        segment = segment || c.segments[c.segments.length - 1];

        const from = c.keyframes[segment.kind === 'move' ? segment.from : segment.to];
        const to = c.keyframes[segment.to];
        const moveT = segment.kind === 'move' ? easeInOut(t) : 0;
        const mergeT = segment.kind === 'merge' ? t : 0;
        showStep(segment.kind === 'merge' ? 'merge' : `step-${segment.to}`, to);

        camera.zoom = Math.exp(lerp(Math.log(from.zoom()), Math.log(to.zoom()), moveT));
        camera.target = camera.zoom;

        const fade = 1 - mergeT;
        from.frames.forEach((frame, i) => {
            const target = to.frames[i];
            const alpha = lerp(frame.alpha, target.alpha, moveT) * fade;
            if (alpha > 0.01) {
                const rect = lerpRect(frame, target, moveT);
                rect.padX = lerp(frame.padX, target.padX, moveT);
                rect.padY = lerp(frame.padY, target.padY, moveT);
                drawFrame(rect, frame.level, alpha);
            }
        });

        const labelFrom = moveT < 0.5 ? from : to;
        from.cells.forEach((cell, i) => {
            const target = to.cells[i];
            const alpha = lerp(cell.alpha, target.alpha, moveT) * fade;
            if (alpha > 0.01) {
                const label = segment.kind === 'move' && moveT > 0.15 && moveT < 0.85 ? '' : labelFrom.label(i);
                drawCell(lerpRect(cell, target, moveT), GROUP_COLORS[cell.group % GROUP_COLORS.length], alpha, label, fade);
            }
        });
        if (to.highlightFirst && fade > 0.01) {
            ctx.save();
            ctx.globalAlpha = fade;
            drawHighlight(lerpRect(from.cells[0], to.cells[0], moveT), COLOR_PARTITION);
            ctx.restore();
        }

        const unitRect = lerpRect(from.unit, to.unit, moveT);
        if (fade > 0.01) {
            ctx.save();
            ctx.globalAlpha = fade;
            drawOutline(unitRect, COLOR_EXPANSION, 'Unidad (1)');
            ctx.restore();
        }
        if (mergeT > 0) {
            drawCell(unitRect, COLOR_UNIT, mergeT, '1');
        }

        return now - c.start < c.total;
    }

    // ------------------------------------------------------------- Dibujo

    function toScreen(rect) {
        const z = camera.zoom;
        return {
            x: view.width / 2 + rect.x * z,
            y: view.height / 2 + rect.y * z,
            w: rect.w * z,
            h: rect.h * z,
        };
    }

    function roundedRect(x, y, w, h, radius) {
        ctx.beginPath();
        if (ctx.roundRect && radius > 0.5) {
            ctx.roundRect(x, y, w, h, radius);
        } else {
            ctx.rect(x, y, w, h);
        }
    }

    /**
     * Dibuja una celda (rect en coordenadas del mundo, ya centradas).
     * paddingFactor = 0 elimina el margen interno para que las piezas se unan.
     */
    function drawCell(rect, color, alpha = 1, label = '', paddingFactor = 1) {
        const s = toScreen(rect);
        const pad = Math.min(s.w, s.h) * 0.05 * paddingFactor;
        const w = Math.max(0.75, s.w - pad * 2);
        const h = Math.max(0.75, s.h - pad * 2);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        roundedRect(s.x + pad, s.y + pad, w, h, Math.min(w, h) * 0.1 * paddingFactor);
        ctx.fill();
        if (Math.min(w, h) > 6) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        if (label) {
            const fontSize = Math.min(h * 0.4, (w * 1.2) / label.length);
            if (fontSize >= 9) {
                ctx.fillStyle = 'white';
                ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, s.x + s.w / 2, s.y + s.h / 2);
            }
        }
        ctx.restore();
    }

    /** Contorno grueso sobre el borde de una celda dibujada con drawCell. */
    function drawHighlight(rect, color) {
        const s = toScreen(rect);
        const pad = Math.min(s.w, s.h) * 0.05;
        const w = Math.max(0.75, s.w - pad * 2);
        const h = Math.max(0.75, s.h - pad * 2);
        const lineWidth = Math.min(3, Math.max(1.5, Math.min(w, h) * 0.06));
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        roundedRect(s.x + pad, s.y + pad, w, h, Math.min(w, h) * 0.1);
        ctx.stroke();
        ctx.restore();
    }

    /** Marco de un bloque n^j: más grueso cuanto mayor es el nivel. */
    function drawFrame(frame, level, alpha = 1) {
        const s = toScreen({
            x: frame.x - frame.padX,
            y: frame.y - frame.padY,
            w: frame.w + frame.padX * 2,
            h: frame.h + frame.padY * 2,
        });
        if (Math.min(s.w, s.h) < 4) {
            return;
        }
        ctx.save();
        ctx.globalAlpha = alpha * Math.min(1, 0.3 + level * 0.15);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = Math.min(1 + level * 0.5, 3);
        roundedRect(s.x, s.y, s.w, s.h, Math.min(8, Math.min(s.w, s.h) * 0.08));
        ctx.stroke();
        ctx.restore();
    }

    /** Contorno punteado con una etiqueta encima (la unidad de referencia). */
    function drawOutline(rect, color, label) {
        const s = toScreen(rect);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(s.x - 3, s.y - 3, s.w + 6, s.h + 6);
        ctx.setLineDash([]);
        if (label) {
            ctx.fillStyle = color;
            ctx.font = '600 13px system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'bottom';
            ctx.fillText(label, s.x - 3, s.y - 8);
        }
        ctx.restore();
    }

    function drawScene() {
        const { layout } = scene;
        const offset = { x: layout.width / 2, y: layout.height / 2 };
        const centered = (r) => ({ ...r, x: r.x - offset.x, y: r.y - offset.y });

        if (scene.mode === 'special') {
            drawCell(centered(layout.cells[0]), scene.color, 0.5, scene.label);
            return;
        }

        const topLevel = layout.frames.length ? layout.frames[layout.frames.length - 1].level : 0;
        layout.frames.forEach((frame) => {
            // En compresión el contorno de la unidad sustituye al marco exterior.
            if (scene.mode !== 'compression' || frame.level < topLevel) {
                drawFrame(centered(frame), frame.level);
            }
        });

        if (scene.mode === 'compression') {
            drawOutline(centered({ x: 0, y: 0, w: 1, h: 1 }), COLOR_EXPANSION, 'Unidad (1)');
            // Mismos colores que en expansión (un color por paso). La pieza de
            // valor 1/n^k se marca con un contorno en lugar de oscurecer las
            // demás: el rosa de la partición también es el color del paso 3.
            const label = `1/${scene.count}`;
            layout.cells.forEach((cell) => {
                drawCell(centered(cell), GROUP_COLORS[cell.group % GROUP_COLORS.length], 1, label);
            });
            drawHighlight(centered(layout.cells[0]), COLOR_PARTITION);
            return;
        }

        layout.cells.forEach((cell) => {
            drawCell(centered(cell), GROUP_COLORS[cell.group % GROUP_COLORS.length], 1, String(cell.index + 1));
        });
        if (layout.cells.length > 1) {
            drawOutline(centered(layout.cells[0]), COLOR_EXPANSION, 'Unidad (1)');
        }
    }

    /** Acerca el zoom a su objetivo; devuelve true si aún se está moviendo. */
    function stepCamera(dt) {
        if (camera.zoom <= 0 || reducedMotion.matches) {
            camera.zoom = reducedMotion.matches ? camera.target : camera.target * 0.01;
        }
        const distance = Math.log(camera.target / camera.zoom);
        if (Math.abs(distance) < 0.001) {
            camera.zoom = camera.target;
            return false;
        }
        const factor = 1 - Math.exp(-dt / ZOOM_TIME_CONSTANT);
        camera.zoom *= Math.exp(distance * factor);
        return true;
    }

    function frame(now) {
        rafId = null;
        const dt = lastFrameTime === null ? 16 : Math.min(now - lastFrameTime, 100);
        lastFrameTime = now;

        ctx.clearRect(0, 0, view.width, view.height);
        let animating;
        if (cancellation) {
            animating = drawCancellation(now);
        } else {
            animating = stepCamera(dt);
            drawScene();
        }

        if (animating) {
            requestFrame();
        } else {
            lastFrameTime = null;
        }
    }

    /** El bucle solo corre mientras hay algo que animar. */
    function requestFrame() {
        if (rafId === null) {
            rafId = requestAnimationFrame(frame);
        }
    }

    function resize() {
        const rect = canvasContainer.getBoundingClientRect();
        view.width = rect.width || 400;
        view.height = rect.height || 400;
        const dpr = window.devicePixelRatio || 1;
        // CSS controla el tamaño visible (100%); aquí solo el búfer.
        canvas.width = Math.round(view.width * dpr);
        canvas.height = Math.round(view.height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (scene) {
            camera.target = zoomFor(scene);
        }
        requestFrame();
    }

    // ---------------------------------------------------- Pantalla completa

    function setupFullscreen() {
        if (!document.fullscreenEnabled || !container.requestFullscreen) {
            // iOS Safari no permite pantalla completa en elementos que no son <video>.
            fullscreenButton.hidden = true;
            return;
        }
        fullscreenButton.addEventListener('click', () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                container.requestFullscreen().catch((err) => {
                    console.error(`Error al intentar activar pantalla completa: ${err.message}`);
                });
            }
        });
        document.addEventListener('fullscreenchange', () => {
            const active = Boolean(document.fullscreenElement);
            const label = active ? 'Salir de pantalla completa' : 'Pantalla completa';
            fullscreenButton.setAttribute('aria-label', label);
            fullscreenButton.title = label;
            fullscreenButton.setAttribute('aria-pressed', String(active));
            // El ResizeObserver recalcula el lienzo y el zoom.
        });
    }

    // ------------------------------------------------------------ Teclado

    /** Mueve un slider un paso; devuelve true si su valor cambió. */
    function stepSlider(slider, delta) {
        const next = Math.min(Number(slider.max), Math.max(Number(slider.min), slider.valueAsNumber + delta));
        if (next === slider.valueAsNumber) {
            return false;
        }
        slider.value = next;
        return true;
    }

    function onCanvasKey(event) {
        if (event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }
        const steps = {
            ArrowLeft: [exponentSlider, -1],
            ArrowRight: [exponentSlider, 1],
            ArrowDown: [baseSlider, -1],
            ArrowUp: [baseSlider, 1],
        };
        if (steps[event.key]) {
            event.preventDefault();
            if (stepSlider(...steps[event.key])) {
                update();
            }
        } else if (event.key === 'c' || event.key === 'C') {
            event.preventDefault();
            if (!cancelButton.disabled) {
                startCancellation();
            }
        }
    }

    // ---------------------------------------------------------------- Inicio

    baseSlider.addEventListener('input', update);
    exponentSlider.addEventListener('input', update);
    cancelButton.addEventListener('click', startCancellation);
    canvas.addEventListener('keydown', onCanvasKey);
    window.addEventListener('hashchange', () => {
        if (applyHash()) {
            update();
        }
    });
    setupFullscreen();

    applyHash();
    new ResizeObserver(resize).observe(canvasContainer);
    resize();
    update();
})();
