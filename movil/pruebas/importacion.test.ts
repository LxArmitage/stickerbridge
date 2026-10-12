import {
  etapa,
  limpiarNombre,
  nombreEnWhatsApp,
  porQueSePartio,
  progresoEnvio,
  resumen,
  type Importacion,
  type PackWhatsApp,
  type Resultado,
} from '../src/dominio/importacion';

function importacion(parcial: Partial<Importacion>): Importacion {
  return { name: 'HotCherry', status: 'queued', done: 0, total: 0, error: null, result: null, ...parcial };
}

function pack(animated: boolean, n: number): PackWhatsApp {
  return {
    identifier: 'x', name: 'x', publisher: 'StickerBridge', animated, tray: 'tray.png', url: '/files/x/x',
    stickers: Array.from({ length: n }, (_, i) => ({ file: `${i}.webp`, emojis: ['🙂'] })),
    problems: [],
  };
}

function resultado(packs: PackWhatsApp[]): Resultado {
  const n = packs.reduce((s, p) => s + p.stickers.length, 0);
  return { name: 'x', title: 'X', link: '', total: n, converted: n, skipped: 0, packs, createdAt: '' };
}

describe('etapa', () => {
  it('el avance sólo crece de una etapa a la siguiente', () => {
    const pasos = [
      importacion({ status: 'queued' }),
      importacion({ status: 'downloading', done: 0, total: 10 }),
      importacion({ status: 'downloading', done: 10, total: 10 }),
      importacion({ status: 'converting', done: 0, total: 10 }),
      importacion({ status: 'converting', done: 5, total: 10 }),
      importacion({ status: 'done', done: 10, total: 10 }),
    ].map((i) => etapa(i).avance);
    expect(pasos).toEqual([...pasos].sort((a, b) => a - b));
    expect(pasos[pasos.length - 1]).toBe(1);
  });

  it('cuenta cuántos lleva', () => {
    expect(etapa(importacion({ status: 'converting', done: 34, total: 120 })).detalle).toBe('34 de 120');
  });

  it('muestra el error del servidor tal cual', () => {
    const e = etapa(importacion({ status: 'error', error: 'Ese pack no existe o fue borrado en Telegram.' }));
    expect(e.detalle).toMatch(/no existe/);
  });
});

describe('resumen', () => {
  it('un solo pack no dice "1 pack"', () => {
    expect(resumen(resultado([pack(true, 24)]))).toBe('24 stickers');
  });

  it('varios packs', () => {
    expect(resumen(resultado([pack(false, 30), pack(false, 30), pack(false, 30), pack(false, 30)]))).toBe(
      '120 stickers · 4 partes',
    );
  });
});

describe('porQueSePartio', () => {
  it('no explica nada si no se partió', () => {
    expect(porQueSePartio(resultado([pack(false, 20)]))).toBeNull();
  });

  it('explica el límite de 30', () => {
    expect(porQueSePartio(resultado([pack(false, 16), pack(false, 15)]))).toMatch(/30/);
  });

  it('explica la mezcla de animados y estáticos', () => {
    expect(porQueSePartio(resultado([pack(false, 10), pack(true, 3)]))).toMatch(/no mezcla/);
  });
});

describe('nombre en WhatsApp', () => {
  it('deja lo escrito en una línea y sin espacios de más', () => {
    expect(limpiarNombre('  Mis\n  stickers  de gatos ')).toBe('Mis stickers de gatos');
    expect(limpiarNombre('   ')).toBe('');
  });

  it('numera las partes como el servidor', () => {
    expect(nombreEnWhatsApp('Gatitos', 1, 1)).toBe('Gatitos');
    expect(nombreEnWhatsApp('Gatitos', 2, 4)).toBe('Gatitos (2/4)');
    const largo = nombreEnWhatsApp('x'.repeat(300), 3, 4);
    expect(largo).toHaveLength(128);
    expect(largo.endsWith('(3/4)')).toBe(true);
  });
});

describe('progresoEnvio', () => {
  function partes(...tamaños: number[]): Resultado {
    return resultado(tamaños.map((n, i) => ({ ...pack(true, n), identifier: `p${i + 1}` })));
  }

  it('nada que decir con un solo pack o sin partes agregadas', () => {
    expect(progresoEnvio(partes(20), new Set(['p1']))).toBeNull();
    expect(progresoEnvio(partes(30, 30, 30, 29), new Set())).toBeNull();
  });

  it('cuenta las partes y los stickers que faltan', () => {
    expect(progresoEnvio(partes(30, 30, 30, 29), new Set(['p2']))).toBe('Agregaste 1 de 4 partes. Faltan 89 stickers.');
  });

  it('avisa cuando ya están todas', () => {
    expect(progresoEnvio(partes(30, 29), new Set(['p1', 'p2']))).toBe('Listo: agregaste las 2 partes (59 stickers).');
  });
});
