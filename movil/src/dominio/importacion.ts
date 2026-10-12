/**
 * Lo que el servidor responde sobre una importación, y cómo contarlo.
 *
 * Los tipos reflejan api/app/imports.py. Nada de aquí hace red: la pantalla
 * los usa para decidir qué mostrar mientras llega la respuesta siguiente.
 */

export type Estado = 'queued' | 'downloading' | 'converting' | 'done' | 'error';

export interface StickerListo {
  /** Nombre del archivo dentro del pack: "01.webp". */
  file: string;
  emojis: string[];
}

export interface PackWhatsApp {
  identifier: string;
  name: string;
  publisher: string;
  animated: boolean;
  /** Archivo del ícono de bandeja, dentro de `url`. */
  tray: string;
  /** Ruta del pack en el servidor: "/files/<nombre>/<identifier>". */
  url: string;
  stickers: StickerListo[];
  /** Reglas de WhatsApp que el pack no cumple. Vacío = WhatsApp lo acepta. */
  problems: string[];
}

export interface Resultado {
  name: string;
  title: string;
  link: string;
  total: number;
  converted: number;
  skipped: number;
  packs: PackWhatsApp[];
  createdAt: string;
}

export interface Importacion {
  name: string;
  status: Estado;
  done: number;
  total: number;
  error: string | null;
  result: Resultado | null;
}

export function terminada(imp: Importacion): boolean {
  return imp.status === 'done' || imp.status === 'error';
}

export interface Etapa {
  titulo: string;
  detalle: string;
  /** De 0 a 1. La descarga pesa poco; la conversión es casi todo el tiempo. */
  avance: number;
}

const PESO_DESCARGA = 0.2;

export function etapa(imp: Importacion): Etapa {
  const fraccion = imp.total > 0 ? Math.min(imp.done / imp.total, 1) : 0;
  const cuenta = imp.total > 0 ? `${imp.done} de ${imp.total}` : '';

  switch (imp.status) {
    case 'queued':
      return { titulo: 'Buscando el pack', detalle: 'Preguntándole a Telegram…', avance: 0 };
    case 'downloading':
      return { titulo: 'Descargando de Telegram', detalle: cuenta, avance: fraccion * PESO_DESCARGA };
    case 'converting':
      return {
        titulo: 'Convirtiendo para WhatsApp',
        detalle: cuenta,
        avance: PESO_DESCARGA + fraccion * (1 - PESO_DESCARGA),
      };
    case 'done':
      return { titulo: 'Listo', detalle: '', avance: 1 };
    case 'error':
      return { titulo: 'No se pudo convertir', detalle: imp.error ?? '', avance: 0 };
  }
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** "120 stickers · 4 partes": el resumen bajo el título. */
export function resumen(r: Resultado): string {
  const partes = [plural(r.converted, 'sticker', 'stickers')];
  if (r.packs.length > 1) partes.push(plural(r.packs.length, 'parte', 'partes'));
  return partes.join(' · ');
}

/**
 * Por qué el pack se partió, si se partió.
 *
 * WhatsApp acepta de 3 a 30 stickers por pack y no mezcla estáticos con
 * animados. Sin esta explicación, ver "4 packs" donde había uno confunde.
 */
export function porQueSePartio(r: Resultado): string | null {
  if (r.packs.length <= 1) return null;
  const mezcla = r.packs.some((p) => p.animated) && r.packs.some((p) => !p.animated);
  if (mezcla) return 'WhatsApp no mezcla stickers animados con estáticos, y acepta hasta 30 por pack.';
  return (
    `WhatsApp acepta hasta 30 stickers por pack, así que los ${r.converted} se repartieron en ` +
    `${r.packs.length} partes. Agrega cada una para tenerlos todos.`
  );
}

export function descripcionPack(p: PackWhatsApp): string {
  return `${plural(p.stickers.length, 'sticker', 'stickers')} · ${p.animated ? 'animados' : 'estáticos'}`;
}

/** Lo mismo que MAX_TEXT en api/app/whatsapp.py. */
const LARGO_MAXIMO = 128;

/** Lo escrito en una sola línea y sin espacios de más, como lo limpia el servidor. */
export function limpiarNombre(texto: string): string {
  return texto.split(/\s+/).filter(Boolean).join(' ').slice(0, LARGO_MAXIMO);
}

/**
 * El nombre que muestra WhatsApp: con varias partes lleva "(2/4)" al final.
 * Es la regla de pack_name en api/app/whatsapp.py.
 */
export function nombreEnWhatsApp(titulo: string, parte: number, partes: number): string {
  const sufijo = partes > 1 ? ` (${parte}/${partes})` : '';
  return titulo.slice(0, LARGO_MAXIMO - sufijo.length).trim() + sufijo;
}

/**
 * Cuánto falta por agregar, cuando el pack se partió. Null si todavía no se
 * agrega ninguna parte: ahí basta con porQueSePartio.
 */
export function progresoEnvio(r: Resultado, enviados: ReadonlySet<string>): string | null {
  if (r.packs.length <= 1) return null;
  const listos = r.packs.filter((p) => enviados.has(p.identifier));
  if (listos.length === 0) return null;
  if (listos.length === r.packs.length) {
    return `Listo: agregaste las ${r.packs.length} partes (${plural(r.converted, 'sticker', 'stickers')}).`;
  }
  const faltan = r.packs.filter((p) => !enviados.has(p.identifier)).reduce((n, p) => n + p.stickers.length, 0);
  return `Agregaste ${listos.length} de ${r.packs.length} partes. Faltan ${plural(faltan, 'sticker', 'stickers')}.`;
}
