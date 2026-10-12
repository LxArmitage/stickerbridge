import { enlaceDelPack, nombreDelPack, revisarEnlace } from '../src/dominio/enlace';

describe('nombreDelPack', () => {
  it.each([
    ['https://t.me/addstickers/HotCherry', 'HotCherry'],
    ['http://t.me/addstickers/HotCherry', 'HotCherry'],
    ['t.me/addstickers/HotCherry', 'HotCherry'],
    ['https://telegram.me/addstickers/Pepe_by_bot?start=1', 'Pepe_by_bot'],
    ['tg://addstickers?set=HotCherry', 'HotCherry'],
    ['https://t.me/addemoji/Emojis2024', 'Emojis2024'],
    ['Mira este pack https://t.me/addstickers/UtyaDuck 😂', 'UtyaDuck'],
    ['  https://t.me/addstickers/HotCherry\n', 'HotCherry'],
  ])('reconoce %s', (texto, nombre) => {
    expect(nombreDelPack(texto)).toBe(nombre);
  });

  it.each([
    [''],
    ['HotCherry'],
    ['https://t.me/+AbCdEf'],
    ['https://t.me/durov'],
    ['https://t.me/addstickers/'],
    ['https://t.me/addstickers/9empiezaConNumero'],
    ['https://example.com/addstickers/HotCherry'],
  ])('rechaza %s', (texto) => {
    expect(nombreDelPack(texto)).toBeNull();
  });
});

describe('revisarEnlace', () => {
  it('no regaña mientras el campo está vacío', () => {
    expect(revisarEnlace('   ')).toEqual({ tipo: 'vacio' });
  });

  it('distingue una invitación a grupo de un pack', () => {
    const v = revisarEnlace('https://t.me/+AbCdEf');
    expect(v.tipo).toBe('invalido');
    expect(v.tipo === 'invalido' && v.motivo).toMatch(/grupo/);
  });

  it('acepta el link de compartir', () => {
    expect(revisarEnlace('https://t.me/addstickers/HotCherry')).toEqual({ tipo: 'valido', nombre: 'HotCherry' });
  });
});

it('el link canónico vuelve a dar el mismo nombre', () => {
  expect(nombreDelPack(enlaceDelPack('UtyaDuck'))).toBe('UtyaDuck');
});
