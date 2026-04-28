import { useEffect, useRef, useState } from 'react';
import { useEventListener } from 'expo';
import {
  Animated,
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Asset } from 'expo-asset';
import MapView, { Marker } from 'react-native-maps';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT = '#C86A4A';
const OFF_WHITE = '#F5F1E8';
const BROWN = '#7A5C4D';
const STAMP_FONT = 'Courier New';
const PIN_SIZE = 64;

const CLIP_MODULE = require('../../assets/onboarding/clip.mov');

const CLIPS = [
  { time: '19:14', date: '2023.08.21', latitude: 48.8584,  longitude: 2.2945,    pinTs: new Date('2023-08-21').getTime() },
  { time: '17:52', date: '2024.12.28', latitude: -34.9698, longitude: 138.5108,  pinTs: new Date('2024-12-28').getTime() },
  { time: '21:07', date: '2025.02.14', latitude: 51.0374,  longitude: -114.0520, pinTs: new Date('2025-02-14').getTime() },
];

const WORLD_REGION  = { latitude: 32, longitude: -30,  latitudeDelta: 110, longitudeDelta: 200 };
const FINAL_REGION  = { latitude: 20, longitude: 20,   latitudeDelta: 120, longitudeDelta: 160 };

// ─── PolaroidPin — copied directly from MapScreen ─────────────────────────────

