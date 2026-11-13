# VirtualFit

A spatial, visionOS-style virtual try-on built with Next.js. Glass garment cards curve around a model in a 3D arc. When a garment lands in the centre, a scan line sweeps down and reveals him wearing it.

- **Arc:** drag, flick, scroll, use the arrow keys or the arrow buttons, or click a card.
- **Colours:** recolour the garment on the model. Folds and shading are kept, and skin, hair and trousers are left alone.
- **Tabs:** Tops, Bottoms, Outerwear, Shoes and Accessories, each with its own products, sizes and colours.
- **Shopping:** a bag with quantities and a subtotal, fitting booking and a fit profile that recommends a size. These are saved in the browser.

## Run it

```bash
npm install
npm run dev     # http://localhost:3000
```

## How it's built

| File | Role |
|---|---|
| `app/virtual-fit.tsx` | Top-level component: bag, booking, profile and toast state. Renders the scene, rail and panels |
| `app/vf-engine.ts` | Vanilla-JS animation engine: arc maths, category switching, try-on scan, buy card, cursor, input |
| `app/vf-data.ts` | Catalogue (`CATEGORIES`) and the recolouring maths |
| `app/vf-tint.tsx` | SVG filter that recolours only garment pixels |
| `app/vf-panels.tsx` | Tool rail plus the Bag, Fitting and Profile panels |
| `app/globals.css` | All styling |

React renders the markup once. The engine then animates it directly with `requestAnimationFrame` and the Web Animations API, so React never re-renders the scene.

## Product images

Tops use the bundled sprite sheets. The other tabs show placeholders until you add images. To add them, generate them in Google Flow (or any tool), put them in `assets-src/`, then run `npm run assets`. See [`assets-src/README.md`](assets-src/README.md) for the prompts and file names.
