# Product & try-on images (Google Flow)

The Bottoms, Outerwear, Shoes and Accessories tabs already work, but they show
placeholder drawings until you add real images. Here's the whole process:

1. Generate each image in **Google Flow** with the prompts below.
2. Save it into this folder with the exact file name shown, e.g. `bottoms/product-1.png`.
3. Run `npm run assets`.
4. Reload the site.

`npm run assets` removes the green background, crops and sizes everything,
and measures each garment's shade for the colour picker. It writes the images
to `public/vf/` and their list to `app/vf-assets.json`. You can add images a
few at a time: anything missing keeps its placeholder.

## Rules that make it look right

- **Flat, pure green background (#00FF00)** on every image. Don't add a floor,
  shadows on the backdrop or a gradient. The script keys the green out.
- **Generate each product in the light colour named in its prompt** (white,
  ecru, light grey…). The site makes the other colours itself, so a navy
  version is never generated separately.
- **Try-on photos (`fit-N`) need the same man.** Upload
  `model-reference.png` from this folder as a reference ("ingredient") image
  with every fit prompt. Keep the framing: top of head to mid-thigh, facing the
  camera, arms down.
- One product per image, centred, nothing else in frame. PNG, JPG or WEBP all work.
- Shoes have no `fit` images, because the model is framed above the knee.

## Prompt templates

**Product, clothing (`product-N`), square 1:1:**

> Ghost-mannequin e-commerce product photo of **{ITEM}**, front view, perfectly
> centered, invisible mannequin, soft even studio lighting, natural fabric folds
> and soft shadows, no person, no hanger, no text, no logo, isolated on a flat
> solid pure green (#00FF00) chroma-key background, square 1:1.

**Product, shoes (`product-N`), square 1:1:**

> E-commerce product photo of a single **{ITEM}**, side profile facing right,
> centered, soft even studio lighting, no text, no logo, isolated on a flat solid
> pure green (#00FF00) chroma-key background, square 1:1.

**Product, accessories (`product-N`), square 1:1:**

> E-commerce product photo of **{ITEM}**, front three-quarter view, centered,
> soft even studio lighting, no person, no text, no logo, isolated on a flat solid
> pure green (#00FF00) chroma-key background, square 1:1.

**Try-on (`fit-N`), portrait 9:16, with `model-reference.png` attached:**

> Use the man in the reference image: keep his exact face, hair, beard, skin
> tone, build, pose and camera framing. He stands facing the camera, arms relaxed
> at his sides, wearing **{OUTFIT}**. Framed from just above the top of his head
> down to mid-thigh, cropped at mid-thigh, centered, same scale as the reference.
> Soft even studio lighting. Flat solid pure green (#00FF00) background. Portrait
> 9:16. No text, no logo.

## What to generate

### `bottoms/`
| File | {ITEM} for product-N | {OUTFIT} for fit-N |
|---|---|---|
| `product-1` / `fit-1` | ecru (off-white) relaxed-fit cotton chino trousers | a plain white crew-neck t-shirt, untucked, and ecru relaxed-fit cotton chino trousers |
| `product-2` / `fit-2` | ecru (off-white) straight-leg denim jeans | a plain white crew-neck t-shirt, untucked, and ecru straight-leg denim jeans |
| `product-3` / `fit-3` | bone (warm off-white) pleated wool trousers | a plain white crew-neck t-shirt, tucked in, and bone pleated wool trousers |
| `product-4` / `fit-4` | heather-grey cotton jogger pants with an elastic waistband | a plain white crew-neck t-shirt, untucked, and heather-grey cotton jogger pants |
| `product-5` / `fit-5` | white linen drawstring shorts | a plain white crew-neck t-shirt, untucked, and white linen drawstring shorts |

### `outerwear/`
| File | {ITEM} for product-N | {OUTFIT} for fit-N |
|---|---|---|
| `product-1` / `fit-1` | an ecru (off-white) denim trucker jacket | an ecru denim trucker jacket worn open over a plain white crew-neck t-shirt, with charcoal trousers |
| `product-2` / `fit-2` | an off-white nylon bomber jacket | an off-white nylon bomber jacket worn open over a plain white crew-neck t-shirt, with charcoal trousers |
| `product-3` / `fit-3` | an ecru cotton-canvas chore coat with patch pockets | an ecru canvas chore coat worn open over a plain white crew-neck t-shirt, with charcoal trousers |
| `product-4` / `fit-4` | a white quilted puffer vest | a white quilted puffer vest, zipped, over a plain white crew-neck t-shirt, with charcoal trousers |
| `product-5` / `fit-5` | a light-grey wool single-breasted overcoat | a light-grey wool overcoat worn open over a plain white crew-neck t-shirt, with charcoal trousers |

### `shoes/` (products only)
| File | {ITEM} |
|---|---|
| `product-1` | white leather low-top sneaker with a white sole |
| `product-2` | white canvas high-top sneaker with a white rubber sole |
| `product-3` | light-grey suede penny loafer |
| `product-4` | white knit running shoe with a white foam sole |
| `product-5` | light-grey suede chelsea boot |

### `accessories/`
| File | {ITEM} for product-N | {OUTFIT} for fit-N |
|---|---|---|
| `product-1` / `fit-1` | a white cotton baseball cap | a white cotton baseball cap, a plain white crew-neck t-shirt and charcoal trousers |
| `product-2` / `fit-2` | a cream ribbed-knit beanie | a cream ribbed-knit beanie, a plain white crew-neck t-shirt and charcoal trousers |
| `product-3` / `fit-3` | a natural-canvas tote bag | a plain white crew-neck t-shirt and charcoal trousers, with a natural-canvas tote bag on his right shoulder |
| `product-4` / `fit-4` | a light-grey wool scarf, loosely folded | a light-grey wool scarf draped around his neck, a plain white crew-neck t-shirt and charcoal trousers |
| `product-5` / `fit-5` | a white nylon crossbody bag | a white nylon crossbody bag worn across his chest, a plain white crew-neck t-shirt and charcoal trousers |

## Changing names, prices or colours

These live in `app/vf-data.ts` (`CATEGORIES`). Keep the **first** colour of each
item as the colour you generated; the others are made from it.