function formatPinDate(ts) {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}.${mm}.${yy}`;
}

function PolaroidPin({ thumbnailUri, timestamp, size = PIN_SIZE }) {
  const imgH   = Math.round(size * 0.68);
  const stripH = Math.round(size * 0.24);
  const pad    = Math.round(size * 0.07);
  const fontSize = Math.max(7, Math.round(size * 0.14));
  return (
    <View style={pinStyles.container}>
      <View style={[pinStyles.frame, { width: size, backgroundColor: ACCENT }]}>
        <View style={[pinStyles.imageWrapper, { margin: pad, marginBottom: 0, height: imgH }]}>
          {thumbnailUri
            ? <Image source={{ uri: thumbnailUri }} style={pinStyles.image} resizeMode="cover" />
            : <View style={pinStyles.placeholder} />
          }
        </View>
        <View style={[pinStyles.strip, { height: stripH, backgroundColor: ACCENT }]}>
          <Text style={[pinStyles.dateText, { color: OFF_WHITE, fontSize }]}>
            {formatPinDate(timestamp)}
          </Text>
        </View>
      </View>
      <View style={pinStyles.stem} />
      <View style={pinStyles.dot} />
    </View>
  );
}

// ─── AhaScreen ────────────────────────────────────────────────────────────────

export default function AhaScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  // ── State ──────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState('loading'); // 'loading' | 'clips' | 'mapPayoff'
  const [currentTime, setCurrentTime] = useState(0);
  const [thumbnails, setThumbnails] = useState([null, null, null]);
  const clipIndex = currentTime < 4 ? 0 : currentTime < 8 ? 1 : 2;

  // ── Animated values ────────────────────────────────────────────────────────
  const fadeToBlack  = useRef(new Animated.Value(0)).current;
  const clip3Overlay = useRef(new Animated.Value(0)).current;
  const mapOpacity   = useRef(new Animated.Value(0)).current;
  const copyOpacity  = useRef(new Animated.Value(0)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const pinAnims = useRef(
    CLIPS.map(() => ({
      opacity:    new Animated.Value(0),
      translateY: new Animated.Value(-20),
    }))
  ).current;

  // ── Refs ───────────────────────────────────────────────────────────────────
  const mapRef            = useRef(null);
  const timer1Ref         = useRef(null);
  const timer2Ref         = useRef(null);
  const timer3Ref         = useRef(null);
  const textTimerRef      = useRef(null);
  const driftTimerRef     = useRef(null);
  const driftDirectionRef = useRef(1);
  const sequenceStartedRef = useRef(false);
  const recFlash = useRef(new Animated.Value(1)).current;
  const recAnimRef = useRef(null);

  // Pulse the REC dot while clips are playing
  useEffect(() => {
    if (phase === 'clips') {
      recAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(recFlash, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(recFlash, { toValue: 0, duration: 500, useNativeDriver: true }),
        ])
      );
      recAnimRef.current.start();
    } else {
      recAnimRef.current?.stop();
      recFlash.setValue(1);
    }
    return () => recAnimRef.current?.stop();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Single player ──────────────────────────────────────────────────────────
  const player = useVideoPlayer(Asset.fromModule(CLIP_MODULE).uri, p => { p.loop = false; p.timeUpdateEventInterval = 0.1; });

  useEventListener(player, 'timeUpdate', ({ currentTime: t }) => {
    setCurrentTime(t);
  });

  // When video is actually ready: anchor the timed sequence to real playback start
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status !== 'readyToPlay') return;
    if (sequenceStartedRef.current) return;
    sequenceStartedRef.current = true;

    // At 12s: fade in clip 3 overlay
    textTimerRef.current = setTimeout(() => {
      Animated.timing(clip3Overlay, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    }, 12000);

    // At 16s: pause, fade to black, then map payoff
    timer1Ref.current = setTimeout(() => {
      player.pause();
      Animated.timing(fadeToBlack, { toValue: 1, duration: 500, useNativeDriver: true }).start(() => {
        timer2Ref.current = setTimeout(() => {
          setPhase('mapPayoff');
          fadeToBlack.setValue(0);
          startMapPayoff();
        }, 300);
      });
    }, 16000);
  });

  // On mount: show UI immediately and begin buffering
  useEffect(() => {
    setPhase('clips');
    player.play();

    return () => {
      [timer1Ref, timer2Ref, timer3Ref, textTimerRef, driftTimerRef].forEach(r => {
        if (r.current) clearTimeout(r.current);
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Thumbnail generation ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function generate() {
      try {
        const asset = Asset.fromModule(CLIP_MODULE);
        await asset.downloadAsync();
        const localUri = asset.localUri ?? asset.uri;
        const THUMB_TIMES = [2000, 5000, 10000];
        const uris = await Promise.all(
          THUMB_TIMES.map(async (time) => {
            const { uri } = await VideoThumbnails.getThumbnailAsync(localUri, { time });
            return uri;
          })
        );
        if (!cancelled) setThumbnails(uris);
      } catch (err) {
        console.warn('AhaScreen: thumbnail generation failed:', err);
      }
    }
    generate();
    return () => { cancelled = true; };
  }, []);

  // ── Ambient drift ──────────────────────────────────────────────────────────
  function startDrift() {
    const tick = () => {
      const dir = driftDirectionRef.current;
      mapRef.current?.animateToRegion({
        latitude:      FINAL_REGION.latitude  + dir * 0.3,
        longitude:     FINAL_REGION.longitude + dir * 0.3,
        latitudeDelta:  FINAL_REGION.latitudeDelta,
        longitudeDelta: FINAL_REGION.longitudeDelta,
      }, 8000);
      driftDirectionRef.current = -dir;
      driftTimerRef.current = setTimeout(tick, 8000);
    };
    driftTimerRef.current = setTimeout(tick, 8000);
  }

  // ── Drop a single pin ──────────────────────────────────────────────────────
  function dropPin(index) {
    Animated.parallel([
      Animated.spring(pinAnims[index].translateY, {
        toValue: 0,
        tension: 60,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(pinAnims[index].opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }

  // ── Map payoff sequence ────────────────────────────────────────────────────
  function startMapPayoff() {
    Animated.timing(mapOpacity, { toValue: 1, duration: 600, useNativeDriver: true }).start(() => {

      // Drop pin 0, then begin the single slow pan to the all-pins region
      timer1Ref.current = setTimeout(() => {
        dropPin(0);
        mapRef.current?.animateToRegion(FINAL_REGION, 2000);

        // Drop pin 1
        timer2Ref.current = setTimeout(() => {
          dropPin(1);

          // Drop pin 2
          timer3Ref.current = setTimeout(() => {
            dropPin(2);

            // After pan has settled, fade in copy then button
            timer1Ref.current = setTimeout(() => {
              Animated.timing(copyOpacity, { toValue: 1, duration: 800, useNativeDriver: true }).start(() => {
                timer2Ref.current = setTimeout(() => {
                  Animated.timing(buttonOpacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();
                }, 400);
              });

              timer3Ref.current = setTimeout(() => {
                startDrift();
              }, 800);
            }, 1800);
          }, 800);
        }, 800);
      }, 600);
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const currentClip = CLIPS[clipIndex];
  const inClips = phase === 'clips';

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden />

      {/* ── Map (always rendered so it warms up; opacity controlled) ── */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: mapOpacity }]}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          mapType="mutedStandard"
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          showsCompass={false}
          showsScale={false}
          showsUserLocation={false}
          showsPointsOfInterest={false}
          showsBuildings={false}
          showsTraffic={false}
          initialRegion={WORLD_REGION}
        >
          {CLIPS.map((clip, i) => (
            <Marker
              key={i}
              coordinate={{ latitude: clip.latitude, longitude: clip.longitude }}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
            >
              <Animated.View style={{
                opacity:   pinAnims[i].opacity,
                transform: [{ translateY: pinAnims[i].translateY }],
              }}>
                <PolaroidPin thumbnailUri={thumbnails[i]} timestamp={clip.pinTs} />
              </Animated.View>
            </Marker>
          ))}
        </MapView>
      </Animated.View>

      <VideoView
        player={player}
        style={[StyleSheet.absoluteFillObject, { opacity: inClips ? 1 : 0 }]}
        contentFit="cover"
        nativeControls={false}
      />

      {/* ── Camcorder stamp — mirrors VideoStamp / CameraScreen exactly ── */}
      {inClips && currentClip && (
        <View style={ss.stampWrap} pointerEvents="none">
          <Animated.View style={ss.recRow}>
            <Animated.View style={[ss.recDot, { opacity: recFlash }]} />
            <Text style={ss.recText}>REC</Text>
          </Animated.View>
          <Text style={ss.stampTime}>{currentClip.time}</Text>
          <Text style={ss.stampDate}>{currentClip.date}</Text>
        </View>
      )}

      {/* ── Clip 3 centred copy (overlay + text fade in together) ── */}
      {inClips && currentTime >= 8 && (
        <Animated.View
          style={[StyleSheet.absoluteFillObject, { opacity: clip3Overlay }]}
          pointerEvents="none"
        >
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
          <View style={ss.clip3TextWrap}>
            <Text style={ss.clip3Text}>Live these moments, don't act them.</Text>
          </View>
        </Animated.View>
      )}

      {/* ── Map copy block ── */}
      <Animated.View style={[ss.copyWrap, { opacity: copyOpacity }]} pointerEvents="none">
        <View style={ss.copyBg}>
          <Text style={ss.copyLine1}>Live first. Document second.</Text>
          <Text style={ss.copyLine2}>avyda</Text>
        </View>
      </Animated.View>

      {/* ── CTA button ── */}
      <Animated.View style={[ss.buttonWrap, { opacity: buttonOpacity, bottom: 48 + insets.bottom }]}>
        <Pressable
          style={ss.button}
          onPress={() => navigation.navigate('PermissionsIntroScreen')}
        >
          <Text style={ss.buttonText}>I'm ready.</Text>
        </Pressable>
      </Animated.View>

      {/* ── Progress dots (clips only) ── */}
      {inClips && (
        <View style={[ss.dotsRow, { bottom: 40 + insets.bottom }]} pointerEvents="none">
          {CLIPS.map((_, i) => (
            <View
              key={i}
              style={[ss.dot, i === clipIndex ? ss.dotActive : ss.dotInactive]}
            />
          ))}
        </View>
      )}

      {/* ── Fade-to-black transition overlay ── */}
      <Animated.View
        style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', opacity: fadeToBlack }]}
        pointerEvents="none"
      />
    </View>
  );
}

// ─── Pin styles (copied from MapScreen) ───────────────────────────────────────

const pinStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  frame: {
    borderRadius: 3,
    overflow: 'hidden',
  },
  imageWrapper: {
    overflow: 'hidden',
    borderRadius: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    backgroundColor: BROWN,
    opacity: 0.4,
  },
  strip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: {
    fontFamily: STAMP_FONT,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  stem: {
    width: 2,
    height: 8,
    backgroundColor: BROWN,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BROWN,
  },
});

// ─── Screen styles ────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  // Camcorder stamp — matches stampStyles.topLeft / VideoStamp exactly
  stampWrap: {
    position: 'absolute',
    top: 57,
    left: 16,
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  recDot: {
    width: 8.5,
    height: 8.5,
    borderRadius: 4.25,
    backgroundColor: '#E63946',
  },
  recText: {
    fontFamily: 'Courier New',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.88,
    color: '#E63946',
  },
  stampTime: {
    fontFamily: 'Courier New',
    fontSize: 19,
    fontWeight: '500',
    letterSpacing: 0.95,
    color: '#F5F1E8',
  },
  stampDate: {
    fontFamily: 'Courier New',
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: 0.64,
    color: '#F5F1E8',
    opacity: 0.85,
  },

  clip3TextWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  clip3Text: {
    color: OFF_WHITE,
    fontSize: 20,
    fontWeight: '500',
    textAlign: 'center',
  },

  copyWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copyBg: {
    backgroundColor: 'rgba(0,0,0,0.40)',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
  },
  copyLine1: {
    color: OFF_WHITE,
    fontSize: 24,
    fontWeight: '500',
    textAlign: 'center',
  },
  copyLine2: {
    color: ACCENT,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 8,
  },

  buttonWrap: {
    position: 'absolute',
    left: 32,
    right: 32,
  },
  button: {
    backgroundColor: ACCENT,
    borderRadius: 24,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: OFF_WHITE,
    fontSize: 16,
    fontWeight: '500',
  },

  dotsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: ACCENT,
  },
  dotInactive: {
    backgroundColor: `${OFF_WHITE}4D`,
  },
});
