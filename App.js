import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Animated, FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system/next';
import * as Location from 'expo-location';
import { useVideoPlayer, VideoView } from 'expo-video';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';

const clipsDir = new Directory(Paths.document, 'clips');
const indexFile = new File(Paths.document, 'index.json');

const COLORS = {
  background: '#1F1F1F',
  accent: '#C86A4A',
  secondary: '#7A5C4D',
  text: '#F5F1E8',
  rec: '#E63946',
  surface: COLORS.surface,
};

const STAMP_FONT = 'Courier New';

const Tab = createBottomTabNavigator();
const RecordingContext = createContext({ isRecording: false, setIsRecording: () => {} });
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatStampTime(timestamp) {
  const d = new Date(timestamp);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  return `${hour}:${m}${ampm}`;
}

function formatStampDate(timestamp) {
  return new Date(timestamp)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase()
    .replace(',', '');
}

function formatCoords(location) {
  if (!location) return '';
  const { latitude: lat, longitude: lon } = location;
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
}

function formatClipNumber(n) {
  return `■ ${String(n).padStart(4, '0')}`;
}

// ─── Tab icons ────────────────────────────────────────────────────────────────

function FeedIcon({ color }) {
  return (
    <View style={{ justifyContent: 'center', gap: 4 }}>
      <View style={{ width: 18, height: 1.5, backgroundColor: color }} />
      <View style={{ width: 18, height: 1.5, backgroundColor: color }} />
      <View style={{ width: 18, height: 1.5, backgroundColor: color }} />
    </View>
  );
}

function RecordTabIcon() {
  return (
    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.accent }} />
  );
}

function LocationPin({ color, size = 16 }) {
  const circleSize = size * 0.65;
  const triangleWidth = circleSize * 0.4;
  const triangleHeight = circleSize * 0.5;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{
        width: circleSize, height: circleSize, borderRadius: circleSize / 2,
        backgroundColor: color,
      }} />
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: triangleWidth,
        borderRightWidth: triangleWidth,
        borderTopWidth: triangleHeight,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: color,
        marginTop: -1,
      }} />
    </View>
  );
}

function MapIcon({ color }) {
  return (
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      <LocationPin color={color} size={20} />
    </View>
  );
}

// ─── Map screen placeholder ───────────────────────────────────────────────────

function MapScreen() {
  return <View style={{ flex: 1, backgroundColor: COLORS.background }} />;
}

// ─── Camera screen ────────────────────────────────────────────────────────────

