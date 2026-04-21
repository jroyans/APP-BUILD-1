import { createContext } from 'react';
import { StyleSheet } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system/next';

export const clipsDir = new Directory(Paths.document, 'clips');
export const indexFile = new File(Paths.document, 'index.json');

export const COLORS = {
  background: '#1F1F1F',
  accent: '#C86A4A',
  secondary: '#7A5C4D',
  text: '#F5F1E8',
  rec: '#E63946',
  surface: '#2a2a2a',
};

export const STAMP_FONT = 'Courier New';

export const RecordingContext = createContext({
  isRecording: false,
  setIsRecording: () => {},
  pendingClips: [],
  addPendingClip: () => {},
  upgradePendingClip: () => {},
  removePendingClip: () => {},
  isStripOpen: false,
  setIsStripOpen: () => {},
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatStampTime(timestamp) {
  const d = new Date(timestamp);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  return `${hour}:${m}${ampm}`;
}

export function formatStampDate(timestamp) {
  return new Date(timestamp)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .toUpperCase()
    .replace(',', '');
}

export function formatCoords(location) {
  if (!location) return '';
  const { latitude: lat, longitude: lon } = location;
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
}

export function formatClipNumber(n) {
  return `■ ${String(n).padStart(4, '0')}`;
}

// ─── Shared components ────────────────────────────────────────────────────────

import { View } from 'react-native';

export function LocationPin({ color, size = 16 }) {
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

// ─── Shared styles ────────────────────────────────────────────────────────────

export const stampStyles = StyleSheet.create({
  topLeft: {
    position: 'absolute',
    top: 57,
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
    width: 8.5,
    height: 8.5,
    borderRadius: 4.25,
    backgroundColor: COLORS.rec,
  },
  recText: {
    fontFamily: STAMP_FONT,
    fontSize: 13,
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
