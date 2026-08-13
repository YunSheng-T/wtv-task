/**
 * Liquid-glass specular tracking.
 *
 * Feeds the pointer position into `--mx` / `--my` custom properties on the
 * hovered lens/button so the specular highlight in glass.css follows the
 * cursor — the way light slides across a curved liquid surface. Elements
 * the pointer leaves keep their resting top sheen (the default --my of
 * -160% parks the highlight above the element).
 */

const SELECTOR = '.lens, .glass-btn, .accent-btn';

export function attachSpecularTracking(): () => void {
  let raf = 0;
  let pending: PointerEvent | null = null;
  let active: HTMLElement | null = null;

  const reset = (el: HTMLElement) => {
    el.style.setProperty('--mx', '50%');
    el.style.setProperty('--my', '-160%');
  };

  const flush = () => {
    raf = 0;
    const e = pending;
    pending = null;
    if (!e) return;

    const target = e.target instanceof Element ? e.target.closest(SELECTOR) : null;

    if (target !== active) {
      if (active) reset(active);
      active = target instanceof HTMLElement ? target : null;
    }
    if (!active) return;

    const rect = active.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    active.style.setProperty('--mx', `${x.toFixed(2)}%`);
    active.style.setProperty('--my', `${y.toFixed(2)}%`);
  };

  const onMove = (e: PointerEvent) => {
    pending = e;
    if (!raf) raf = requestAnimationFrame(flush);
  };

  const onLeave = () => {
    pending = null;
    if (active) {
      reset(active);
      active = null;
    }
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);

  return () => {
    window.removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    if (raf) cancelAnimationFrame(raf);
  };
}