function CameraScreen() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
  const [isRecording, setIsRecording] = useState(false);
  const { setIsRecording: setGlobalRecording } = useContext(RecordingContext);

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [locationStamp, setLocationStamp] = useState(null);
  const [currentTime, setCurrentTime] = useState('');

  const borderPulse = useRef(new Animated.Value(0)).current;
  const recFlash = useRef(new Animated.Value(1)).current;
  const recordTransition = useRef(new Animated.Value(0)).current;
  const borderAnim = useRef(null);
  const recAnim = useRef(null);

  const cameraRef = useRef(null);
  const isRecordingRef = useRef(false);
  const recordingStartTime = useRef(null);

  useEffect(() => {
    requestLocationPermission();
  }, []);

  // Live clock — functional setter skips re-render when formatted string is unchanged
  useEffect(() => {
    const update = () => {
      const next = formatStampTime(Date.now());
      setCurrentTime(prev => (prev === next ? prev : next));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  // Capture location on screen entry for stamp display
  useFocusEffect(
    useCallback(() => {
      getLocation().then(loc => { if (loc) setLocationStamp(loc); });
    }, [])
  );

  // Button transition + pulsing border + REC flash animations
  useEffect(() => {
    return () => {
      if (borderAnim.current) borderAnim.current.stop();
      if (recAnim.current) recAnim.current.stop();
    };
  }, []);

  useEffect(() => {
    Animated.timing(recordTransition, {
      toValue: isRecording ? 1 : 0,
      duration: 150,
      useNativeDriver: false,
    }).start();

    if (isRecording) {
      borderAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(borderPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(borderPulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        ])
      );
      borderAnim.current.start();
      recAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(recFlash, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(recFlash, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      recAnim.current.start();
    } else {
      if (borderAnim.current) borderAnim.current.stop();
      if (recAnim.current) recAnim.current.stop();
      borderPulse.setValue(0);
      recFlash.setValue(1);
    }
  }, [isRecording]);

  const getLocation = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      console.log('Location captured:', loc.coords.latitude, loc.coords.longitude);
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    } catch (_) {
      return null;
    }
  };

  const saveClip = async (tempUri, location, duration) => {
    if (!clipsDir.exists) {
      clipsDir.create();
    }

    const timestamp = Date.now();
    const destFile = new File(clipsDir, `clip_${timestamp}.mp4`);
    new File(tempUri).move(destFile);
    console.log('Clip saved permanently:', destFile.uri);

    let clips = [];
    if (indexFile.exists) {
      try {
        const raw = await indexFile.text();
        clips = JSON.parse(raw);
      } catch (_) {
        clips = [];
      }
    }

    const entry = { uri: destFile.uri, timestamp, location, duration };
    clips.push(entry);
    indexFile.write(JSON.stringify(clips));
    console.log('Index updated, total clips:', clips.length, '| latest entry:', JSON.stringify(entry));
  };

  const handleRequestPermissions = async () => {
    await requestCameraPermission();
    await requestMicPermission();
    await requestLocationPermission();
  };

  const startRecording = async () => {
    if (cameraRef.current && !isRecordingRef.current) {
      isRecordingRef.current = true;
      recordingStartTime.current = Date.now();
      setIsRecording(true);
      setGlobalRecording(true);
      const locationPromise = getLocation();
      try {
        const result = await cameraRef.current.recordAsync();
        const location = await locationPromise;
        const duration = Math.round((Date.now() - recordingStartTime.current) / 1000);
        console.log('Duration:', duration, 'seconds');
        await saveClip(result.uri, location, duration);
      } catch (error) {
        console.error('Recording error:', error);
      }
      isRecordingRef.current = false;
      setIsRecording(false);
      setGlobalRecording(false);
    }
  };

  const stopRecording = () => {
    if (cameraRef.current && isRecordingRef.current) {
      cameraRef.current.stopRecording();
    }
  };

  if (!cameraPermission || !micPermission) {
    return <View style={styles.container} />;
  }

  if (!cameraPermission.granted || !micPermission.granted) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.permissionText}>
          Vora needs access to your camera and microphone.
        </Text>
        <Pressable style={styles.permissionButton} onPress={handleRequestPermissions}>
          <Text style={styles.permissionButtonText}>Grant Access</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={{ position: 'absolute', top: 0, left: 0, width: screenWidth, height: screenHeight }}
        mode="video"
        facing="back"
      />

      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 8, left: 8,
          width: screenWidth - 16,
          height: screenHeight - 16,
          borderWidth: 6,
          borderColor: COLORS.accent,
          opacity: borderPulse,
        }}
      />

      <View style={stampStyles.topLeft} pointerEvents="none">
        <Animated.View style={[stampStyles.recRow, { opacity: isRecording ? recFlash : 0 }]}>
          <View style={stampStyles.recDot} />
          <Text style={stampStyles.recText}>REC</Text>
        </Animated.View>
        <Text style={stampStyles.time}>{currentTime}</Text>
        {locationStamp ? (
          <Text style={stampStyles.coords}>{formatCoords(locationStamp)}</Text>
        ) : null}
      </View>

      <View style={[styles.buttonRow, { bottom: isRecording ? 100 : 40 }]}>
        <AnimatedPressable
          onPressIn={startRecording}
          onPressOut={stopRecording}
          style={[styles.recordOuter, {
            backgroundColor: recordTransition.interpolate({
              inputRange: [0, 1],
              outputRange: ['transparent', COLORS.accent],
            }),
          }]}
        >
          <Animated.View style={[styles.recordInner, {
            borderWidth: 3,
            borderColor: recordTransition.interpolate({
              inputRange: [0, 1],
              outputRange: ['transparent', COLORS.background],
            }),
          }]} />
        </AnimatedPressable>
      </View>
    </View>
  );
}

