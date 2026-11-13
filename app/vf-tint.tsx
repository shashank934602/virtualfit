import { GARMENT_BRIGHT, GARMENT_MASK, GARMENT_WARMTH, IDENTITY } from "./vf-data";

/**
 * SVG filter that recolours only the garment pixels of an element.
 * `m` is the recolour matrix from tintMatrix(); the engine can also
 * update it live through the `[data-tint]` node's `values` attribute.
 *
 *   strict = bright, neutral pixels: certainly garment
 *   core   = strict, blurred and re-thresholded: specks (skin highlights) vanish
 *   near   = core, blurred and boosted: "within a few px of real garment"
 *   loose  = not-too-warm AND not-too-dark: garment incl. shadows lit warm by skin
 *   mask   = loose ∩ near → full-coverage edges and shadows, no specks, no skin
 *   out    = recoloured(mask) + original(outside mask)
 *            (arithmetic add keeps edges free of halos)
 */
export function TintFilter({ id, m = IDENTITY, b = GARMENT_BRIGHT }: { id: string; m?: string; b?: string }) {
  return (
    <filter id={id} colorInterpolationFilters="sRGB" x="0" y="0" width="1" height="1">
      <feColorMatrix in="SourceGraphic" type="matrix" values={GARMENT_MASK} result="strict" />
      <feGaussianBlur in="strict" stdDeviation="1.4" result="strictBlur" />
      <feComponentTransfer in="strictBlur" result="core">
        <feFuncA type="linear" slope="2.2" intercept="-0.75" />
      </feComponentTransfer>
      <feGaussianBlur in="core" stdDeviation="3" result="coreBlur" />
      <feComponentTransfer in="coreBlur" result="near">
        <feFuncA type="linear" slope="6" intercept="0" />
      </feComponentTransfer>
      <feColorMatrix in="SourceGraphic" type="matrix" values={GARMENT_WARMTH} result="warm" />
      <feColorMatrix in="SourceGraphic" type="matrix" values={b} result="bright" data-bright="" />
      <feComposite in="warm" in2="bright" operator="in" result="loose" />
      <feComposite in="loose" in2="near" operator="in" result="mask" />
      <feColorMatrix in="SourceGraphic" type="matrix" values={m} result="tint" data-tint="" />
      <feComposite in="tint" in2="mask" operator="in" result="tm" />
      <feComposite in="SourceGraphic" in2="mask" operator="out" result="rest" />
      <feComposite in="tm" in2="rest" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
    </filter>
  );
}
