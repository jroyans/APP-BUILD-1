import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { COLORS } from './constants';
import VideoPlayer from './VideoPlayer';
import { supabase } from './supabase';

export default function FeedScreen() {
  const [clips, setClips] = useState([]);
  const [selectedClip, setSelectedClip] = useState(null);
  // Map<clipId, 'pending' | 'approved'>
  const [hereTooMap, setHereTooMap] = useState(new Map());
  const [currentUserId, setCurrentUserId] = useState(null);

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
      setClips(loadedClips);

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

    if (status === 'approved') return; // locked — do nothing

    if (!status) {
      // Not sent yet — upsert handles both fresh insert and reviving a declined row
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
      // Pending — delete optimistically
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
      <View style={[feedStyles.container, feedStyles.centered]}>
        <Text style={feedStyles.emptyText}>add someone to your circle to see their moments</Text>
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
        keyExtractor={(item) => String(item.id ?? item.timestamp)}
        contentContainerStyle={feedStyles.list}
        renderItem={({ item }) => {
          const htStatus = hereTooMap.get(item.id);
          const isPending = htStatus === 'pending';
          const isApproved = htStatus === 'approved';
          return (
            <Pressable
              style={feedStyles.card}
              onPress={async () => {
                try {
                  const { data, error } = await supabase.storage.from('clips').createSignedUrl(item.uri, 3600);
                  if (error) throw error;
                  setSelectedClip({ ...item, playbackUri: data.signedUrl });
                } catch (err) {
                  console.error('Failed to get signed URL:', err.message);
                }
              }}
            >
              <View style={feedStyles.cardMain}>
                <View style={feedStyles.avatar}>
                  <Text style={feedStyles.avatarText}>·</Text>
                </View>
                <View style={feedStyles.cardInfo}>
                  <Text style={feedStyles.cardDate}>{formatDate(item.timestamp)}</Text>
                  {item.duration != null && (
                    <Text style={feedStyles.duration}>{formatDuration(item.duration)}</Text>
                  )}
                </View>
              </View>
              <View style={feedStyles.cardActions}>
                <Pressable
                  style={[feedStyles.hereTooButton, (isPending || isApproved) && feedStyles.hereTooButtonSent]}
                  onPress={(e) => { e.stopPropagation(); handleHereToo(item); }}
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
        }}
      />
    </View>
  );
}

const feedStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hereTooButtonSent: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  emptyText: {
    color: COLORS.text,
    fontSize: 16,
    opacity: 0.5,
  },
});
