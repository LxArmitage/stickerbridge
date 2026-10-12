import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as WhatsApp from '../../modules/whatsapp-stickers';
import {
  descripcionPack,
  etapa,
  limpiarNombre,
  nombreEnWhatsApp,
  porQueSePartio,
  progresoEnvio,
  resumen,
  type Importacion,
  type PackWhatsApp,
  type Resultado,
} from '../../src/dominio/importacion';
import { consultar, datosParaWhatsApp, importar, urlArchivo } from '../../src/servicios/api';
import { guardarNombre, guardarReciente, nombreGuardado } from '../../src/servicios/historial';
import { avisar, mensajeDe } from '../../src/ui/avisar';
import { BarraCompacta, Boton, BotonVolver, Fila, Grupo, Segmentado, TituloGrande, useDesplazamiento } from '../../src/ui/iOS';
import { espacio, fuente, radio, useTema } from '../../src/ui/tema';

const CONSULTA_MS = 800;

export default function PantallaPack() {
  const { nombre } = useLocalSearchParams<{ nombre: string }>();
  const [importacion, setImportacion] = useState<Importacion | null>(null);
  const [sinConexion, setSinConexion] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  // Pide la conversión y sigue preguntando hasta que termine. Si ya estaba
  // convertida, la primera respuesta ya trae el resultado.
  useEffect(() => {
    let vigente = true;
    let reloj: ReturnType<typeof setTimeout> | undefined;

    function seguir(actual: Importacion) {
      if (!vigente) return;
      setImportacion(actual);
      if (actual.status === 'done' && actual.result) {
        const primero = actual.result.packs[0];
        guardarReciente(actual.result, urlArchivo(primero, primero.tray));
        return;
      }
      if (actual.status === 'error') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        return;
      }
      reloj = setTimeout(() => {
        consultar(nombre).then(seguir, (e) => vigente && setSinConexion(mensajeDe(e)));
      }, CONSULTA_MS);
    }

    setSinConexion(null);
    importar(nombre).then(seguir, (e) => vigente && setSinConexion(mensajeDe(e)));
    return () => {
      vigente = false;
      clearTimeout(reloj);
    };
  }, [nombre, intento]);

  const reintentar = () => {
    setImportacion(null);
    setIntento((n) => n + 1);
  };

  if (sinConexion) {
    return <Falla titulo="Sin conexión con el servidor" mensaje={sinConexion} onReintentar={reintentar} />;
  }
  if (importacion?.status === 'error') {
    return <Falla titulo="No se pudo convertir" mensaje={importacion.error ?? ''} onReintentar={reintentar} />;
  }
  if (importacion?.status === 'done' && importacion.result) {
    return <PackListo resultado={importacion.result} />;
  }
  return <Progreso nombre={nombre} importacion={importacion} />;
}

// ---------------------------------------------------------------------------

function Progreso({ nombre, importacion }: { nombre: string; importacion: Importacion | null }) {
  const tema = useTema();
  const insets = useSafeAreaInsets();
  const e = importacion ? etapa(importacion) : { titulo: 'Conectando…', detalle: '', avance: 0 };

  const avance = useSharedValue(0);
  useEffect(() => {
    avance.value = withTiming(e.avance, { duration: 400 });
  }, [e.avance, avance]);
  const barra = useAnimatedStyle(() => ({ width: `${Math.max(avance.value * 100, 2)}%` }));

  return (
    <View style={{ flex: 1, backgroundColor: tema.fondo, paddingTop: insets.top }}>
      <View style={{ height: 44, justifyContent: 'center', paddingHorizontal: espacio.lg }}>
        <BotonVolver onPress={router.back} texto="Inicio" />
      </View>

      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: espacio.xl, gap: espacio.lg, paddingBottom: 80 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espacio.md }}>
          <Ionicons name="paper-plane" size={30} color={tema.primario} />
          <Ionicons name="arrow-forward" size={20} color={tema.textoSuave} />
          <Ionicons name="logo-whatsapp" size={32} color={tema.whatsapp} />
        </View>

        <View style={{ gap: espacio.xs }}>
          <Text style={{ fontFamily: fuente.titulo, fontSize: 24, letterSpacing: -0.4, color: tema.texto, textAlign: 'center' }}>
            {e.titulo}
          </Text>
          <Text style={{ fontFamily: fuente.cuerpo, fontSize: 14, color: tema.textoSuave, textAlign: 'center' }}>
            {nombre}
            {e.detalle ? ` · ${e.detalle}` : ''}
          </Text>
        </View>

        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(e.avance * 100) }}
          style={{ height: 8, borderRadius: 4, backgroundColor: tema.superficieAlta, overflow: 'hidden' }}
        >
          <Animated.View style={[{ height: '100%', borderRadius: 4, backgroundColor: tema.primario }, barra]} />
        </View>

        <Text style={{ fontFamily: fuente.cuerpo, fontSize: 12.5, lineHeight: 18, color: tema.textoSuave, textAlign: 'center' }}>
          Los animados tardan más: cada uno se reencoda para pesar menos de 500 KB, que es lo máximo que acepta WhatsApp.
        </Text>
      </View>
    </View>
  );
}

