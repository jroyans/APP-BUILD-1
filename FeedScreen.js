import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { File } from 'expo-file-system/next';
import { useFocusEffect } from '@react-navigation/native';

import { COLORS, indexFile, LocationPin } from './constants';
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
    if (!indexFile.exists) {
      setClips([]);
    } else {
      try {
        const raw = await indexFile.text();
        const parsed = JSON.parse(raw);
        setClips([...parsed].reverse());
      } catch (_) {
        setClips([]);
      }
    }
    syncCloudClips();
  };

  const syncCloudClips = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      const { data, error } = await supabase
        .from('clips')
        .select('*')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      console.log('Cloud clips:', data);
    } catch (err) {
      console.error('Cloud sync failed:', err.message);
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
            deleteCloudClip(item);
          } catch (_) {
            Alert.alert('Error', 'Could not delete the clip. Please try again.');
          }
        },
      },
    ]);
  };

  const deleteCloudClip = async (item) => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      const storagePath = `${user.id}/clip_${item.timestamp}.mp4`;

      const { error: storageError } = await supabase.storage
        .from('clips')
        .remove([storagePath]);
      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from('clips')
        .delete()
        .eq('user_id', user.id)
        .eq('timestamp', item.timestamp);
      if (dbError) throw dbError;

      console.log('Cloud clip deleted:', storagePath);
    } catch (err) {
      console.error('Cloud delete failed (local delete succeeded):', err.message);
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
        <Text style={feedStyles.emptyText}>No clips yet.</Text>
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
        keyExtractor={(item) => String(item.timestamp)}
        contentContainerStyle={feedStyles.list}
        renderItem={({ item, index }) => (
          <Pressable
            style={feedStyles.card}
            onPress={() => setSelectedClip({ ...item, clipNumber: clips.length - index })}
          >
            <View style={feedStyles.cardMain}>
              <View style={feedStyles.avatar}>
                <Text style={feedStyles.avatarText}>Y</Text>
              </View>
              <View style={feedStyles.cardInfo}>
                <Text style={feedStyles.username}>You</Text>
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
              <Pressable onPress={() => deleteClip(item)} hitSlop={8} style={feedStyles.deleteButton}>
                <Text style={feedStyles.deleteText}>Delete</Text>
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
