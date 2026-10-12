import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { revisarEnlace } from '../src/dominio/enlace';
import { servidorDisponible, urlServidor } from '../src/servicios/api';
import { leerRecientes, type Reciente } from '../src/servicios/historial';
import { BarraCompacta, Boton, Fila, Grupo, TituloGrande, useDesplazamiento } from '../src/ui/iOS';
import { espacio, fuente, radio, useTema } from '../src/ui/tema';

type EstadoServidor = 'revisando' | 'listo' | 'caido';

export default function Inicio() {
  const tema = useTema();
  const insets = useSafeAreaInsets();
  const { y, alDesplazar } = useDesplazamiento();

  const [texto, setTexto] = useState('');
  // El error se muestra hasta que el usuario intenta convertir o pega: regañar
  // mientras escribe "t.me/add…" sólo estorba.
  const [intento, setIntento] = useState(false);
  const [recientes, setRecientes] = useState<Reciente[]>([]);
  const [servidor, setServidor] = useState<EstadoServidor>('revisando');

  const revisarServidor = useCallback(() => {
    let vigente = true;
    setServidor('revisando');
    servidorDisponible().then((ok) => vigente && setServidor(ok ? 'listo' : 'caido'));
    return () => {
      vigente = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setRecientes(leerRecientes());
      return revisarServidor();
    }, [revisarServidor]),
  );

  const veredicto = revisarEnlace(texto);

  function abrir(nombre: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push({ pathname: '/pack/[nombre]', params: { nombre } });
  }

  function convertir() {
    setIntento(true);
    if (veredicto.tipo === 'valido') {
      abrir(veredicto.nombre);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  }

  async function pegar() {
    const pegado = (await Clipboard.getStringAsync().catch(() => '')).trim();
    if (!pegado) return;
    setTexto(pegado);
    setIntento(true);
    // Si lo pegado ya es un pack no hace falta otro toque: se convierte.
    const v = revisarEnlace(pegado);
    if (v.tipo === 'valido') abrir(v.nombre);
  }

  const error = intento && veredicto.tipo === 'invalido' ? veredicto.motivo : null;

  return (
    <View style={{ flex: 1, backgroundColor: tema.fondo }}>
      <BarraCompacta titulo="StickerBridge" y={y} />

      <Animated.ScrollView
        onScroll={alDesplazar}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{
          paddingTop: insets.top + espacio.xxl,
          paddingBottom: insets.bottom + espacio.xxl,
          paddingHorizontal: espacio.lg,
          gap: espacio.xl,
        }}
      >
        <TituloGrande titulo="StickerBridge" subtitulo="De Telegram a WhatsApp, con el puro link." y={y} />

        <View
          style={{
            backgroundColor: tema.superficie,
            borderRadius: radio.lg,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: tema.borde,
            padding: espacio.lg,
            gap: espacio.md,
          }}
        >
          <Text style={{ fontFamily: fuente.cuerpoFuerte, fontSize: 15, color: tema.texto }}>Link del pack</Text>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: espacio.sm,
              minHeight: 48,
              paddingLeft: espacio.md,
              paddingRight: 6,
              borderRadius: radio.md,
              backgroundColor: tema.fondo,
              borderWidth: 1.5,
              borderColor: error ? tema.error : 'transparent',
            }}
          >
            <Ionicons name="link" size={17} color={tema.textoSuave} />
            <TextInput
              value={texto}
              onChangeText={setTexto}
              onSubmitEditing={convertir}
              placeholder="t.me/addstickers/…"
              placeholderTextColor={tema.textoSuave}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              clearButtonMode="while-editing"
              accessibilityLabel="Link del pack de Telegram"
              style={{ flex: 1, fontFamily: fuente.cuerpo, fontSize: 15, color: tema.texto, paddingVertical: espacio.sm }}
            />
            <Pressable
              onPress={pegar}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: espacio.md,
                minHeight: 36,
                borderRadius: radio.sm,
                backgroundColor: tema.primarioSuave,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Ionicons name="clipboard-outline" size={15} color={tema.primario} />
              <Text style={{ fontFamily: fuente.cuerpoFuerte, fontSize: 14, color: tema.primario }}>Pegar</Text>
            </Pressable>
          </View>

          {error && (
            <Text accessibilityLiveRegion="polite" style={{ fontFamily: fuente.cuerpo, fontSize: 13, lineHeight: 18, color: tema.error }}>
              {error}
            </Text>
          )}

          <Boton titulo="Convertir" icono="swap-horizontal" onPress={convertir} deshabilitado={veredicto.tipo === 'vacio'} />
        </View>

        {servidor === 'caido' && <AvisoServidor onReintentar={revisarServidor} />}

        <Grupo
          titulo="Cómo sacar el link"
          nota="Funciona con packs estáticos, animados y de video. WhatsApp acepta hasta 30 stickers por pack: si el de Telegram trae más, se reparte en varios."
        >
          <Fila izquierda={<Paso n={1} />} titulo="Abre el pack en Telegram" detalle="Toca cualquier sticker del pack en un chat." />
          <Fila izquierda={<Paso n={2} />} titulo="Copia su enlace" detalle="En el menú del pack (⋯ o Compartir), elige Copiar enlace." />
          <Fila izquierda={<Paso n={3} />} titulo="Vuelve y toca Pegar" detalle="La conversión empieza sola." />
        </Grupo>

        {recientes.length > 0 && (
          <Grupo titulo="Recientes" sangria={espacio.lg + 36 + espacio.md}>
            {recientes.map((r) => (
              <Fila
                key={r.nombre}
                izquierda={
                  <Image
                    source={{ uri: r.icono }}
                    style={{ width: 36, height: 36 }}
                    contentFit="contain"
                    accessibilityIgnoresInvertColors
                  />
                }
                titulo={r.nombreWhatsApp ?? r.titulo}
                detalle={`${r.stickers} stickers${r.packs > 1 ? ` · ${r.packs} partes` : ''}`}
                onPress={() => abrir(r.nombre)}
              />
            ))}
          </Grupo>
        )}
      </Animated.ScrollView>
    </View>
  );
}

