import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { COLORS } from './constants';
import { supabase } from './supabase';

const FONT = 'Courier New';

function getInitials(str) {
  if (!str) return '??';
  return str.slice(0, 2).toUpperCase();
}

// ─── Per-clip item ────────────────────────────────────────────────────────────

function ClipItem({ item, isVisible, htStatus, onHereToo, profile, height }) {
  const [isPlaying, setIsPlaying] = useState(false);

  const player = useVideoPlayer(item.signedUrl ?? null, (p) => {
    p.loop = true;
  });

  useEffect(() => {
    if (!item.signedUrl) return;
    if (isVisible) {
      player.currentTime = 0;
      player.play();
      setIsPlaying(true);
    } else {
      player.pause();
      setIsPlaying(false);
    }
  }, [isVisible, item.signedUrl]);

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

  const username = profile?.username ?? null;
  const initials = username ? getInitials(username) : getInitials(item.user_id);
  const displayName = username ?? item.user_id?.slice(0, 8) ?? '—';

  return (
    <Pressable style={[styles.clip, { height }]} onPress={togglePlay}>
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
      <View style={styles.overlayBottomLeft} pointerEvents="none">
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarInitials}>{initials}</Text>
        </View>
        <Text style={styles.overlayUsername}>{displayName}</Text>
      </View>

      {/* Bottom-right: Here Too button */}
      <View style={styles.overlayBottomRight}>
        <Pressable
          style={[styles.hereTooButton, (isPending || isApproved) && styles.hereTooButtonSent]}
          onPress={() => onHereToo(item)}
          hitSlop={8}
        >
          {isApproved ? (
            <MaterialCommunityIcons name="map-marker" size={20} color="#FFFFFF" />
          ) : isPending ? (
            <MaterialCommunityIcons name="check" size={20} color="#FFFFFF" />
          ) : (
            <MaterialCommunityIcons name="account-group" size={20} color={COLORS.accent} />
          )}
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

export default function FeedScreen() {
  const { height: windowHeight } = useWindowDimensions();
  const [containerHeight, setContainerHeight] = useState(windowHeight);

  const [clips, setClips] = useState([]);
  const [hereTooMap, setHereTooMap] = useState(new Map());
  const [currentUserId, setCurrentUserId] = useState(null);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [profiles, setProfiles] = useState({});

  useFocusEffect(
    useCallback(() => {
      loadClips();
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

      // Try to load usernames from profiles (graceful fallback if table absent)
      try {
        const { data: profileRows } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', memberIds);
        if (profileRows) {
          const map = {};
          for (const p of profileRows) map[p.id] = p;
          setProfiles(map);
        }
      } catch (_) {}

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
      <FlatList
        data={clips}
        keyExtractor={(item) => String(item.id ?? item.timestamp)}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        getItemLayout={(_, index) => ({
          length: containerHeight,
          offset: containerHeight * index,
          index,
        })}
        renderItem={({ item, index }) => (
          <ClipItem
            item={item}
            isVisible={index === visibleIndex}
            htStatus={hereTooMap.get(item.id)}
            onHereToo={handleHereToo}
            profile={profiles[item.user_id]}
            height={containerHeight}
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
  emptyText: {
    color: COLORS.text,
    fontFamily: FONT,
    fontSize: 14,
    opacity: 0.5,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  clip: {
    backgroundColor: '#000',
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
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(31,31,31,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hereTooButtonSent: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
});
