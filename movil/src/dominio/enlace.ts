/**
 * El link que Telegram da al tocar Compartir → Copiar enlace en un pack.
 *
 * Es la misma regla que aplica el servidor (api/app/telegram.py). Aquí sólo
 * sirve para avisar al instante si lo pegado no es un pack; quien decide es el
 * servidor.
 */

// Telegram exige que el nombre empiece con letra; luego letras, dígitos y "_".
const NOMBRE = '([A-Za-z][A-Za-z0-9_]{0,63})';

const PATRONES = [
  // https://t.me/addstickers/Nombre (también telegram.me y telegram.dog)
  new RegExp(`(?:t\\.me|telegram\\.me|telegram\\.dog)/(?:addstickers|addemoji)/${NOMBRE}`, 'i'),
  // tg://addstickers?set=Nombre
  new RegExp(`tg://(?:addstickers|addemoji)\\?set=${NOMBRE}`, 'i'),
];

/** El nombre del pack, o null si el texto no trae un link de pack. */
export function nombreDelPack(texto: string | null | undefined): string | null {
  if (!texto) return null;
  for (const patron of PATRONES) {
    const encontrado = patron.exec(texto);
    if (encontrado) return encontrado[1];
  }
  return null;
}

/** El link canónico: el servidor lo acepta sin importar cómo se pegó. */
export function enlaceDelPack(nombre: string): string {
  return `https://t.me/addstickers/${nombre}`;
}

export type Veredicto =
  | { tipo: 'vacio' }
  | { tipo: 'valido'; nombre: string }
  | { tipo: 'invalido'; motivo: string };

/** Qué decirle al usuario sobre lo que escribió, antes de mandarlo. */
export function revisarEnlace(texto: string): Veredicto {
  if (!texto.trim()) return { tipo: 'vacio' };
  const nombre = nombreDelPack(texto);
  if (nombre) return { tipo: 'valido', nombre };
  if (/t\.me\/\+|joinchat/i.test(texto)) {
    return { tipo: 'invalido', motivo: 'Ese es un link para unirse a un grupo, no un pack de stickers.' };
  }
  if (/t\.me\//i.test(texto)) {
    return { tipo: 'invalido', motivo: 'Ese link de Telegram no es de un pack. Debe decir /addstickers/.' };
  }
  return { tipo: 'invalido', motivo: 'Pega el link que da Telegram, como t.me/addstickers/NombreDelPack.' };
}
