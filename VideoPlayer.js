import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { COLORS, STAMP_FONT, formatStampTime, formatStampDate, formatCoords, formatClipNumber, stampStyles } from './constants';

export default function VideoPlayer({ clip, onClose }) {
  const player = useVideoPlayer({ uri: clip.uri }, (p) => {
    p.play();
  });

  const recFlash = useRef(new Animated.Value(1)).current;
  const recAnim = useRef(null);

  const startFlash = () => {
    recAnim.current = Animated.loop(
      Animated.sequence([
        Animated.timing(recFlash, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(recFlash, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    recAnim.current.start();
  };

  const stopFlash = () => {
    if (recAnim.current) recAnim.current.stop();
    recFlash.setValue(1);
  };

  useEffect(() => {
    startFlash();
    const sub = player.addListener('playingChange', (event) => {
      if (event.isPlaying) {
        startFlash();
      } else {
        stopFlash();
      }
    });
    return () => {
      stopFlash();
      sub.remove();
    };
  }, []);

  return (
    <Modal visible animationType="none" onRequestClose={onClose}>
      <View style={playerStyles.container}>
        <VideoView
          player={player}
          style={playerStyles.video}
          contentFit="cover"
          nativeControls
        />

        <View style={stampStyles.topLeft} pointerEvents="none">
          <Animated.View style={[stampStyles.recRow, { opacity: recFlash }]}>
            <View style={stampStyles.recDot} />
            <Text style={stampStyles.recText}>REC</Text>
          </Animated.View>
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