function Paso({ n }: { n: number }) {
  const tema = useTema();
  return (
    <View
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: tema.primarioSuave,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: fuente.cuerpoFuerte, fontSize: 13, color: tema.primario }}>{n}</Text>
    </View>
  );
}

/** El servidor corre en la PC; sin él no hay conversión, y hay que decirlo claro. */
function AvisoServidor({ onReintentar }: { onReintentar: () => void }) {
  const tema = useTema();
  return (
    <View style={{ backgroundColor: tema.errorSuave, borderRadius: radio.lg, padding: espacio.lg, gap: espacio.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm }}>
        <Ionicons name="cloud-offline-outline" size={20} color={tema.error} />
        <Text style={{ flex: 1, fontFamily: fuente.cuerpoFuerte, fontSize: 15, color: tema.texto }}>
          No encuentro el servidor
        </Text>
      </View>
      <Text style={{ fontFamily: fuente.cuerpo, fontSize: 13, lineHeight: 19, color: tema.texto }}>
        La app habla con él a través de {urlServidor()}, pero no contesta. En la PC, dentro de la carpeta del
        proyecto, corre:
      </Text>
      <Text
        selectable
        style={{
          fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
          fontSize: 12,
          color: tema.texto,
          backgroundColor: tema.superficie,
          borderRadius: radio.sm,
          padding: espacio.sm,
        }}
      >
        docker compose -f docker-compose.dev.yml up
      </Text>
      <Pressable onPress={onReintentar} accessibilityRole="button" hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
        <Text style={{ fontFamily: fuente.cuerpoFuerte, fontSize: 14, color: tema.primario }}>Reintentar</Text>
      </Pressable>
    </View>
  );
}
