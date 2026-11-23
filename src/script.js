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
        cancelHint.textContent = reason || `Anima ${base}${M.toSuperscript(Math.abs(exponent))} · `
            + `${base}${M.toSuperscript(-Math.abs(exponent))} = ${base}⁰ = 1.`;
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

    function unitZoom() {
        return Math.min(MAX_UNIT_PX, M.fitZoom(1, 1, view.width, view.height));
    }

    function zoomFor(currentScene) {
        if (currentScene.mode === 'compression') {
            // Microscopio: la unidad ocupa todo el lienzo para ver las partes.
            return M.fitZoom(1, 1, view.width, view.height);
        }
        const { width, height } = currentScene.layout;
        return Math.min(MAX_UNIT_PX, M.fitZoom(width, height, view.width, view.height));
    }

    function update() {
        stopCancellation();
        const { base, exponent } = readControls();
        const info = M.describe(base, exponent);
        updateText(base, exponent, info);
        updateCancellationControl(base, exponent);
        scene = buildScene(base, exponent, info);
        camera.target = zoomFor(scene);
        requestFrame();
    }

    // ----------------------------------------------------------- Cancelación

    // hold: se ven las n^k unidades; morph: cada una se comprime a 1/n^k sin
    // mover la cámara, para ver que juntas ocupan una sola unidad original;
    // zoom: la cámara se acerca a esa unidad; merge: las partes se funden en 1.
    const PHASES = { hold: 900, morph: 2400, zoom: 1000, merge: 900 };
    const TOTAL = PHASES.hold + PHASES.morph + PHASES.zoom + PHASES.merge;

    function startCancellation() {
        const { base, exponent } = readControls();
        const steps = Math.abs(exponent);
        const count = M.intPow(base, steps);
        const from = M.expansionLayout(base, base === 1 ? 0 : steps);
        const to = M.partitionLayout(base, base === 1 ? 0 : steps, 1);
        const reciprocal = M.formatReciprocal(count);

        cancellation = {
            base,
            count,
            from,
            to,
            zoomFrom: Math.min(MAX_UNIT_PX, M.fitZoom(from.width, from.height, view.width, view.height)),
            start: performance.now() - (reducedMotion.matches ? TOTAL : 0),
            phase: null,
            texts: count === 1
                ? {
                    hold: `Empiezas con ${base}${M.toSuperscript(steps)} = 1: una sola unidad.`,
                    morph: `Multiplicar por ${base}${M.toSuperscript(-steps)} = 1 no cambia su tamaño.`,
                    merge: 'La unidad sigue igual: regresas a 1.',
                }
                : {
                    hold: `Empiezas con ${base}${M.toSuperscript(steps)}: ${count} unidades de valor 1.`,
                    morph: `Multiplicar por ${base}${M.toSuperscript(-steps)} comprime cada unidad a ${reciprocal.fraction} de su tamaño.`,
                    merge: `Las ${count} partes de ${reciprocal.fraction} encajan exactamente en una unidad: regresas a 1.`,
                },
        };

        renderEquation(mathDisplay, [
            String(base), { sup: steps }, ' · ', String(base), { sup: -steps },
            ' = ', String(base), { sup: 0 }, ' = 1',
        ]);
        mathDisplay.dataset.kind = 'unit';
        const product = base === 1 || steps === 1 ? String(base) : `(${Array(steps).fill(base).join(' × ')})`;
        formulaText.textContent = `${product} × 1 / ${product} = 1`;
        canvas.setAttribute('aria-label',
            `Animación de cancelación: ${count} unidades se comprimen y forman exactamente una unidad.`);
        cancelButton.textContent = 'Repetir animación';
        requestFrame();
    }

    function stopCancellation() {
        cancellation = null;
    }

    function setPhaseText(phase) {
        if (cancellation.phase !== phase) {
            cancellation.phase = phase;
            resultExplanation.textContent = cancellation.texts[phase];
        }
    }

    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp01 = (t) => Math.min(1, Math.max(0, t));

    function lerpRect(a, b, t, offsetA, offsetB) {
        return {
            x: lerp(a.x - offsetA.x, b.x - offsetB.x, t),
            y: lerp(a.y - offsetA.y, b.y - offsetB.y, t),
            w: lerp(a.w, b.w, t),
            h: lerp(a.h, b.h, t),
        };
    }

    /** Dibuja la animación; devuelve true mientras no termine. */
    function drawCancellation(now) {
        const c = cancellation;
        const elapsed = now - c.start;
        const morphT = easeInOut(clamp01((elapsed - PHASES.hold) / PHASES.morph));
        const zoomT = easeInOut(clamp01((elapsed - PHASES.hold - PHASES.morph) / PHASES.zoom));
        const mergeT = clamp01((elapsed - PHASES.hold - PHASES.morph - PHASES.zoom) / PHASES.merge);

        if (elapsed < PHASES.hold) {
            setPhaseText('hold');
        } else if (mergeT === 0) {
            setPhaseText('morph');
        } else {
            setPhaseText('merge');
        }

        camera.zoom = Math.exp(lerp(Math.log(c.zoomFrom), Math.log(unitZoom()), zoomT));
        camera.target = camera.zoom;

        const offsetFrom = { x: c.from.width / 2, y: c.from.height / 2 };
        const offsetTo = { x: 0.5, y: 0.5 };

        const frameAlpha = 1 - mergeT;
        if (frameAlpha > 0) {
            c.from.frames.forEach((frame, i) => {
                const target = c.to.frames[i];
                const rect = lerpRect(frame, target, morphT, offsetFrom, offsetTo);
                rect.padX = lerp(frame.padX, target.padX, morphT);
                rect.padY = lerp(frame.padY, target.padY, morphT);
                drawFrame(rect, frame.level, frameAlpha);
            });
        }

        const labelsVisible = morphT === 0;
        c.from.cells.forEach((cell, i) => {
            const rect = lerpRect(cell, c.to.cells[i], morphT, offsetFrom, offsetTo);
            const label = labelsVisible ? String(i + 1) : '';
            drawCell(rect, GROUP_COLORS[cell.group % GROUP_COLORS.length], 1 - mergeT, label, 1 - mergeT);
        });

        const unitRect = { x: -0.5, y: -0.5, w: 1, h: 1 };
        if (morphT > 0 && mergeT < 1) {
            // Destino: el tamaño de una sola unidad original.
            ctx.save();
            ctx.globalAlpha = Math.min(morphT * 2, 1) * (1 - mergeT);
            drawOutline(unitRect, COLOR_UNIT, 'Unidad (1)');
            ctx.restore();
        }
        if (mergeT > 0) {
            drawCell(unitRect, COLOR_UNIT, mergeT, '1');
        }

        return elapsed < TOTAL;
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
            drawOutline(centered({ x: 0, y: 0, w: 1, h: 1 }), COLOR_PARTITION, 'Unidad (1)');
            const label = `1/${scene.count}`;
            layout.cells.forEach((cell) => {
                const highlighted = cell.index === 0;
                const color = highlighted ? COLOR_PARTITION : GROUP_COLORS[cell.group % GROUP_COLORS.length];
                drawCell(centered(cell), color, highlighted ? 1 : 0.45, label);
            });
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
            if (cancellation) {
                const { from } = cancellation;
                cancellation.zoomFrom = Math.min(MAX_UNIT_PX, M.fitZoom(from.width, from.height, view.width, view.height));
            }
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

    // ---------------------------------------------------------------- Inicio

    baseSlider.addEventListener('input', update);
    exponentSlider.addEventListener('input', update);
    cancelButton.addEventListener('click', startCancellation);
    setupFullscreen();

    new ResizeObserver(resize).observe(canvasContainer);
    resize();
    update();
})();
