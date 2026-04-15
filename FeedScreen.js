import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { COLORS, LocationPin } from './constants';
import VideoPlayer from './VideoPlayer';
import { supabase } from './supabase';

export default function FeedScreen() {
  const [clips, setClips] = useState([]);
  const [selectedClip, setSelectedClip] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadClips();
    }, [])
  );

  const loadClips = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      const { data: circleRows, error: circleError } = await supabase
        .from('circles')
        .select('circle_member_id')
        .eq('user_id', user.id);
      if (circleError) throw circleError;

      const memberIds = (circleRows ?? []).map(r => r.circle_member_id);

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

      setClips(data ?? []);
    } catch (err) {
      console.error('Feed load failed:', err.message);
      setClips([]);
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
        renderItem={({ item, index }) => (
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
              <Pressable style={feedStyles.hereTooButton}>
                <LocationPin color={COLORS.accent} size={18} />
              </Pressable>
            </View>
          </Pressable>
        )}
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
