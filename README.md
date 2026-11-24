# Visualizador de Exponentes: Positivos y Negativos

Aplicación web interactiva que muestra la potencia como **expansión y compresión** geométrica: cada potencia es la repetición del bloque anterior `n` veces, y los exponentes negativos parten la unidad en piezas cada vez más pequeñas.

**Demo:** [exponent-plot.rovisoft.net](https://exponent-plot.rovisoft.net/)

## Características

- **Exponentes positivos ($n^k$): expansión.** $n^k$ se construye como $n$ copias de $n^{k-1}$, alternando la dirección en cada paso (horizontal, vertical, horizontal…). Cada paso tiene su color y un marco que agrupa el bloque anterior, así que con $k$ par se ve un cuadrado de cuadrados.
- **Exponentes negativos ($n^{-k}$): compresión.** La unidad se parte en $n$ partes, $k$ veces. La unidad queda fija y se resalta una sola pieza de valor $1/n^k$; el valor se muestra como fracción y decimal (`1/256 ≈ 0.0039`).
- **Principio de cancelación, paso a paso.** El botón *Ver cancelación* usa la misma regla que construye las potencias:
  - Desde $n^k$: multiplicar por $n^{-1}$ deshace una repetición. En cada paso las $n$ copias del bloque anterior se comprimen a $1/n$ y caben en el lugar de una sola ($2^4 \cdot 2^{-1} = 2^3$, luego $2^4 \cdot 2^{-2} = 2^2$…). Las piezas muestran su valor ($1/2$, $1/4$…) hasta que $n^k$ piezas de $1/n^k$ ocupan una unidad.
  - Desde $n^{-k}$: se parte de la pieza de $1/n^k$ y multiplicar por $n$ la repite $n$ veces, $k$ veces, hasta llenar la unidad. Las piezas que faltan quedan como siluetas tenues y cada copia llena la suya al llegar.
  - Al final las piezas se funden en un 1. La cámara sigue cada paso, así que incluso $4^4$ (256 piezas) se lee bien.
- **Enlaces compartibles:** el estado vive en la URL con el mismo formato que [exponent-dimensions](https://exponent-dimensions.rovisoft.net/), por ejemplo [`#b=3&e=-2`](https://exponent-plot.rovisoft.net/#b=3&e=-2). Los valores fuera de rango se ajustan (base 0–4, exponente −4…4).
- **Enlace a exponent-dimensions:** junto a la ecuación, lleva la misma potencia a la vista en 1D, 2D y 3D (base 1–10, exponente 0–3; un exponente negativo se lleva sin signo). Si se llegó desde allá con `lang=en`, el enlace de regreso conserva el idioma.
- **Teclado:** con el dibujo enfocado, <kbd>←</kbd> <kbd>→</kbd> cambian el exponente, <kbd>↑</kbd> <kbd>↓</kbd> la base y <kbd>C</kbd> anima la cancelación.
- **Casos especiales explicados:** $0^k = 0$, $0^{-k}$ indefinido (división entre cero), $0^0 = 1$ por convención y $1^k = 1$.

## Tecnologías

- **HTML5 Canvas** para el dibujo y las animaciones. El lienzo solo se vuelve a dibujar mientras algo se mueve.
- **CSS** con variables, diseño responsivo y soporte para `prefers-reduced-motion`.
- **JavaScript sin dependencias** en el navegador. La lógica pura (textos, formato y geometría) vive en `src/exponent-math.js` y se prueba con Node.

## Estructura

```
exponent-plot/
├── src/                     # Sitio publicado
│   ├── index.html
│   ├── style.css
│   ├── exponent-math.js     # Lógica pura (sin DOM): textos, geometría y URL
│   ├── og-image.png         # Vista previa al compartir (1200 × 630)
│   └── script.js            # Dibujo, animaciones e interfaz
├── test/
│   ├── unit/                # Lógica y versión de los recursos (node:test)
│   └── e2e/                 # Prueba de humo en Chrome sin interfaz
├── eslint.config.mjs
├── .stylelintrc.json
├── .htmlvalidate.json
├── lighthouserc.json
└── .github/workflows/
    ├── ci.yml               # actionlint, lint, pruebas, e2e y Lighthouse
    ├── codeql.yml           # análisis estático de JavaScript y de los workflows
    └── release.yml          # release desde una etiqueta firmada
```

## Cómo usar

Abre `src/index.html` en un navegador moderno, o sirve la carpeta:

```bash
npx serve src
```

Ajusta la **base** y el **exponente** con los controles laterales.

## Desarrollo

Requiere Node.js 22 o superior.

```bash
npm install                   # herramientas de desarrollo
npm run lint                  # ESLint, Stylelint y html-validate
npm test                      # pruebas unitarias (test/unit/)
npm run test:e2e              # prueba de humo en Chrome (test/e2e/)
npx @lhci/cli@0.16.0 autorun  # Lighthouse, como en CI
```

La prueba e2e busca Chrome o Chromium en las rutas habituales; si está en otro lugar, usa `CHROME_PATH=/ruta/al/navegador npm run test:e2e`.

### Versión de los recursos

El dominio sirve CSS y JS con caché de navegador de un año (el HTML no se guarda). Por eso `index.html` carga cada recurso con `?v=<versión>`, y una prueba unitaria exige que coincida con `version` de `package.json`. Al cambiar la versión, actualiza ambos.

## Despliegue

El sitio se publica con Cloudflare Pages, conectado al repositorio de GitHub: cada commit en `main` despliega la carpeta `src/` en producción, y cada PR tiene su vista previa en `*.exponent-plot.pages.dev`. No hay paso de compilación: se publican los archivos tal cual.

## Versiones

Las versiones siguen [SemVer](https://semver.org/lang/es/) y se anotan en [CHANGELOG.md](CHANGELOG.md).

Producción se publica en cuanto un PR llega a `main`, y el navegador guarda JS y CSS por un año. Por eso **la versión sube en el mismo PR que cambia JavaScript o CSS de `src/`** (un check de CI lo exige); ese PR es el de release. Los PRs que no tocan esos archivos (documentación, CI, pruebas, herramientas) no necesitan versión.

1. En el PR: sube `version` en `package.json` (y `package-lock.json` con `npm install --package-lock-only`), cambia los `?v=` de `src/index.html` a la misma versión y convierte `## [Unreleased]` en `## [X.Y.Z] - AAAA-MM-DD`.
2. Tras el merge, firma la etiqueta sobre el commit de `main` y súbela:

   ```bash
   git switch main && git pull --ff-only
   git tag -s vX.Y.Z -m "release: X.Y.Z"
   git push origin vX.Y.Z
   ```

El workflow `release.yml` comprueba que la etiqueta esté firmada por una clave de `.github/trusted-signers`, que apunte a un commit de `main` y que la versión y el CHANGELOG coincidan; después vuelve a pasar lint y pruebas, publica el sitio como `exponent-plot-X.Y.Z.tar.gz` con su procedencia (`gh attestation verify`) y verifica que producción sirva exactamente esos archivos.

## Licencia

[GNU AGPLv3](LICENSE).
