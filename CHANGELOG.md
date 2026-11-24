# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1] - 2026-11-24

### Fixed

- **Negative exponents showed the pieces darkened.** Every piece except the 1/n^k one was drawn at 45 % opacity, so the colors no longer matched the positive exponents. All pieces now keep their step's color, as for n^k, and the 1/n^k piece is marked with a pink outline instead. The pink fill used before was also the color of step 3, so with k = −3 or −4 a whole group looked highlighted.

## [1.1.0] - 2026-11-23

### Added

- **Shareable links.** The base and exponent live in the URL as `#b=<base>&e=<exponent>`, the same format as exponent-dimensions, so a link opens the same state. Out-of-range values are clamped to base 0–4 and exponent −4…4; invalid ones are ignored. Editing the hash by hand updates the drawing.
- **Link to exponent-dimensions.** Next to the equation, a link opens the same power in the 1D/2D/3D visualizer (base 1–10, exponent 0–3; a negative exponent is taken without its sign). A `lang` received from there is kept and sent back.
- **Keyboard.** With the drawing focused, the arrow keys change the exponent (← →) and the base (↑ ↓), and C runs the cancellation animation. A hint appears inside the drawing while it has focus.
- **Share preview.** Open Graph and Twitter metadata with a 1200 × 630 image, a canonical URL and an Apple touch icon.
- CodeQL analysis of the JavaScript and of the GitHub Actions workflows.
- CI check: a pull request that changes JavaScript or CSS in `src/` must also change the version, because production publishes on merge and browsers cache those files for a year.

### Changed

- The card can grow to 880 px tall on large screens, so more of the side panel fits without scrolling.

## [1.0.0] - 2026-11-23

### Added

- **Each power is built as n copies of the previous one.** n^k is drawn as n copies of the n^(k-1) block, alternating horizontal and vertical steps, with one color and a nested frame per step, so an even k gives a square of squares.
- **Negative exponents split a fixed unit.** The unit keeps its size and is divided into n^k pieces, with one 1/n^k piece highlighted; the value shows as a fraction and a decimal (`1/256 ≈ 0.0039`).
- **Cancellation animation.** The "Ver cancelación" button animates n^k · n^-k = n^0 = 1: the units shrink to 1/n^k of their size while the camera stays still, fit into one original unit, then merge.
- Explanations for the special cases 0^k, 0^-k (undefined), 0^0 = 1 (convention) and 1^k.
- SVG favicon.
- Release workflow: a signed `vX.Y.Z` tag on main publishes the site files with build provenance and checks that production serves them.

### Fixed

- The zoom now refits when the window is resized or fullscreen is toggled.
- 0^k showed `0.0000e+0`.
- The canvas could grow its container without limit.
- The fullscreen button is hidden where the Fullscreen API is unavailable (iOS).
- **Stale scripts after a deploy.** The production domain caches CSS and JS in the browser for a year while HTML is not cached; local assets now load with `?v=<version>`.

### Changed

- Accessibility: results announced with `aria-live`, a canvas label, labelled buttons and underlined footer links. Lighthouse scores 100 in every category.
- The project name is the same everywhere: "Visualizador de Exponentes: Positivos y Negativos".

[Unreleased]: https://github.com/airvzxf/exponent-plot/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/airvzxf/exponent-plot/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/airvzxf/exponent-plot/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/airvzxf/exponent-plot/releases/tag/v1.0.0
