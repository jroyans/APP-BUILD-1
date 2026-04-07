import { useRef, useState, useCallback, useEffect } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
};

const Tab = createBottomTabNavigator();

// ─── Tab icons ───────────────────────────────────────────────────────────────

function CameraIcon({ color }) {
  return <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color }} />;
}

function FeedIcon({ color }) {
  return (
    <View style={{ justifyContent: 'center', gap: 5 }}>
      <View style={{ width: 22, height: 2, backgroundColor: color }} />
      <View style={{ width: 22, height: 2, backgroundColor: color }} />
      <View style={{ width: 22, height: 2, backgroundColor: color }} />
    </View>
  );
}

// ─── Camera screen (Slice 1 + 2, untouched) ──────────────────────────────────

function CameraScreen() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    console.log('requesting location permission');
    requestLocationPermission();
  }, []);
  const cameraRef = useRef(null);
  const isRecordingRef = useRef(false);
  const recordingStartTime = useRef(null);

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
        style={StyleSheet.absoluteFill}
        mode="video"
        facing="back"
      />
      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.recordButton, isRecording && styles.recordButtonActive]}
          onPressIn={startRecording}
          onPressOut={stopRecording}
        />
      </View>
    </View>
  );
}

// ─── Video player ─────────────────────────────────────────────────────────────

function VideoPlayer({ uri, onClose }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.play();
  });

  return (
    <Modal visible animationType="none" onRequestClose={onClose}>
      <View style={playerStyles.container}>
        <VideoView
          player={player}
          style={playerStyles.video}
          contentFit="contain"
          nativeControls
        />
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
  const [selectedUri, setSelectedUri] = useState(null);

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

  if (clips.length === 0) {
    return (
      <View style={[feedStyles.container, styles.centered]}>
        <Text style={feedStyles.emptyText}>No clips yet.</Text>
      </View>
    );
  }

  return (
    <View style={feedStyles.container}>
      {selectedUri && (
        <VideoPlayer uri={selectedUri} onClose={() => setSelectedUri(null)} />
      )}
      <FlatList
        data={clips}
        keyExtractor={(item) => String(item.timestamp)}
        contentContainerStyle={feedStyles.list}
        renderItem={({ item }) => (
          <Pressable style={feedStyles.card} onPress={() => setSelectedUri(item.uri)}>
            <View>
              <Text style={feedStyles.cardText}>{formatDate(item.timestamp)}</Text>
              {item.duration != null && (
                <Text style={feedStyles.durationText}>{item.duration} sec</Text>
              )}
            </View>
            <Pressable onPress={() => deleteClip(item)} hitSlop={8}>
              <Text style={feedStyles.deleteText}>Delete</Text>
            </Pressable>
          </Pressable>
        )}
      />
    </View>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: COLORS.background,
            borderTopColor: COLORS.secondary,
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: COLORS.accent,
          tabBarInactiveTintColor: COLORS.secondary,
          tabBarShowLabel: false,
        }}
      >
        <Tab.Screen
          name="Camera"
          component={CameraScreen}
          options={{ tabBarIcon: ({ color }) => <CameraIcon color={color} /> }}
        />
        <Tab.Screen
          name="Feed"
          component={FeedScreen}
          options={{ tabBarIcon: ({ color }) => <FeedIcon color={color} /> }}
        />
      </Tab.Navigator>
    </NavigationContainer>
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
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accent,
  },
  recordButtonActive: {
    borderWidth: 4,
    borderColor: COLORS.text,
    transform: [{ scale: 1.15 }],
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
    backgroundColor: COLORS.secondary,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardText: {
    color: COLORS.text,
    fontSize: 15,
  },
  durationText: {
    color: COLORS.text,
    fontSize: 12,
    marginTop: 4,
    opacity: 0.5,
  },
  deleteText: {
    color: COLORS.text,
    fontSize: 12,
    letterSpacing: 0.5,
    opacity: 0.45,
    borderWidth: 1,
    borderColor: COLORS.text,
    paddingVertical: 4,
    paddingHorizontal: 10,
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
