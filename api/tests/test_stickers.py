import subprocess

from PIL import Image

from app import stickers, whatsapp


def _frames(path):
    with Image.open(path) as im:
        return getattr(im, "n_frames", 1)


def test_estatico_queda_en_lienzo_de_512_y_conserva_transparencia(static_sticker, tmp_path):
    out = tmp_path / "out.webp"
    info = stickers.convert("static", str(static_sticker), str(out))

    assert info["animated"] is False
    assert whatsapp._validate_sticker(out, animated=False) == []
    with Image.open(out) as im:
        assert im.size == (512, 512)
        assert im.getpixel((256, 5))[3] == 0  # franja agregada arriba: transparente
        assert im.getpixel((256, 256))[3] == 255


def test_estatico_pesado_se_comprime_a_100kb(noisy_static_sticker, tmp_path):
    out = tmp_path / "out.webp"
    stickers.convert("static", str(noisy_static_sticker), str(out))
    assert out.stat().st_size <= whatsapp.STATIC_MAX_BYTES


def test_video_conserva_la_transparencia(video_sticker, tmp_path):
    out = tmp_path / "out.webp"
    info = stickers.convert("video", str(video_sticker), str(out))

    assert info["animated"] is True
    assert whatsapp._validate_sticker(out, animated=True) == []
    with Image.open(out) as im:
        assert im.size == (512, 512)
        # 384 de ancho centrado en 512: x de 64 a 448. La franja x<100 del
        # original cae entre 64 y ~164 y debe seguir transparente.
        assert im.getpixel((100, 256))[3] == 0
        assert im.getpixel((400, 256))[3] == 255


def test_lottie_se_anima(lottie_sticker, tmp_path):
    out = tmp_path / "out.webp"
    info = stickers.convert("lottie", str(lottie_sticker), str(out))

    assert info["animated"] is True
    assert _frames(out) > 10
    assert whatsapp._validate_sticker(out, animated=True) == []


def test_bandeja_es_png_de_96(lottie_sticker, tmp_path):
    sticker = tmp_path / "s.webp"
    stickers.convert("lottie", str(lottie_sticker), str(sticker))
    tray = tmp_path / "tray.png"
    stickers.make_tray(sticker, tray)
    assert whatsapp._validate_tray(tray) == []


def test_estatico_en_pack_animado_tiene_dos_frames(static_sticker, tmp_path):
    out = tmp_path / "out.webp"
    info = stickers.convert("static_animated", str(static_sticker), str(out))

    assert info["animated"] is True
    # libwebp funde frames idénticos; con uno solo WhatsApp lo vería estático.
    assert _frames(out) == 2
    assert whatsapp._validate_sticker(out, animated=True) == []
    with Image.open(out) as im:
        assert im.getpixel((256, 256))[3] == 255


def test_estatico_pesado_en_pack_animado_cabe_en_500kb(noisy_static_sticker, tmp_path):
    out = tmp_path / "out.webp"
    stickers.convert("static_animated", str(noisy_static_sticker), str(out))
    assert _frames(out) == 2
    assert out.stat().st_size <= whatsapp.ANIMATED_MAX_BYTES


def test_video_de_un_solo_frame_sigue_animado(tmp_path):
    src = tmp_path / "one.webm"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:size=512x512", "-frames:v", "1",
         "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", str(src)],
        check=True,
    )
    out = tmp_path / "out.webp"
    stickers.convert("video", str(src), str(out))
    assert _frames(out) == 2
    assert whatsapp._validate_sticker(out, animated=True) == []
