import { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { formatStampTime, stampStyles } from '../constants';

export default function VideoStamp({ recordedAt, isPlaying }) {
  const recFlash = useRef(new Animated.Value(1)).current;
  const recAnim = useRef(null);

  useEffect(() => {
    if (isPlaying) {
      recAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(recFlash, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(recFlash, { toValue: 0, duration: 500, useNativeDriver: true }),
        ])
      );
      recAnim.current.start();
    } else {
      if (recAnim.current) recAnim.current.stop();
      recFlash.setValue(1);
    }
    return () => {
      if (recAnim.current) recAnim.current.stop();
    };
  }, [isPlaying]);

  if (!recordedAt) return null;

  const ts = typeof recordedAt === 'string' ? new Date(recordedAt).getTime() : recordedAt;
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();

  return (
    <View style={stampStyles.topLeft} pointerEvents="none">
      <Animated.View style={[stampStyles.recRow, { opacity: recFlash }]}>
        <View style={stampStyles.recDot} />
        <Text style={stampStyles.recText}>REC</Text>
      </Animated.View>
      <Text style={stampStyles.time}>{formatStampTime(ts)}</Text>
      <Text style={stampStyles.coords}>{`${dd}.${mo}.${yyyy}`}</Text>
    </View>
  );
}
