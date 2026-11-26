from PIL import Image
import os

SRC = "/Users/sebastianhudak/Documents/! Doklady/9. Personal Portfolio Web/logoset/FPV/favicon_set/logo_FPV-mark-1024.png"
OUT = "/Users/sebastianhudak/Documents/! Doklady/9. Personal Portfolio Web/logoset/FPV/favicon_set"

os.makedirs(OUT, exist_ok=True)

img = Image.open(SRC).convert("RGBA")

def save_png(size, name):
    resized = img.resize((size, size), Image.LANCZOS)
    resized.save(os.path.join(OUT, name), optimize=True)

# PNG sizes
save_png(16, "favicon-16x16.png")
save_png(32, "favicon-32x32.png")
save_png(180, "apple-touch-icon.png")
save_png(192, "android-chrome-192x192.png")
save_png(512, "android-chrome-512x512.png")

# ICO (multiple sizes inside one file)
ico_sizes = [(16,16), (32,32), (48,48)]
img.save(os.path.join(OUT, "favicon.ico"), sizes=ico_sizes)

# Basic webmanifest
manifest = """{
  "name": "Sebastian H",
  "short_name": "SH",
  "icons": [
    { "src": "/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "theme_color": "#ffffff",
  "background_color": "#ffffff",
  "display": "standalone"
}
"""
with open(os.path.join(OUT, "site.webmanifest"), "w", encoding="utf-8") as f:
    f.write(manifest)

print("Done. Files written to:", OUT)