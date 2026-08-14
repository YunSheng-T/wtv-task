"""Procedurally render the wtv-task liquid-glass app icon (1024x1024)."""
import numpy as np
from PIL import Image, ImageFilter

S = 1024
SS = 4  # supersample
W = S * SS

def radial(xx, yy, cx, cy, r):
    return np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r

yy, xx = np.mgrid[0:W, 0:W].astype(np.float64)

# ---------- background: dark graphite vertical gradient with soft top light ----------
t = yy / W
bg = np.zeros((W, W, 3))
top = np.array([26, 26, 32]) / 255
bot = np.array([11, 11, 15]) / 255
for c in range(3):
    bg[..., c] = top[c] * (1 - t) + bot[c] * t
# faint cool ambient wash upper-left
wash = np.clip(1 - radial(xx, yy, W * 0.28, W * 0.1, W * 0.75), 0, 1) ** 2
bg[..., 2] += wash * 0.045
bg[..., 0] += wash * 0.02

# ---------- glass orb ----------
cx, cy, R = W * 0.5, W * 0.46, W * 0.30
d = radial(xx, yy, cx, cy, R)  # 0 center → 1 rim
inside = d < 1.0

orb = np.zeros((W, W, 3))
alpha = np.zeros((W, W))

# base: slight brighten of what's "behind" (refraction ≈ lifted, bluish-dark core)
orb = bg * 1.25
orb[..., 2] += 0.03

# edge refraction band: bright rim that fades inward (meniscus)
rim = np.clip((d - 0.82) / 0.18, 0, 1) ** 2
rim_mask = rim * inside
orb += rim_mask[..., None] * np.array([0.55, 0.62, 0.75])

# top-left specular highlight (soft ellipse)
sx, sy = cx - R * 0.38, cy - R * 0.42
spec = np.clip(1 - radial(xx, yy, sx, sy, R * 0.55), 0, 1) ** 3
orb += (spec * inside)[..., None] * np.array([0.9, 0.95, 1.0]) * 0.85

# secondary small hot spot
spec2 = np.clip(1 - radial(xx, yy, sx - R * 0.08, sy - R * 0.1, R * 0.2), 0, 1) ** 2
orb += (spec2 * inside)[..., None] * np.array([1.0, 1.0, 1.0]) * 0.9

# bottom inner blue refraction glow (system-blue accent)
bglow = np.clip(1 - radial(xx, yy, cx, cy + R * 0.55, R * 0.85), 0, 1) ** 2.5
orb += (bglow * inside)[..., None] * np.array([0.04, 0.32, 0.72]) * 0.55

# bottom-right counter highlight (light bouncing through the liquid)
crim = np.clip(1 - radial(xx, yy, cx + R * 0.45, cy + R * 0.5, R * 0.5), 0, 1) ** 3
orb += (crim * inside)[..., None] * np.array([0.35, 0.45, 0.6]) * 0.35

alpha = inside.astype(np.float64)

# soft outer shadow / contact darkening just outside the rim
halo = np.clip(1 - np.abs(d - 1.0) * 6, 0, 1)
halo *= ~inside
bg *= (1 - halo[..., None] * 0.25)

# caustic glow beneath the orb
ca = np.clip(1 - radial(xx, yy, cx, cy + R * 1.25, R * 0.7), 0, 1) ** 3
bg += ca[..., None] * np.array([0.05, 0.12, 0.22]) * 0.5

# ---------- composite ----------
out = bg * (1 - alpha[..., None]) + np.clip(orb, 0, 1) * alpha[..., None]
img = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), "RGB")

# gentle blur pass to sell the glass, then downscale
img = img.filter(ImageFilter.GaussianBlur(SS * 1.2))
img = img.resize((S, S), Image.LANCZOS)

import os
os.makedirs("packages/app/resources", exist_ok=True)
img.save("packages/app/resources/icon.png")
# smaller sizes for ico / window icon
img.resize((512, 512), Image.LANCZOS).save("packages/app/resources/icon-512.png")
img.resize((256, 256), Image.LANCZOS).save("packages/app/resources/icon-256.png")
print("saved packages/app/resources/icon.png")
