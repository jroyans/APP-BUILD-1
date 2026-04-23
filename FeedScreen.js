import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { COLORS } from './constants';
import { supabase } from './supabase';
import VideoStamp from './components/VideoStamp';

const FONT = 'Courier New';

function getInitials(fullName, username) {
  if (fullName?.trim()) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (username) return username.slice(0, 2).toUpperCase();
  return '??';
}

// ─── Per-clip item ────────────────────────────────────────────────────────────

function ClipItem({ item, isVisible, feedFocused, focusCount, htStatus, onHereToo, profile, height, onPlayerReady, onProfilePress }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const thumbnailOpacity = useRef(new Animated.Value(1)).current;

  const player = useVideoPlayer(item.signedUrl ?? null, (p) => {
    p.loop = true;
  });

  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying }) => {
      if (isPlaying) {
        Animated.timing(thumbnailOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start();
      }
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (!item.signedUrl) return;
    if (isVisible && feedFocused) {
      onPlayerReady?.(player);
      player.currentTime = 0;
      player.play();
      setIsPlaying(true);
    } else {
      player.pause();
      setIsPlaying(false);
    }
  }, [isVisible, feedFocused, item.signedUrl, focusCount]);

  const togglePlay = () => {
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  const isPending = htStatus === 'pending';
  const isApproved = htStatus === 'approved';

  const displayName = profile?.full_name || profile?.username || '—';
  const initials = getInitials(profile?.full_name, profile?.username);

  return (
    <Pressable style={[styles.clip, { height }]} onPress={togglePlay}>
      {item.thumbnail_url && (
        <Animated.Image
          source={{ uri: item.thumbnail_url }}
          style={[StyleSheet.absoluteFillObject, { opacity: thumbnailOpacity }]}
          resizeMode="cover"
        />
      )}
      {item.signedUrl ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          nativeControls={false}
        />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, styles.loadingBg]} />
      )}

      <VideoStamp
        recordedAt={item.recorded_at ?? item.timestamp}
        isPlaying={isPlaying}
      />

      {/* Pause indicator */}
      {!isPlaying && (
        <View style={styles.pauseOverlay} pointerEvents="none">
          <View style={styles.pauseCircle}>
            <View style={styles.pauseBar} />
            <View style={styles.pauseBar} />
          </View>
        </View>
      )}

      {/* Bottom-left: avatar + name */}
      <Pressable style={styles.overlayBottomLeft} onPress={() => onProfilePress?.(item.user_id)}>
        <View style={styles.avatarCircle}>
          {profile?.avatar_url && !avatarError
            ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} onError={() => setAvatarError(true)} />
            : <Text style={styles.avatarInitials}>{initials}</Text>
          }
        </View>
        <Text style={styles.overlayUsername}>{displayName}</Text>
      </Pressable>

      {/* Bottom-right: Here Too button */}
      <View style={styles.overlayBottomRight}>
        <Pressable
          style={[
            styles.hereTooButton,
            isPending && styles.hereTooButtonPending,
            isApproved && styles.hereTooButtonApproved,
          ]}
          onPress={() => onHereToo(item)}
          hitSlop={8}
        >
          <Text style={[
            styles.hereTooText,
            isPending && styles.hereTooTextPending,
            isApproved && styles.hereTooTextApproved,
          ]}>
            {isApproved ? 'here too ✓' : isPending ? 'pending' : 'here too?'}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