function Falla({ titulo, mensaje, onReintentar }: { titulo: string; mensaje: string; onReintentar: () => void }) {
  const tema = useTema();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: tema.fondo, paddingTop: insets.top }}>
      <View style={{ height: 44, justifyContent: 'center', paddingHorizontal: espacio.lg }}>
        <BotonVolver onPress={router.back} texto="Inicio" />
      </View>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: espacio.xl, gap: espacio.lg, paddingBottom: 80 }}>
        <Ionicons name="alert-circle" size={44} color={tema.error} style={{ alignSelf: 'center' }} />
        <View style={{ gap: espacio.sm }}>
          <Text style={{ fontFamily: fuente.titulo, fontSize: 22, color: tema.texto, textAlign: 'center' }}>{titulo}</Text>
          <Text style={{ fontFamily: fuente.cuerpo, fontSize: 14, lineHeight: 20, color: tema.textoSuave, textAlign: 'center' }}>
            {mensaje}
          </Text>
        </View>
        <Boton titulo="Reintentar" icono="refresh" onPress={onReintentar} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------

function PackListo({ resultado }: { resultado: Resultado }) {
  const tema = useTema();
  const insets = useSafeAreaInsets();
  const { y, alDesplazar } = useDesplazamiento();

  const [seleccion, setSeleccion] = useState(resultado.packs[0].identifier);
  const [enviados, setEnviados] = useState<ReadonlySet<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  // El nombre en WhatsApp. Por defecto el de Telegram, que a veces es un anuncio.
  const [texto, setTexto] = useState(() => nombreGuardado(resultado.name) ?? resultado.title);
  const nombreConfirmado = useRef(limpiarNombre(texto) || resultado.title);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  const pack = resultado.packs.find((p) => p.identifier === seleccion) ?? resultado.packs[0];
  const indice = resultado.packs.indexOf(pack);
  const partes = resultado.packs.length;
  const varios = partes > 1;
  const explicacion = porQueSePartio(resultado);
  const elegido = limpiarNombre(texto) || resultado.title;

  /** Guarda el nombre si cambió. Devuelve si cambió. */
  function confirmarNombre(): boolean {
    if (elegido === nombreConfirmado.current) return false;
    nombreConfirmado.current = elegido;
    guardarNombre(resultado.name, elegido === resultado.title ? '' : elegido);
    // Con otro nombre WhatsApp las agrega como packs nuevos: hay que volver a
    // agregar todas las partes.
    setEnviados(new Set());
    return true;
  }

  async function agregar() {
    const yaEnviados = confirmarNombre() ? new Set<string>() : enviados;
    if (!WhatsApp.disponible) {
      avisar(
        'Este paso necesita la app instalada',
        'WhatsApp sólo acepta packs de una app instalada en el iPhone, y Expo Go no puede entregárselos.\n\n' +
          'Todo lo anterior ya funcionó: los stickers que ves son los mismos archivos que recibiría WhatsApp, ' +
          'y el servidor verificó que cumplen sus reglas.',
      );
      return;
    }
    setEnviando(true);
    try {
      if (!(await WhatsApp.whatsappInstalado())) {
        avisar('WhatsApp no está instalado', 'Instálalo desde el App Store y vuelve a intentarlo.');
        return;
      }
      const titulo = elegido === resultado.title ? undefined : elegido;
      await WhatsApp.enviarPack(await datosParaWhatsApp(resultado.name, pack, titulo));
      // Al volver de WhatsApp, queda lista la siguiente parte sin enviar.
      const ahora = new Set(yaEnviados).add(pack.identifier);
      setEnviados(ahora);
      const siguiente = resultado.packs.find((p) => !ahora.has(p.identifier));
      if (siguiente) setSeleccion(siguiente.identifier);
    } catch (e) {
      avisar('No se pudo enviar a WhatsApp', mensajeDe(e));
    } finally {
      setEnviando(false);
    }
  }

  const valido = pack.problems.length === 0;
  const progreso = progresoEnvio(resultado, enviados);

  return (
    <View style={{ flex: 1, backgroundColor: tema.fondo }}>
      <BarraCompacta fija titulo={elegido} y={y} izquierda={<BotonVolver onPress={router.back} texto="Inicio" />} />

      <Animated.ScrollView
        onScroll={alDesplazar}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{
          paddingTop: insets.top + 44 + espacio.md,
          paddingBottom: insets.bottom + 140,
          paddingHorizontal: espacio.lg,
          gap: espacio.lg,
        }}
      >
        <TituloGrande titulo={elegido} subtitulo={resumen(resultado)} y={y} />

        <Grupo
          titulo="Nombre en WhatsApp"
          nota={
            varios
              ? `Cada parte lleva su número al final: "${nombreEnWhatsApp(elegido, 1, partes)}".`
              : 'Así aparecerá el pack en WhatsApp.'
          }
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.md, paddingHorizontal: espacio.lg, minHeight: 48 }}>
            <Ionicons name="pencil" size={16} color={tema.textoSuave} />
            <TextInput
              value={texto}
              onChangeText={setTexto}
              onEndEditing={confirmarNombre}
              placeholder={resultado.title}
              placeholderTextColor={tema.textoSuave}
              returnKeyType="done"
              maxLength={120}
              clearButtonMode="while-editing"
              accessibilityLabel="Nombre del pack en WhatsApp"
              style={{ flex: 1, fontFamily: fuente.cuerpo, fontSize: 15, color: tema.texto, paddingVertical: espacio.sm }}
            />
          </View>
        </Grupo>

        {varios && (
          <View style={{ gap: espacio.sm }}>
            <Segmentado
              opciones={resultado.packs.map((p, i) => ({
                valor: p.identifier,
                etiqueta: `${partes > 4 ? '' : 'Parte '}${i + 1}${enviados.has(p.identifier) ? ' ✓' : ''}`,
              }))}
              valor={pack.identifier}
              onCambio={setSeleccion}
            />
            {explicacion && (
              <Text style={{ fontFamily: fuente.cuerpo, fontSize: 12, lineHeight: 17, color: tema.textoSuave, paddingHorizontal: espacio.md }}>
                {explicacion}
              </Text>
            )}
          </View>
        )}

        <Grupo sangria={espacio.lg + 36 + espacio.md}>
          <Fila
            izquierda={<Image source={{ uri: urlArchivo(pack, pack.tray) }} style={{ width: 36, height: 36 }} contentFit="contain" />}
            titulo={nombreEnWhatsApp(elegido, indice + 1, partes)}
            detalle={descripcionPack(pack)}
          />
          {valido ? (
            <Fila
              izquierda={<Insignia icono="checkmark" color={tema.whatsapp} />}
              titulo="Cumple las reglas de WhatsApp"
              detalle={`WebP de 512×512, menos de ${pack.animated ? '500' : '100'} KB cada uno`}
            />
          ) : (
            <Fila
              izquierda={<Insignia icono="warning" color={tema.error} />}
              titulo="WhatsApp lo rechazaría"
              detalle={pack.problems.slice(0, 3).join('\n')}
            />
          )}
        </Grupo>

        <Cuadricula pack={pack} />

        {resultado.skipped > 0 && (
          <Text style={{ fontFamily: fuente.cuerpo, fontSize: 12, color: tema.textoSuave, paddingHorizontal: espacio.md }}>
            {resultado.skipped} {resultado.skipped === 1 ? 'sticker no se pudo convertir y se omitió' : 'stickers no se pudieron convertir y se omitieron'}.
          </Text>
        )}
      </Animated.ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: espacio.lg,
          paddingTop: espacio.md,
          paddingBottom: insets.bottom + espacio.md,
          gap: espacio.sm,
          backgroundColor: tema.fondo,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: tema.borde,
        }}
      >
        <Boton
          titulo={
            enviados.has(pack.identifier)
              ? 'Agregar de nuevo'
              : varios
                ? `Agregar parte ${indice + 1} de ${partes} a WhatsApp`
                : 'Agregar a WhatsApp'
          }
          icono="logo-whatsapp"
          color={tema.whatsapp}
          colorTexto={tema.textoSobreWhatsapp}
          onPress={agregar}
          cargando={enviando}
          deshabilitado={!valido}
        />
        <Text
          accessibilityLiveRegion="polite"
          style={{
            fontFamily: progreso ? fuente.cuerpoFuerte : fuente.cuerpo,
            fontSize: 12,
            color: progreso ? tema.texto : tema.textoSuave,
            textAlign: 'center',
          }}
        >
          {progreso ??
            (WhatsApp.disponible
              ? 'Se abrirá WhatsApp para que confirmes.'
              : 'En Expo Go este último paso no está disponible.')}
        </Text>
      </View>
    </View>
  );
}

function Insignia({ icono, color }: { icono: 'checkmark' | 'warning'; color: string }) {
  return (
    <View style={{ width: 36, alignItems: 'center' }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icono} size={16} color="#fff" />
      </View>
    </View>
  );
}

/** Los stickers como se verán en WhatsApp: cuatro por fila, animados. */
function Cuadricula({ pack }: { pack: PackWhatsApp }) {
  const tema = useTema();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
      {pack.stickers.map((s, i) => (
        <View key={`${pack.identifier}-${s.file}-${i}`} style={{ width: '25%', padding: 4 }}>
          <View
            style={{
              aspectRatio: 1,
              borderRadius: radio.md,
              backgroundColor: tema.superficie,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: tema.borde,
              padding: 6,
            }}
          >
            <Image
              source={{ uri: urlArchivo(pack, s.file) }}
              style={{ flex: 1 }}
              contentFit="contain"
              autoplay
              transition={120}
              accessibilityLabel={`Sticker ${s.emojis.join(' ')}`}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
