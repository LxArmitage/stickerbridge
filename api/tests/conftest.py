"""Stickers de Telegram sintéticos, generados en cada corrida.

No se descarga nada: así las pruebas no dependen de la red ni del token.
"""

import gzip
import json
import os
import subprocess
import tempfile
from pathlib import Path

import pytest
from PIL import Image, ImageDraw


def pytest_configure(config):
    # Antes de importar la app: que no toque /data del contenedor.
    tmp = Path(tempfile.mkdtemp(prefix="sb-tests-"))
    os.environ.update(
        PACKS_DIR=str(tmp / "packs"),
    )


@pytest.fixture
def static_sticker(tmp_path: Path) -> Path:
    """Como los de Telegram: 512 en el lado largo, fondo transparente."""
    im = Image.new("RGBA", (512, 300), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse((40, 20, 470, 280), fill=(255, 180, 0, 255), outline=(0, 0, 0, 255), width=12)
    path = tmp_path / "static.webp"
    im.save(path, format="WEBP", lossless=True)
    return path


@pytest.fixture
def noisy_static_sticker(tmp_path: Path) -> Path:
    """Ruido puro: sin compresión con pérdida pesaría ~1 MB."""
    im = Image.frombytes("RGBA", (512, 512), bytes((i * 7919) % 251 for i in range(512 * 512 * 4)))
    path = tmp_path / "noisy.png"
    im.save(path)
    return path


@pytest.fixture
def video_sticker(tmp_path: Path) -> Path:
    """VP9 con canal alfa: la franja izquierda (x < 100) es transparente."""
    path = tmp_path / "video.webm"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=384x512:duration=2:rate=30",
         "-vf", "format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(lt(X,100),0,255)'",
         "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "400k", str(path)],
        check=True,
    )
    return path


@pytest.fixture
def lottie_sticker(tmp_path: Path) -> Path:
    """Un cuadro rojo que gira una vuelta en 3 s a 60 fps, como un .tgs real."""
    anim = {
        "v": "5.5.2", "fr": 60, "ip": 0, "op": 180, "w": 512, "h": 512, "nm": "t", "ddd": 0, "assets": [],
        "layers": [{
            "ddd": 0, "ind": 1, "ty": 4, "nm": "s", "sr": 1, "ao": 0, "ip": 0, "op": 180, "st": 0, "bm": 0,
            "ks": {
                "o": {"a": 0, "k": 100},
                "r": {"a": 1, "k": [
                    {"t": 0, "s": [0], "i": {"x": [0.5], "y": [0.5]}, "o": {"x": [0.5], "y": [0.5]}},
                    {"t": 180, "s": [360]},
                ]},
                "p": {"a": 0, "k": [256, 256, 0]},
                "a": {"a": 0, "k": [0, 0, 0]},
                "s": {"a": 0, "k": [100, 100, 100]},
            },
            "shapes": [
                {"ty": "rc", "d": 1, "s": {"a": 0, "k": [240, 240]}, "p": {"a": 0, "k": [0, 0]}, "r": {"a": 0, "k": 30}},
                {"ty": "fl", "c": {"a": 0, "k": [0.9, 0.1, 0.2, 1]}, "o": {"a": 0, "k": 100}, "r": 1},
            ],
        }],
    }
    path = tmp_path / "anim.tgs"
    path.write_bytes(gzip.compress(json.dumps(anim).encode()))
    return path
