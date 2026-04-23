import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Modal, PanResponder, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { supabase } from './supabase';
import VideoStamp from './components/VideoStamp';

const FONT = 'Courier New';
const TERRACOTTA = '#C86A4A';
const CREAM = '#F5F1E8';
const RED = '#E63946';

const SHEET_HEIGHT = 160;
const PEEK_HEIGHT = 22;
const SHEET_CLOSED = SHEET_HEIGHT - PEEK_HEIGHT;

export default function VideoPlayer({ clip, clips, onClose, onDelete }) {
  const startIndex = clips ? Math.max(0, clips.findIndex(c => c.id === clip.id)) : 0;
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [localClips, setLocalClips] = useState(clips ?? null);

  const activeClip = localClips ? localClips[currentIndex] : clip;

  const sheetAnim = useRef(new Animated.Value(SHEET_CLOSED)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isPlayingRef = useRef(true);
  const sheetIsOpenRef = useRef(false);
  const currentIndexRef = useRef(startIndex);
  const clipsRef = useRef(clips ?? null);

  const player = useVideoPlayer(activeClip.playbackUri ?? activeClip.uri, (p) => {
    p.loop = true;
    p.play();
  });

  useEffect(() => {
    supabase.auth.getUser()
      .then(({ data: { user } }) => setCurrentUser(user))
      .catch(() => {});
  }, []);

  // Replace source when navigating — also resets play state
  useEffect(() => {
    if (!localClips || localClips.length <= 1) return;
    const run = async () => {
      await player.replaceAsync(activeClip.playbackUri ?? activeClip.uri);
      player.play();
      setIsPlaying(true);
      isPlayingRef.current = true;
    };
    run();
  }, [currentIndex]);

  // Fade out → swap index → fade in
  const navigateRef = useRef(null);
  navigateRef.current = (next) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      currentIndexRef.current = next;
      setCurrentIndex(next);
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    });
  };

  // isPlaying driven by local state only, not player events
  const togglePlay = () => {
    if (isPlayingRef.current) {
      player.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
    } else {
      player.play();
      setIsPlaying(true);
      isPlayingRef.current = true;
    }
  };

  const openSheetRef = useRef(null);
  const closeSheetRef = useRef(null);

  openSheetRef.current = () => {
    sheetIsOpenRef.current = true;
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
  };

  closeSheetRef.current = () => {
    sheetIsOpenRef.current = false;
    Animated.spring(sheetAnim, { toValue: SHEET_CLOSED, useNativeDriver: true, bounciness: 0 }).start();
  };

  // Main pan: swipe-down to close + left/right to navigate
  const mainPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gs) => {
      const isDown = gs.dy > 8 && gs.dy > Math.abs(gs.dx);
      const isHoriz = clipsRef.current && clipsRef.current.length > 1
        && Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy);
      return isDown || isHoriz;
    },
    onPanResponderRelease: (_, gs) => {
      if (gs.dy > 80) { onClose(); return; }
      const c = clipsRef.current;
      if (c && c.length > 1 && Math.abs(gs.dx) > 50 && Math.abs(gs.dx) > Math.abs(gs.dy)) {
        const next = gs.dx < 0
          ? currentIndexRef.current + 1
          : currentIndexRef.current - 1;
        if (next >= 0 && next < c.length) navigateRef.current(next);
      }
    },
  })).current;

  const handleShare = async () => {
    try {
      await Share.share({ url: activeClip.playbackUri });
    } catch (err) {
      console.error('Share failed:', err.message);
    }
  };

  const handleDelete = () => {
    Alert.alert('Are you sure?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.from('clips').delete().eq('id', activeClip.id);
            await supabase.storage.from('clips').remove([activeClip.uri]);
            const thumbPath = `${activeClip.user_id}/thumb_${activeClip.timestamp}.jpg`;
            await supabase.storage.from('thumbnails').remove([thumbPath]);
          } catch (err) {
            console.error('Delete failed:', err.message);
          }
          closeSheetRef.current();
          const remaining = (localClips ?? []).filter(c => c.id !== activeClip.id);
          if (remaining.length === 0) {
            onClose();
          } else {
            const nextIndex = Math.min(currentIndexRef.current, remaining.length - 1);
            setLocalClips(remaining);
            clipsRef.current = remaining;
            navigateRef.current(nextIndex);
            setIsPlaying(true);
            isPlayingRef.current = true;
            player.play();
          }
          if (onDelete) onDelete();
        },
      },
    ]);
  };

  const isOwner = currentUser != null && activeClip.user_id === currentUser.id;

  return (
    <Modal visible animationType="none" onRequestClose={onClose}>
      <View style={s.container} {...mainPan.panHandlers}>

        {/* Video with opacity fade on clip swap */}
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: fadeAnim }]}>
          <VideoView
            player={player}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            nativeControls={false}
          />
        </Animated.View>

        {/* Tap to toggle play (closes sheet if open), long press to open action sheet */}
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={() => {
            if (sheetIsOpenRef.current) { closeSheetRef.current(); return; }
            togglePlay();
          }}
          onLongPress={() => openSheetRef.current()}
          delayLongPress={400}
        />

        <VideoStamp
          recordedAt={activeClip.recorded_at ?? activeClip.timestamp}
          isPlaying={isPlaying}
        />

        {/* Cluster position indicator */}
        {localClips && localClips.length > 1 && (
          <View style={s.indicator} pointerEvents="none">
            <Text style={s.indicatorText}>{currentIndex + 1} / {clips.length}</Text>
          </View>
        )}

        {/* Pause icon — driven by local state only */}
        {!isPlaying && (
          <View style={s.pauseOverlay} pointerEvents="none">
            <View style={s.pauseCircle}>
              <View style={s.pauseBar} />
              <View style={s.pauseBar} />
            </View>
          </View>
        )}

        {/* Action sheet */}
        {isOwner && (
          <Animated.View style={[s.sheet, { transform: [{ translateY: sheetAnim }] }]}>
              <View style={s.handleRow}>
                <View style={s.sheetHandle} />
              </View>

              <Pressable style={s.sheetRow} onPress={handleShare}>
                <View style={s.shareIcon}>
                  <Ionicons name="share-outline" size={18} color={TERRACOTTA} />
                </View>
                <View>
                  <Text style={s.rowLabel}>share moment</Text>
                  <Text style={s.rowSub}>send to instagram, messages...</Text>
                </View>
              </Pressable>

              <View style={s.sheetDivider} />

              <Pressable style={s.sheetRow} onPress={handleDelete}>
                <View style={s.deleteIcon}>
                  <Ionicons name="trash-outline" size={18} color={RED} />
                </View>
                <View>
                  <Text style={[s.rowLabel, { color: RED }]}>delete moment</Text>
                  <Text style={s.rowSub}>cannot be undone</Text>
                </View>
              </Pressable>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  indicator: {
    position: 'absolute',
    top: 57,
    right: 18,
  },
  indicatorText: {
    fontFamily: FONT,
    fontSize: 12,
    color: 'rgba(200,106,74,0.6)',
    letterSpacing: 1,
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(31,31,31,0.55)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBar: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: '#fff',
    marginHorizontal: 3.5,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: 'rgba(28,26,24,0.97)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 0.5,
    borderColor: 'rgba(245,241,232,0.08)',
  },
  handleRow: {
    height: PEEK_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHandle: {
    width: 36,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(245,241,232,0.25)',
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  shareIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(200,106,74,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  deleteIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(230,57,70,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: CREAM,
  },
  rowSub: {
    fontSize: 11,
    color: 'rgba(245,241,232,0.3)',
    marginTop: 1,
  },
  sheetDivider: {
    height: 0.5,
    backgroundColor: 'rgba(245,241,232,0.07)',
    marginHorizontal: 18,
  },
});
