"""Render card.svg to card.png at exactly 1200x630.

Usage: python3 render.py [path/to/chrome]
Headless Chrome's --window-size includes browser chrome, so a 1200x630 window
clips the bottom of the card. Render taller, then crop.
"""
import pathlib, shutil, subprocess, sys, tempfile
from PIL import Image

here = pathlib.Path(__file__).resolve().parent
chrome = sys.argv[1] if len(sys.argv) > 1 else (
    shutil.which("chromium") or shutil.which("google-chrome") or "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
with tempfile.TemporaryDirectory() as tmp:
    page = pathlib.Path(tmp, "wrap.html")
    page.write_text(f'<html><body style="margin:0"><img src="{(here/"card.svg").as_uri()}" width="1200" height="630"></body></html>')
    raw = pathlib.Path(tmp, "raw.png")
    subprocess.run([chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
                    "--window-size=1200,800", f"--screenshot={raw}", page.as_uri()], check=True, capture_output=True)
    Image.open(raw).crop((0, 0, 1200, 630)).save(here / "card.png")
print("wrote", here / "card.png")