// ─── Video player ─────────────────────────────────────────────────────────────

function VideoPlayer({ clip, onClose }) {
  const player = useVideoPlayer({ uri: clip.uri }, (p) => {
    p.play();
  });

  return (
    <Modal visible animationType="none" onRequestClose={onClose}>
      <View style={playerStyles.container}>
        <VideoView
          player={player}
          style={playerStyles.video}
          contentFit="cover"
          nativeControls
        />

        {/* State 3 camcorder stamp */}
        <View style={stampStyles.topLeft} pointerEvents="none">
          <Text style={stampStyles.time}>{formatStampTime(clip.timestamp)}</Text>
          {clip.location ? (
            <Text style={stampStyles.coords}>{formatCoords(clip.location)}</Text>
          ) : null}
        </View>
        <View style={stampStyles.bottomLeft} pointerEvents="none">
          <Text style={stampStyles.bottomStamp}>{formatClipNumber(clip.clipNumber)}</Text>
        </View>
        <View style={stampStyles.bottomRight} pointerEvents="none">
          <Text style={stampStyles.bottomStamp}>{formatStampDate(clip.timestamp)}</Text>
        </View>

        <Pressable style={playerStyles.closeButton} onPress={onClose}>
          <Text style={playerStyles.closeText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ─── Feed screen ──────────────────────────────────────────────────────────────

function FeedScreen() {
  const [clips, setClips] = useState([]);
  const [selectedClip, setSelectedClip] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadClips();
    }, [])
  );

  const loadClips = async () => {
    if (!indexFile.exists) {
      setClips([]);
      return;
    }
    try {
      const raw = await indexFile.text();
      const parsed = JSON.parse(raw);
      setClips([...parsed].reverse());
    } catch (_) {
      setClips([]);
    }
  };

  const deleteClip = (item) => {
    Alert.alert('Delete this clip?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            new File(item.uri).delete();
            const raw = await indexFile.text();
            const parsed = JSON.parse(raw);
            const updated = parsed.filter((c) => c.timestamp !== item.timestamp);
            indexFile.write(JSON.stringify(updated));
            setClips((prev) => prev.filter((c) => c.timestamp !== item.timestamp));
          } catch (_) {
            Alert.alert('Error', 'Could not delete the clip. Please try again.');
          }
        },
      },
    ]);
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday - 24 * 60 * 60 * 1000);
    const startOfWeek = new Date(startOfToday - 6 * 24 * 60 * 60 * 1000);

    const time = date.toLocaleString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
      .toLowerCase().replace('\u202f', '');

    if (date >= startOfToday) {
      return `Today · ${time}`;
    } else if (date >= startOfYesterday) {
      return `Yesterday · ${time}`;
    } else if (date >= startOfWeek) {
      const day = date.toLocaleString('en-AU', { weekday: 'long' });
      return `${day} · ${time}`;
    } else {
      const label = date.toLocaleString('en-AU', { day: 'numeric', month: 'short' });
      return `${label} · ${time}`;
    }
  };

  const formatDuration = (duration) => {
    if (duration == null) return null;
    if (duration < 60) return `${duration}s`;
    return `${Math.floor(duration / 60)}m ${duration % 60}s`;
  };

  if (clips.length === 0) {
    return (
      <View style={[feedStyles.container, styles.centered]}>
        <Text style={feedStyles.emptyText}>No clips yet.</Text>
      </View>
    );
  }

  return (
    <View style={feedStyles.container}>
      {selectedClip && (
        <VideoPlayer clip={selectedClip} onClose={() => setSelectedClip(null)} />
      )}
      <FlatList
        data={clips}
        keyExtractor={(item) => String(item.timestamp)}
        contentContainerStyle={feedStyles.list}
        renderItem={({ item, index }) => (
          <Pressable
            style={feedStyles.card}
            onPress={() => setSelectedClip({ ...item, clipNumber: clips.length - index })}
          >
            <View style={feedStyles.cardMain}>
              <View style={feedStyles.avatar}>
                <Text style={feedStyles.avatarText}>Y</Text>
              </View>
              <View style={feedStyles.cardInfo}>
                <Text style={feedStyles.username}>You</Text>
                <Text style={feedStyles.cardDate}>{formatDate(item.timestamp)}</Text>
                {item.duration != null && (
                  <Text style={feedStyles.duration}>{formatDuration(item.duration)}</Text>
                )}
              </View>
            </View>
            <View style={feedStyles.cardActions}>
              <Pressable style={feedStyles.hereTooButton}>
                <LocationPin color={COLORS.accent} size={18} />
              </Pressable>
              <Pressable onPress={() => deleteClip(item)} hitSlop={8} style={feedStyles.deleteButton}>
                <Text style={feedStyles.deleteText}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [isRecording, setIsRecording] = useState(false);

  return (
    <RecordingContext.Provider value={{ isRecording, setIsRecording }}>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: isRecording
              ? { display: 'none' }
              : {
                  backgroundColor: COLORS.background,
                  borderTopColor: COLORS.surface,
                  borderTopWidth: 0.5,
                  height: 60,
                },
            tabBarActiveTintColor: COLORS.accent,
            tabBarInactiveTintColor: 'rgba(245,241,232,0.4)',
            tabBarShowLabel: false,
          }}
        >
          <Tab.Screen
            name="Feed"
            component={FeedScreen}
            options={{ tabBarIcon: ({ color }) => <FeedIcon color={color} /> }}
          />
          <Tab.Screen
            name="Record"
            component={CameraScreen}
            options={{ tabBarIcon: () => <RecordTabIcon /> }}
          />
          <Tab.Screen
            name="Map"
            component={MapScreen}
            options={{ tabBarIcon: ({ color }) => <MapIcon color={color} /> }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </RecordingContext.Provider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionText: {
    color: COLORS.text,
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 40,
    marginBottom: 32,
    lineHeight: 24,
  },
  permissionButton: {
    borderWidth: 1,
    borderColor: COLORS.secondary,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  permissionButtonText: {
    color: COLORS.text,
    fontSize: 14,
    letterSpacing: 1,
  },
  buttonRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  recordOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: COLORS.accent,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.accent,
  },
});

const feedStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 4,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '500',
  },
  cardInfo: {
    flex: 1,
    gap: 2,
  },
  username: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '500',
  },
  cardDate: {
    color: COLORS.secondary,
    fontSize: 12,
    marginTop: 2,
  },
  duration: {
    color: COLORS.secondary,
    fontSize: 12,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hereTooButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(200,106,74,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  deleteText: {
    color: COLORS.text,
    fontSize: 11,
    letterSpacing: 0.5,
    opacity: 0.4,
  },
  emptyText: {
    color: COLORS.text,
    fontSize: 16,
    opacity: 0.5,
  },
});

const playerStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 24,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.secondary,
  },
  closeText: {
    color: COLORS.text,
    fontSize: 14,
    letterSpacing: 1,
  },
});

const stampStyles = StyleSheet.create({
  topLeft: {
    position: 'absolute',
    top: 60,
    left: 16,
  },
  bottomLeft: {
    position: 'absolute',
    bottom: 40,
    left: 16,
  },
  bottomRight: {
    position: 'absolute',
    bottom: 40,
    right: 16,
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  recDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.rec,
  },
  recText: {
    fontFamily: STAMP_FONT,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.88,
    color: COLORS.rec,
  },
  time: {
    fontFamily: STAMP_FONT,
    fontSize: 19,
    fontWeight: '500',
    letterSpacing: 0.95,
    color: COLORS.accent,
  },
  coords: {
    fontFamily: STAMP_FONT,
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: 0.64,
    color: COLORS.accent,
    opacity: 0.85,
  },
  bottomStamp: {
    fontFamily: STAMP_FONT,
    fontSize: 19,
    fontWeight: '400',
    letterSpacing: 1.14,
    color: COLORS.accent,
    opacity: 0.85,
  },
});