export default function FeedScreen({ navigation }) {
  const { height: windowHeight } = useWindowDimensions();
  const [containerHeight, setContainerHeight] = useState(windowHeight);

  const [clips, setClips] = useState([]);
  const [hereTooMap, setHereTooMap] = useState(new Map());
  const [currentUserId, setCurrentUserId] = useState(null);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [profiles, setProfiles] = useState({});
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [focusCount, setFocusCount] = useState(0);
  const activePlayerRef = useRef(null);
  const titleOpacity = useRef(new Animated.Value(1)).current;

  // Load once on mount so feed data is ready before the user navigates here
  useEffect(() => {
    loadClips();
  }, []);

  // Gate playback on tab focus — pause everything when the user leaves
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      setFocusCount(c => c + 1);

      titleOpacity.setValue(0);
      Animated.sequence([
        Animated.timing(titleOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(titleOpacity, { toValue: 0, delay: 2400, duration: 600, useNativeDriver: true }),
      ]).start();

      return () => {
        setIsFocused(false);
        activePlayerRef.current?.pause();
      };
    }, [])
  );

  const loadClips = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      setCurrentUserId(user.id);

      const { data: circleRows, error: circleError } = await supabase
        .from('circles')
        .select('user_id, circle_member_id')
        .or(`user_id.eq.${user.id},circle_member_id.eq.${user.id}`);
      if (circleError) throw circleError;

      const memberIds = [...new Set(
        (circleRows ?? []).map(r => r.user_id === user.id ? r.circle_member_id : r.user_id)
      )];

      if (memberIds.length === 0) {
        setClips([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('clips')
        .select('*')
        .in('user_id', memberIds)
        .order('timestamp', { ascending: false });
      if (error) throw error;

      const loadedClips = data ?? [];

      // Fetch signed URLs for all clips upfront
      const signedUrls = await Promise.all(
        loadedClips.map(clip =>
          supabase.storage.from('clips').createSignedUrl(clip.uri, 3600)
            .then(({ data: d }) => d?.signedUrl ?? null)
            .catch(() => null)
        )
      );
      const clipsWithUrls = loadedClips.map((clip, i) => ({ ...clip, signedUrl: signedUrls[i] }));
      setClips(clipsWithUrls);

      // Load profiles — try with avatar_url first, fall back without it if column absent
      try {
        const { data: profileRows, error } = await supabase
          .from('profiles')
          .select('id, full_name, username, avatar_url')
          .in('id', memberIds);
        if (error) throw error;
        if (profileRows) {
          const map = {};
          for (const p of profileRows) map[p.id] = p;
          setProfiles(map);
        }
      } catch (_) {
        try {
          const { data: profileRows } = await supabase
            .from('profiles')
            .select('id, full_name, username')
            .in('id', memberIds);
          if (profileRows) {
            const map = {};
            for (const p of profileRows) map[p.id] = p;
            setProfiles(map);
          }
        } catch (_) {}
      }

      // Load Here Too state
      if (loadedClips.length > 0) {
        const clipIds = loadedClips.map(c => c.id);
        const { data: htRows } = await supabase
          .from('here_too_requests')
          .select('clip_id, status')
          .eq('requester_id', user.id)
          .in('clip_id', clipIds);
        const map = new Map();
        for (const row of htRows ?? []) {
          if (row.status !== 'declined') map.set(row.clip_id, row.status);
        }
        setHereTooMap(map);
      }
    } catch (err) {
      console.error('Feed load failed:', err.message);
      setClips([]);
    } finally {
      setLoading(false);
    }
  };

  const handleHereToo = (clip) => {
    const status = hereTooMap.get(clip.id);

    if (status === 'approved') return;

    if (!status) {
      setHereTooMap(prev => new Map(prev).set(clip.id, 'pending'));
      supabase.from('here_too_requests').upsert({
        clip_id: clip.id,
        requester_id: currentUserId,
        owner_id: clip.user_id,
        status: 'pending',
      }, { onConflict: 'clip_id,requester_id' }).then(({ error }) => {
        if (error) {
          console.error('here too upsert failed:', error.message);
          setHereTooMap(prev => { const m = new Map(prev); m.delete(clip.id); return m; });
        }
      });
    } else {
      setHereTooMap(prev => { const m = new Map(prev); m.delete(clip.id); return m; });
      supabase.from('here_too_requests')
        .delete()
        .eq('clip_id', clip.id)
        .eq('requester_id', currentUserId)
        .eq('status', 'pending')
        .then(({ error }) => {
          if (error) {
            console.error('here too delete failed:', error.message);
            setHereTooMap(prev => new Map(prev).set(clip.id, 'pending'));
          }
        });
    }
  };

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setVisibleIndex(viewableItems[0].index);
    }
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#C86A4A" />
      </View>
    );
  }

  if (clips.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>add someone to your circle to see their moments</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
    >
      <Animated.Text pointerEvents="none" style={[styles.feedTitle, { opacity: titleOpacity }]}>
        moments
      </Animated.Text>
      <FlatList
        data={clips}
        keyExtractor={(item) => String(item.id ?? item.timestamp)}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        initialNumToRender={3}
        maxToRenderPerBatch={2}
        windowSize={5}
        removeClippedSubviews={false}
        getItemLayout={(_, index) => ({
          length: containerHeight,
          offset: containerHeight * index,
          index,
        })}
        renderItem={({ item, index }) => (
          <ClipItem
            item={item}
            isVisible={index === visibleIndex}
            feedFocused={isFocused}
            focusCount={focusCount}
            htStatus={hereTooMap.get(item.id)}
            onHereToo={handleHereToo}
            profile={profiles[item.user_id]}
            height={containerHeight}
            onPlayerReady={(p) => { activePlayerRef.current = p; }}
            onProfilePress={(userId) => navigation.navigate('FriendProfile', { userId })}
          />
        )}
      />
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
  feedTitle: {
    position: 'absolute',
    top: 54,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#F5F1E8',
    fontSize: 30,
    fontWeight: '700',
    zIndex: 10,
  },
  emptyText: {
    color: COLORS.text,
    fontFamily: FONT,
    fontSize: 14,
    opacity: 0.5,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  clip: {
    backgroundColor: '#1F1F1F',
    overflow: 'hidden',
  },
  loadingBg: {
    backgroundColor: COLORS.background,
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
  overlayBottomLeft: {
    position: 'absolute',
    bottom: 90,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarInitials: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '500',
  },
  overlayUsername: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  overlayBottomRight: {
    position: 'absolute',
    bottom: 90,
    right: 20,
  },
  hereTooButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#F5F1E8',
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hereTooButtonPending: {
    borderColor: '#C86A4A',
  },
  hereTooButtonApproved: {
    backgroundColor: '#C86A4A',
    borderColor: '#C86A4A',
  },
  hereTooText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F5F1E8',
  },
  hereTooTextPending: {
    color: '#C86A4A',
  },
  hereTooTextApproved: {
    color: '#F5F1E8',
  },
});
