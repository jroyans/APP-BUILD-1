import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';

import { COLORS, RecordingContext, clipsDir, indexFile, formatStampTime, formatCoords, stampStyles } from './constants';
import { File } from 'expo-file-system/next';
import { supabase } from './supabase';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as FileSystemLegacy from 'expo-file-system/legacy';

export default function CameraScreen() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
  const [isRecording, setIsRecording] = useState(false);
  const { setIsRecording: setGlobalRecording } = useContext(RecordingContext);

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [locationStamp, setLocationStamp] = useState(null);
  const [currentTime, setCurrentTime] = useState('');

  const recFlash = useRef(new Animated.Value(0)).current;
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

  useEffect(() => {
    return () => { if (recAnim.current) recAnim.current.stop(); };
  }, []);

  useEffect(() => {
    if (isRecording) {
      recAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(recFlash, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(recFlash, { toValue: 0, duration: 500, useNativeDriver: true }),
        ])
      );
      recAnim.current.start();
    } else {
      if (recAnim.current) recAnim.current.stop();
      recFlash.setValue(0);
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

    return { uri: destFile.uri, timestamp };
  };

  const uploadClip = async (localUri, timestamp, location, duration) => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw userError ?? new Error('No user');

      const base64 = await FileSystemLegacy.readAsStringAsync(localUri, { encoding: 'base64' });
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const storagePath = `${user.id}/clip_${timestamp}.mp4`;

      const { error: uploadError } = await supabase.storage
        .from('clips')
        .upload(storagePath, bytes.buffer, { contentType: 'video/mp4' });
      if (uploadError) throw uploadError;

      const { data: insertData, error: insertError } = await supabase.from('clips').insert({
        user_id: user.id,
        uri: storagePath,
        timestamp,
        duration,
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
      }).select();
      if (insertError) throw insertError;

      const insertedClip = insertData[0];
      console.log('Cloud upload complete:', storagePath);

      // Thumbnail — generated from local file while it's still on device
      try {
        const thumbnailResult = await VideoThumbnails.getThumbnailAsync(localUri, { time: 0 });
        console.log('Thumbnail URI:', thumbnailResult.uri);

        const base64 = await FileSystemLegacy.readAsStringAsync(thumbnailResult.uri, { encoding: 'base64' });
        console.log('Base64 length:', base64.length);
        console.log('Base64 preview:', base64.slice(0, 100));
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const thumbPath = `${user.id}/thumb_${timestamp}.jpg`;

        const { error: thumbUploadError } = await supabase.storage
          .from('thumbnails')
          .upload(thumbPath, bytes.buffer, { contentType: 'image/jpeg', upsert: true });
        if (thumbUploadError) throw thumbUploadError;

        const publicUrl = supabase.storage.from('thumbnails').getPublicUrl(thumbPath).data.publicUrl;

        const { error: thumbUpdateError } = await supabase.from('clips')
          .update({ thumbnail_url: publicUrl })
          .eq('id', insertedClip.id);
        if (thumbUpdateError) throw thumbUpdateError;

        console.log('Thumbnail uploaded and linked:', thumbPath);
      } catch (thumbErr) {
        console.error('Thumbnail failed (clip preserved):', thumbErr.message);
      }
    } catch (err) {
      console.error('Cloud upload failed (local clip preserved):', err.message);
    }
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
        const { uri: localUri, timestamp } = await saveClip(result.uri, location, duration);
        uploadClip(localUri, timestamp, location, duration);
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

      <View style={stampStyles.topLeft} pointerEvents="none">
        <Animated.View style={[stampStyles.recRow, { opacity: recFlash }]}>
          <View style={stampStyles.recDot} />
          <Text style={stampStyles.recText}>REC</Text>
        </Animated.View>
        <Text style={stampStyles.time}>{currentTime}</Text>
        {locationStamp ? (
          <Text style={stampStyles.coords}>{formatCoords(locationStamp)}</Text>
        ) : null}
      </View>

      <View style={styles.buttonRow}>
        <Pressable
          onPressIn={startRecording}
          onPressOut={stopRecording}
          style={isRecording ? styles.recordOuterActive : styles.recordOuter}
        >
          <View style={isRecording ? styles.recordInnerActive : styles.recordInner} />
        </Pressable>
      </View>
    </View>
  );
}

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
    bottom: 75,
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
  recordOuterActive: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: COLORS.text,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.accent,
  },
  recordInnerActive: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.accent,
  },
});
