import pytest

from app.telegram import parse_set_name


@pytest.mark.parametrize("text, expected", [
    ("https://t.me/addstickers/HotCherry", "HotCherry"),
    ("http://t.me/addstickers/HotCherry", "HotCherry"),
    ("t.me/addstickers/HotCherry", "HotCherry"),
    ("https://telegram.me/addstickers/Pepe_by_bot?start=1", "Pepe_by_bot"),
    ("tg://addstickers?set=HotCherry", "HotCherry"),
    ("https://t.me/addemoji/Emojis2024", "Emojis2024"),
    # Lo que se pega a veces al compartir desde el menú de Telegram:
    ("Mira este pack https://t.me/addstickers/UtyaDuck 😂", "UtyaDuck"),
    ("  https://t.me/addstickers/HotCherry\n", "HotCherry"),
])
def test_reconoce_links_de_compartir(text, expected):
    assert parse_set_name(text) == expected


@pytest.mark.parametrize("text", [
    None,
    "",
    "HotCherry",  # sin link
    "https://t.me/+AbCdEf",  # invitación a grupo
    "https://t.me/durov",  # canal
    "https://t.me/addstickers/",
    "https://t.me/addstickers/9empiezaConNumero",
    "https://example.com/addstickers/HotCherry",
])
def test_rechaza_lo_que_no_es_un_pack(text):
    assert parse_set_name(text) is None
