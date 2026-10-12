import pytest

from app import whatsapp


@pytest.mark.parametrize("count, sizes", [
    (3, [3]),
    (30, [30]),
    (31, [16, 15]),  # no 30 + 1: WhatsApp rechaza packs de menos de 3
    (61, [21, 20, 20]),
    (120, [30, 30, 30, 30]),
    (200, [29, 29, 29, 29, 28, 28, 28]),
])
def test_reparte_en_packs_parejos(count, sizes):
    packs = whatsapp.split_into_packs(list(range(count)))
    assert [len(p) for p in packs] == sizes
    assert [x for p in packs for x in p] == list(range(count))


def test_completa_hasta_el_minimo_repitiendo():
    assert whatsapp.split_into_packs(["a", "b"]) == [["a", "b", "a"]]
    assert whatsapp.split_into_packs(["a"]) == [["a", "a", "a"]]
    assert whatsapp.split_into_packs([]) == []


def test_nombre_del_pack():
    assert whatsapp.pack_name("Hot Cherry", 1, 1) == "Hot Cherry"
    assert whatsapp.pack_name("Hot Cherry", 2, 4) == "Hot Cherry (2/4)"
    long = whatsapp.pack_name("x" * 300, 3, 4)
    assert len(long) == whatsapp.MAX_TEXT and long.endswith("(3/4)")


def test_emojis():
    assert whatsapp.normalize_emojis("🍒") == ["🍒"]
    assert whatsapp.normalize_emojis(None) == ["🙂"]
    assert whatsapp.normalize_emojis(["1", "2", "3", "4"]) == ["1", "2", "3"]


def test_identificador_cambia_con_el_contenido():
    a = whatsapp.pack_identifier("hotcherry", 1, ["u1", "u2", "u3"])
    assert a == whatsapp.pack_identifier("hotcherry", 1, ["u1", "u2", "u3"])
    assert a != whatsapp.pack_identifier("hotcherry", 1, ["u1", "u2", "u4"])
    assert a.startswith("tg_hotcherry_1_") and whatsapp._IDENTIFIER.match(a)


def test_limpia_el_nombre_del_usuario():
    assert whatsapp.clean_title("  Mis\tstickers \n de gatos ") == "Mis stickers de gatos"
    assert whatsapp.clean_title("⛔️ Gatitos 🐱") == "⛔️ Gatitos 🐱"
    assert whatsapp.clean_title("   ") == ""
    assert whatsapp.clean_title(None) == ""
    assert len(whatsapp.clean_title("x" * 300)) == whatsapp.MAX_TEXT


def test_renombrar_cambia_nombre_e_identificador():
    pack = {"identifier": "tg_x_2_abc123", "name": "Viejo (2/4)", "publisher": "StickerBridge"}
    nuevo = whatsapp.renamed(pack, "Gatitos", 2, 4)
    assert nuevo["name"] == "Gatitos (2/4)"
    assert nuevo["identifier"].startswith("tg_x_2_abc123_") and whatsapp._IDENTIFIER.match(nuevo["identifier"])
    assert pack["name"] == "Viejo (2/4)"  # no toca el original
