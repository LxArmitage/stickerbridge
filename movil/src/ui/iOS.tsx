/**
 * Las piezas de interfaz que iOS enseñó a todo el mundo a leer:
 *   · Título grande que colapsa en una barra compacta al desplazar.
 *   · Listas agrupadas con inserción: tarjeta redondeada, separadores que
 *     empiezan donde empieza el texto, encabezado en versalitas.
 *   · Control segmentado.
 *   · Botón lleno, del ancho de la pantalla, para la acción principal.
 */

import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Children, Fragment, isValidElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { espacio, fuente, radio, useTema } from './tema';

type NombreIcono = ComponentProps<typeof Ionicons>['name'];

/** Dónde termina de encogerse el título. 44 px es el recorrido de iOS. */
const RECORRIDO = 44;

// ---------------------------------------------------------------------------

/**
 * El desplazamiento de la pantalla, en el hilo de UI: el título se encoge en
 * cada cuadro y hacerlo con estado de React re-renderizaría todo 60 veces por
 * segundo.
 */
export function useDesplazamiento() {
  const y = useSharedValue(0);
  const alDesplazar = useAnimatedScrollHandler((evento) => {
    y.value = evento.contentOffset.y;
  });
  return { y, alDesplazar };
}

export interface BarraCompactaProps {
  titulo: string;
  y: SharedValue<number>;
  izquierda?: ReactNode;
  derecha?: ReactNode;
  /** Con botón de volver la barra se queda siempre; sólo el título aparece. */
  fija?: boolean;
}

/** La barra que aparece cuando el título grande ya se fue arriba. */
export function BarraCompacta({ titulo, y, izquierda, derecha, fija }: BarraCompactaProps) {
  const tema = useTema();
  const insets = useSafeAreaInsets();

  const borde = tema.borde;
  const fondo = useAnimatedStyle(() => {
    const t = interpolate(y.value, [RECORRIDO * 0.5, RECORRIDO], [0, 1], 'clamp');
    // El filo de abajo sólo aparece cuando hay contenido pasando por debajo.
    return { opacity: fija ? 1 : t, borderBottomColor: t > 0.5 ? borde : 'transparent' };
  });
  const textoTitulo = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [RECORRIDO * 0.5, RECORRIDO], [0, 1], 'clamp'),
  }));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          paddingTop: insets.top,
          backgroundColor: tema.fondo,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        fondo,
      ]}
    >
      <View
        style={{
          height: 44,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: espacio.lg,
          gap: espacio.sm,
        }}
      >
        <View style={{ minWidth: 72 }}>{izquierda}</View>
        <Animated.Text
          numberOfLines={1}
          style={[
            { flex: 1, textAlign: 'center', fontFamily: fuente.cuerpoFuerte, fontSize: 16, color: tema.texto },
            textoTitulo,
          ]}
        >
          {titulo}
        </Animated.Text>
        <View style={{ minWidth: 72, alignItems: 'flex-end' }}>{derecha}</View>
      </View>
    </Animated.View>
  );
}

/** El "‹ Atrás" de iOS: chevron y texto, en el color de acción. */
export function BotonVolver({ onPress, texto = 'Atrás' }: { onPress: () => void; texto?: string }) {
  const tema = useTema();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.4 : 1 })}
    >
      <Ionicons name="chevron-back" size={24} color={tema.primario} style={{ marginLeft: -8 }} />
      <Text style={{ fontFamily: fuente.cuerpoMedio, fontSize: 16, color: tema.primario }}>{texto}</Text>
    </Pressable>
  );
}

export interface TituloGrandeProps {
  titulo: string;
  subtitulo?: string;
  y: SharedValue<number>;
  derecha?: ReactNode;
}

/** El título grande, dentro del contenido. Se desvanece al subir. */
export function TituloGrande({ titulo, subtitulo, y, derecha }: TituloGrandeProps) {
  const tema = useTema();

  const estilo = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, RECORRIDO], [1, 0], 'clamp'),
    // Sube un poco más despacio que el desplazamiento: da profundidad.
    transform: [{ translateY: interpolate(y.value, [0, RECORRIDO], [0, 8], 'clamp') }],
  }));

  return (
    <Animated.View style={[{ gap: 2, marginBottom: espacio.md }, estilo]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: espacio.md }}>
        <Text style={{ flex: 1, fontFamily: fuente.titulo, fontSize: 32, letterSpacing: -0.6, color: tema.texto }}>
          {titulo}
        </Text>
        {derecha}
      </View>
      {subtitulo && (
        <Text style={{ fontFamily: fuente.cuerpo, fontSize: 14, color: tema.textoSuave }}>{subtitulo}</Text>
      )}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------

export interface GrupoProps {
  titulo?: string;
  /** Explicación bajo el grupo, como el pie de una sección de Ajustes. */
  nota?: string;
  /** Dónde empieza el separador: donde empieza el texto de la fila. */
  sangria?: number;
  children: ReactNode;
}

/**
 * Una sección de lista agrupada. Los separadores los pone el grupo y no las
 * filas, porque quien sabe cuál es la última es el grupo.
 */
