# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
