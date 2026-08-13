/**
 * True liquid-glass refraction for Electron/Chromium.
 *
 * Technique (after shuding's and childrentime's liquid-glass): a rounded-rect
 * SDF defines the lens shape; a smoothstep displacement field pulls sampled
 * pixels toward the lens center near the rim (magnified core, bent edges);
 * the field is encoded into an RGBA map (R = horizontal shift, G = vertical)
 * on a canvas and fed to an SVG `feDisplacementMap`, referenced from
 * `backdrop-filter: url(#id)`. Maps are cached per element size.
 *
 * If `backdrop-filter: url()` is unsupported the inline style is rolled back
 * and the plain blur from glass.css remains as a graceful fallback.
 */

const SELECTOR = '.lens, .glass-btn, .accent-btn';
const DPI = 0.5; // displacement map resolution relative to element size
const MAX_FILTERS = 30;
const SVG_NS = 'http://www.w3.org/2000/svg';

let defs: SVGDefsElement | null = null;
let seq = 0;
const cache = new Map<string, string>(); // size key -> filter id (LRU)
const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) schedule(entry.target as HTMLElement);
});
const observed = new WeakSet<Element>();
const pending = new Set<HTMLElement>();
let raf = 0;

function smoothStep(a: number, b: number, t: number): number {
  t = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function roundedRectSDF(x: number, y: number, w: number, h: number, r: number): number {
  const qx = Math.abs(x) - w + r;
  const qy = Math.abs(y) - h + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function ensureDefs(): SVGDefsElement {
  if (defs) return defs;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  // position:absolute instead of display:none — some engines drop filter
  // resolution when the host svg is display:none.
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
  defs = document.createElementNS(SVG_NS, 'defs') as SVGDefsElement;
  svg.appendChild(defs);
  document.body.appendChild(svg);
  return defs;
}

function buildFilter(w: number, h: number, radius: number): string {
  const container = ensureDefs();
  const key = `${w}x${h}r${Math.round(radius)}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  if (cache.size >= MAX_FILTERS) {
    const oldestKey = cache.keys().next().value as string;
    const oldestId = cache.get(oldestKey) as string;
    cache.delete(oldestKey);
    container.querySelector(`#${oldestId}`)?.remove();
  }

  const cw = Math.max(2, Math.round(w * DPI));
  const ch = Math.max(2, Math.round(h * DPI));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(cw, ch);
  const data = img.data;

  const aspect = w / h;
  const rUV = Math.min(0.5, Math.max(0.08, radius / h));
  const raw = new Float32Array(cw * ch * 2);
  let maxScale = 0.0001;
  let k = 0;

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const ix = (x + 0.5) / cw - 0.5;
      const iy = (y + 0.5) / ch - 0.5;
      const dist = roundedRectSDF(ix * aspect, iy, 0.5 * aspect, 0.5, rUV);
      const disp = smoothStep(0.7, 0, dist - 0.1);
      const scaled = smoothStep(0, 1, disp);
      const dx = (ix * scaled + 0.5) * cw - (x + 0.5);
      const dy = (iy * scaled + 0.5) * ch - (y + 0.5);
      raw[k++] = dx;
      raw[k++] = dy;
      if (Math.abs(dx) > maxScale) maxScale = Math.abs(dx);
      if (Math.abs(dy) > maxScale) maxScale = Math.abs(dy);
    }
  }

  k = 0;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (raw[k++] / maxScale) * 128 + 128;
    data[i + 1] = (raw[k++] / maxScale) * 128 + 128;
    data[i + 2] = 0;
    data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const id = `lg-${++seq}`;
  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', id);
  filter.setAttribute('filterUnits', 'userSpaceOnUse');
  filter.setAttribute('x', '0');
  filter.setAttribute('y', '0');
  filter.setAttribute('width', String(w));
  filter.setAttribute('height', String(h));
  filter.setAttribute('color-interpolation-filters', 'sRGB');

  const feImage = document.createElementNS(SVG_NS, 'feImage');
  feImage.setAttribute('href', canvas.toDataURL());
  feImage.setAttribute('x', '0');
  feImage.setAttribute('y', '0');
  feImage.setAttribute('width', String(w));
  feImage.setAttribute('height', String(h));
  feImage.setAttribute('preserveAspectRatio', 'none');
  feImage.setAttribute('result', 'map');

  const feDisp = document.createElementNS(SVG_NS, 'feDisplacementMap');
  feDisp.setAttribute('in2', 'map');
  feDisp.setAttribute('scale', String(Math.min(maxScale / DPI, 30)));
  feDisp.setAttribute('xChannelSelector', 'R');
  feDisp.setAttribute('yChannelSelector', 'G');

  filter.appendChild(feImage);
  filter.appendChild(feDisp);
  container.appendChild(filter);
  cache.set(key, id);
  return id;
}

function flush(): void {
  raf = 0;
  for (const el of pending) {
    pending.delete(el);
    if (!el.isConnected) continue;
    const rect = el.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w < 12 || h < 12) continue;
    const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    const id = buildFilter(w, h, Math.min(radius, h / 2));
    const chain = `url(#${id}) blur(16px) saturate(150%) brightness(1.06)`;
    el.style.backdropFilter = chain;
    (el.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = chain;
    // Roll back when url() backdrop filters are unsupported → CSS blur fallback.
    if (!getComputedStyle(el).backdropFilter.includes('url')) {
      el.style.backdropFilter = '';
      (el.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = '';
    }
  }
}

function schedule(el: HTMLElement): void {
  pending.add(el);
  if (!raf) raf = requestAnimationFrame(flush);
}

function scan(root: ParentNode): void {
  const apply = (el: Element) => {
    if (observed.has(el)) return;
    observed.add(el);
    resizeObserver.observe(el);
    schedule(el as HTMLElement);
  };
  if (root instanceof HTMLElement && root.matches(SELECTOR)) apply(root);
  root.querySelectorAll(SELECTOR).forEach(apply);
}

export function attachLiquidGlass(): () => void {
  scan(document);
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) scan(node);
      });
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  return () => {
    mo.disconnect();
    resizeObserver.disconnect();
    if (raf) cancelAnimationFrame(raf);
  };
}
