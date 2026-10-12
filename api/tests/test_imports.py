"""El flujo completo, con Telegram simulado."""

import base64
import os
import shutil
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import imports, telegram, whatsapp


class FakeBotApi:
    """Un pack mixto: 31 estáticos, 2 de video y 1 animado."""

    files = {}

    def __init__(self, token):
        pass

    def get_sticker_set(self, name):
        if name.lower() != "packdeprueba":
            raise telegram.StickerSetNotFound("Ese pack no existe o fue borrado en Telegram.")
        kinds = ["static"] * 31 + ["video"] * 2 + ["lottie"]
        items = [telegram.SourceSticker(i, f"f{i}", f"u{i}", kind, "😀") for i, kind in enumerate(kinds)]
        return telegram.SourceSet(name="PackDePrueba", title="Pack de prueba", stickers=items)

    def download(self, file_id, dest):
        kind = {"webp": "static", "webm": "video", "tgs": "lottie"}[dest.suffix[1:]]
        shutil.copyfile(self.files[kind], dest)


@pytest.fixture
def client(monkeypatch, static_sticker, video_sticker, lottie_sticker):
    FakeBotApi.files = {"static": static_sticker, "video": video_sticker, "lottie": lottie_sticker}
    monkeypatch.setattr(telegram, "BotApi", FakeBotApi)
    # Misma carpeta que sirve /files, vacía en cada prueba.
    root = Path(imports.settings.PACKS_DIR)
    shutil.rmtree(root, ignore_errors=True)
    importer = imports.Importer(root, "token", ttl_hours=24, workers=2)
    monkeypatch.setattr(imports, "importer", importer)
    from app.main import app
    return TestClient(app)


def _wait(client, name, timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = client.get(f"/v1/imports/{name}").json()
        if job["status"] in ("done", "error"):
            return job
        time.sleep(0.2)
    raise AssertionError("la importación no terminó")


def test_link_invalido(client):
    resp = client.post("/v1/imports", json={"link": "https://t.me/durov"})
    assert resp.status_code == 400


def test_pack_inexistente(client):
    client.post("/v1/imports", json={"link": "https://t.me/addstickers/NoExiste"})
    job = _wait(client, "NoExiste")
    assert job["status"] == "error"
    assert "no existe" in job["error"]


def test_flujo_completo(client):
    resp = client.post("/v1/imports", json={"link": "https://t.me/addstickers/PackDePrueba"})
    assert resp.status_code == 200
    job = _wait(client, "PackDePrueba")
    assert job["status"] == "done", job["error"]

    result = job["result"]
    assert result["total"] == 34 and result["skipped"] == 0
    # Hay animados, así que los 31 estáticos van como animados y los 34 se
    # reparten parejo: 2 packs y no 3 (16 + 15 estáticos y 3 animados).
    assert [(p["animated"], len(p["stickers"])) for p in result["packs"]] == [(True, 17), (True, 17)]
    assert [p["name"] for p in result["packs"]] == ["Pack de prueba (1/2)", "Pack de prueba (2/2)"]
    # La validación exige 2 frames o más en cada sticker de un pack animado.
    assert all(p["problems"] == [] for p in result["packs"])

    # Los archivos se sirven para la vista previa.
    pack = result["packs"][1]
    sticker = client.get(f"{pack['url']}/{pack['stickers'][0]['file']}")
    assert sticker.status_code == 200 and sticker.headers["content-type"] == "image/webp"
    assert client.get(f"{pack['url']}/tray.png").status_code == 200

    # Y el JSON para WhatsApp en iPhone trae todo embebido.
    payload = client.get(f"/v1/imports/PackDePrueba/packs/{pack['identifier']}/whatsapp").json()
    assert payload["animated_sticker_pack"] is True
    assert payload["publisher"] == whatsapp.PUBLISHER
    assert payload["name"] == "Pack de prueba (2/2)" and payload["identifier"] == pack["identifier"]
    assert len(payload["stickers"]) == 17
    assert base64.b64decode(payload["tray_image"])[:4] == b"\x89PNG"
    assert base64.b64decode(payload["stickers"][0]["image_data"])[8:12] == b"WEBP"


def test_solo_estaticos_siguen_siendo_estaticos(client, monkeypatch):
    original = FakeBotApi.get_sticker_set

    def solo_estaticos(self, name):
        source = original(self, name)
        source.stickers = [s for s in source.stickers if s.kind == "static"][:5]
        return source

    monkeypatch.setattr(FakeBotApi, "get_sticker_set", solo_estaticos)
    client.post("/v1/imports", json={"link": "https://t.me/addstickers/PackDePrueba"})
    result = _wait(client, "PackDePrueba")["result"]
    assert [(p["animated"], len(p["stickers"]), p["problems"]) for p in result["packs"]] == [(False, 5, [])]


def test_nombre_elegido_por_el_usuario(client):
    client.post("/v1/imports", json={"link": "https://t.me/addstickers/PackDePrueba"})
    pack = _wait(client, "PackDePrueba")["result"]["packs"][0]
    url = f"/v1/imports/PackDePrueba/packs/{pack['identifier']}/whatsapp"

    payload = client.get(url, params={"title": "  Mis   stickers\n"}).json()
    assert payload["name"] == "Mis stickers (1/2)"
    # Identificador propio: WhatsApp lo agrega con el nombre nuevo.
    assert payload["identifier"] != pack["identifier"]
    assert payload["identifier"] == client.get(url, params={"title": "Mis stickers"}).json()["identifier"]

    # Sin nombre, o sólo con espacios, queda el de Telegram.
    for params in ({}, {"title": "   "}):
        payload = client.get(url, params=params).json()
        assert (payload["name"], payload["identifier"]) == ("Pack de prueba (1/2)", pack["identifier"])


def test_lo_convertido_caduca(client):
    client.post("/v1/imports", json={"link": "https://t.me/addstickers/PackDePrueba"})
    first = _wait(client, "PackDePrueba")
    viejo = time.time() - 25 * 3600
    os.utime(Path(imports.settings.PACKS_DIR) / "packdeprueba" / "result.json", (viejo, viejo))

    # Pasadas 24 h se vuelve a convertir: el pack de Telegram pudo cambiar.
    assert client.post("/v1/imports", json={"link": "https://t.me/addstickers/PackDePrueba"}).json()["status"] != "done"
    again = _wait(client, "PackDePrueba")
    assert again["status"] == "done"
    assert again["result"]["createdAt"] >= first["result"]["createdAt"]


def test_segunda_vez_usa_lo_ya_convertido(client):
    client.post("/v1/imports", json={"link": "https://t.me/addstickers/PackDePrueba"})
    first = _wait(client, "PackDePrueba")
    again = client.post("/v1/imports", json={"link": "t.me/addstickers/packdeprueba"}).json()
    assert again["status"] == "done"
    assert again["result"]["createdAt"] == first["result"]["createdAt"]
