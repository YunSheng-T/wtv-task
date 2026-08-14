"""Procedurally render the wtv-task liquid-glass app icon (1024x1024).

The macOS squircle is baked into the image (transparent corners) so the icon
looks right even where no system mask is applied (dev Dock, tray, Windows).
"""
import numpy as np
from PIL import Image, ImageFilter

S = 1024
SS = 4  # supersample
W = S * SS

yy, xx = np.mgrid[0:W, 0:W].astype(np.float64)


def radial(xx, yy, cx, cy, r):
    return np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r


def superellipse_mask(xx, yy, cx, cy, half, n=4.6):
    v = (np.abs(xx - cx) / half) ** n + (np.abs(yy - cy) / half) ** n
    return np.clip((1.0 - v) * half * 0.06, 0, 1)  # soft AA edge


# ---------- squircle plate (Apple icon grid: ~86% of canvas) ----------
half = W * 0.43
plate = superellipse_mask(xx, yy, W / 2, W / 2, half)

# plate fill: dark graphite, lit from top
t = np.clip((yy - (W / 2 - half)) / (2 * half), 0, 1)
plate_rgb = np.zeros((W, W, 3))
top = np.array([34, 34, 41]) / 255
bot = np.array([13, 13, 18]) / 255
for c in range(3):
    plate_rgb[..., c] = top[c] * (1 - t) + bot[c] * t
# faint cool ambient wash upper-left inside the plate
wash = np.clip(1 - radial(xx, yy, W * 0.3, W * 0.12, W * 0.7), 0, 1) ** 2
plate_rgb[..., 2] += wash * 0.05
plate_rgb[..., 0] += wash * 0.02
# subtle top edge light on the plate itself
plate_edge = np.clip(1 - t * 6, 0, 1) * plate
plate_rgb += plate_edge[..., None] * 0.06

# ---------- glass orb ----------
cx, cy, R = W * 0.5, W * 0.47, W * 0.265
d = radial(xx, yy, cx, cy, R)
inside = d < 1.0

orb = plate_rgb * 1.18  # refraction ≈ lifted backdrop
orb[..., 2] += 0.035

# edge refraction band (meniscus rim)
rim = np.clip((d - 0.80) / 0.20, 0, 1) ** 2
orb += (rim * inside)[..., None] * np.array([0.50, 0.58, 0.72])

# top-left specular highlight (soft ellipse)
sx, sy = cx - R * 0.36, cy - R * 0.40
spec = np.clip(1 - radial(xx, yy, sx, sy, R * 0.52), 0, 1) ** 3
orb += (spec * inside)[..., None] * np.array([0.85, 0.9, 1.0]) * 0.8

# small hot spot
spec2 = np.clip(1 - radial(xx, yy, sx - R * 0.06, sy - R * 0.08, R * 0.17), 0, 1) ** 2
orb += (spec2 * inside)[..., None] * np.array([1.0, 1.0, 1.0]) * 0.95

# bottom inner blue refraction glow (system-blue accent)
bglow = np.clip(1 - radial(xx, yy, cx, cy + R * 0.52, R * 0.8), 0, 1) ** 2.5
orb += (bglow * inside)[..., None] * np.array([0.05, 0.34, 0.75]) * 0.6

# bottom-right counter highlight
crim = np.clip(1 - radial(xx, yy, cx + R * 0.42, cy + R * 0.48, R * 0.45), 0, 1) ** 3
orb += (crim * inside)[..., None] * np.array([0.35, 0.45, 0.6]) * 0.35

# orb drop shadow on the plate
sh = np.clip(1 - radial(xx, yy, cx, cy + R * 0.16, R * 1.12), 0, 1) ** 2
sh *= plate
plate_rgb *= (1 - sh[..., None] * 0.35)

# caustic glow beneath the orb
ca = np.clip(1 - radial(xx, yy, cx, cy + R * 1.18, R * 0.62), 0, 1) ** 3
plate_rgb += (ca * plate)[..., None] * np.array([0.05, 0.13, 0.24]) * 0.55

# ---------- compose RGBA ----------
out_rgb = plate_rgb.copy()
out_rgb[inside] = np.clip(orb, 0, 1)[inside]
alpha = plate  # transparent outside the squircle

out = np.dstack([np.clip(out_rgb, 0, 1), alpha])
img = Image.fromarray((out * 255).astype(np.uint8), "RGBA")
img = img.filter(ImageFilter.GaussianBlur(SS * 1.0))
img = img.resize((S, S), Image.LANCZOS)

import os
os.makedirs("packages/app/resources", exist_ok=True)
img.save("packages/app/resources/icon.png")
img.resize((512, 512), Image.LANCZOS).save("packages/app/resources/icon-512.png")
img.resize((256, 256), Image.LANCZOS).save("packages/app/resources/icon-256.png")
print("saved packages/app/resources/icon.png")