export function Grupo({ titulo, nota, sangria = espacio.lg + 38, children }: GrupoProps) {
  const tema = useTema();
  const filas = Children.toArray(children).filter(isValidElement);

  return (
    <View style={{ gap: espacio.sm }}>
      {titulo && (
        <Text
          style={{
            fontFamily: fuente.cuerpoFuerte,
            fontSize: 11.5,
            letterSpacing: 0.9,
            textTransform: 'uppercase',
            color: tema.textoSuave,
            paddingHorizontal: espacio.md,
          }}
        >
          {titulo}
        </Text>
      )}

      <View
        style={{
          backgroundColor: tema.superficie,
          borderRadius: radio.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: tema.borde,
          overflow: 'hidden',
        }}
      >
        {filas.map((fila, i) => (
          <Fragment key={i}>
            {fila}
            {i < filas.length - 1 && (
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: tema.borde, marginLeft: sangria }} />
            )}
          </Fragment>
        ))}
      </View>

      {nota && (
        <Text style={{ fontFamily: fuente.cuerpo, fontSize: 12, lineHeight: 17, color: tema.textoSuave, paddingHorizontal: espacio.md }}>
          {nota}
        </Text>
      )}
    </View>
  );
}

export interface FilaProps {
  titulo: string;
  detalle?: string;
  /** Icono a la izquierda, en su cuadro de color. Como en Ajustes. */
  icono?: NombreIcono;
  colorIcono?: string;
  /** Contenido libre a la izquierda (una imagen, un número). */
  izquierda?: ReactNode;
  valor?: string;
  onPress?: () => void;
}

export function Fila({ titulo, detalle, icono, colorIcono, izquierda, valor, onPress }: FilaProps) {
  const tema = useTema();

  const contenido = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: espacio.md,
        paddingHorizontal: espacio.lg,
        // 44 pt es el mínimo táctil de Apple.
        minHeight: 48,
        paddingVertical: espacio.sm + 2,
      }}
    >
      {icono && (
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            backgroundColor: colorIcono ?? tema.primario,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icono} size={15} color="#fff" />
        </View>
      )}
      {izquierda}

      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontFamily: fuente.cuerpoMedio, fontSize: 15, color: tema.texto }}>{titulo}</Text>
        {detalle && (
          <Text style={{ fontFamily: fuente.cuerpo, fontSize: 12.5, lineHeight: 17, color: tema.textoSuave }}>{detalle}</Text>
        )}
      </View>

      {valor && <Text style={{ fontFamily: fuente.cuerpo, fontSize: 14, color: tema.textoSuave }}>{valor}</Text>}
      {onPress && <Ionicons name="chevron-forward" size={16} color={tema.textoSuave} />}
    </View>
  );

  if (!onPress) return contenido;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ backgroundColor: pressed ? tema.superficieAlta : 'transparent' })}
    >
      {contenido}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

export interface SegmentadoProps<T extends string> {
  opciones: Array<{ valor: T; etiqueta: string }>;
  valor: T;
  onCambio: (valor: T) => void;
}

/** Control segmentado: pocas opciones, todas visibles, una activa. */
export function Segmentado<T extends string>({ opciones, valor, onCambio }: SegmentadoProps<T>) {
  const tema = useTema();

  return (
    <View style={{ flexDirection: 'row', backgroundColor: tema.superficieAlta, borderRadius: radio.md, padding: 3, gap: 3 }}>
      {opciones.map((opcion) => {
        const activa = opcion.valor === valor;
        return (
          <Pressable
            key={opcion.valor}
            onPress={() => onCambio(opcion.valor)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activa }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 32,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radio.sm,
              backgroundColor: activa ? tema.superficie : 'transparent',
              opacity: pressed && !activa ? 0.6 : 1,
              // La pastilla activa se levanta apenas; sin sombra se pierde.
              shadowColor: '#000',
              shadowOpacity: activa ? 0.12 : 0,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              elevation: activa ? 2 : 0,
            })}
          >
            <Text
              numberOfLines={1}
              style={{
                fontFamily: activa ? fuente.cuerpoFuerte : fuente.cuerpo,
                fontSize: 13,
                color: activa ? tema.texto : tema.textoSuave,
              }}
            >
              {opcion.etiqueta}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------

export interface BotonProps {
  titulo: string;
  onPress: () => void;
  icono?: NombreIcono;
  /** Color de fondo y del texto encima. Por defecto, el primario. */
  color?: string;
  colorTexto?: string;
  deshabilitado?: boolean;
  cargando?: boolean;
}

/** El botón lleno de la acción principal de la pantalla. */
export function Boton({ titulo, onPress, icono, color, colorTexto, deshabilitado, cargando }: BotonProps) {
  const tema = useTema();
  const fondo = color ?? tema.primario;
  const texto = colorTexto ?? tema.textoSobrePrimario;
  const inactivo = deshabilitado || cargando;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactivo}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactivo, busy: cargando }}
      style={({ pressed }) => ({
        minHeight: 50,
        borderRadius: radio.md + 2,
        backgroundColor: deshabilitado ? tema.superficieAlta : fondo,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: espacio.sm,
        paddingHorizontal: espacio.lg,
        opacity: pressed ? 0.75 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      {cargando ? (
        <ActivityIndicator color={texto} />
      ) : (
        icono && <Ionicons name={icono} size={19} color={deshabilitado ? tema.textoSuave : texto} />
      )}
      <Text style={{ fontFamily: fuente.cuerpoFuerte, fontSize: 16, color: deshabilitado ? tema.textoSuave : texto }}>
        {titulo}
      </Text>
    </Pressable>
  );
}
