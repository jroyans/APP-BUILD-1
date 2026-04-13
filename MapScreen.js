import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MapView, { Marker } from 'react-native-maps';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { COLORS } from './constants';
import { supabase } from './supabase';
import VideoPlayer from './VideoPlayer';

const CLUSTER_THRESHOLD = 0.001;
const STAMP_FONT = 'Courier New';

const ADELAIDE = {
  latitude: -34.9285,
  longitude: 138.6007,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// --- Helpers ---

function getInitials(fullName, username) {
  if (fullName && fullName.trim()) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (username) return username.slice(0, 2).toUpperCase();
  return '??';
}

function formatDuration(totalSeconds) {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// --- Clustering ---

function buildClusters(clips) {
  const used = new Set();
  const clusters = [];
  for (let i = 0; i < clips.length; i++) {
    if (used.has(i)) continue;
    const group = [clips[i]];
    used.add(i);
    for (let j = i + 1; j < clips.length; j++) {
      if (used.has(j)) continue;
      if (
        Math.abs(clips[i].latitude - clips[j].latitude) <= CLUSTER_THRESHOLD &&
        Math.abs(clips[i].longitude - clips[j].longitude) <= CLUSTER_THRESHOLD
      ) {
        group.push(clips[j]);
        used.add(j);
      }
    }
    group.sort((a, b) => a.timestamp - b.timestamp);
    const lat = group.reduce((s, c) => s + c.latitude, 0) / group.length;
    const lng = group.reduce((s, c) => s + c.longitude, 0) / group.length;
    clusters.push({
      id: `cluster_${clips[i].id}`,
      clips: group,
      centroid: { latitude: lat, longitude: lng },
    });
  }
  return clusters;
}

// --- Pin components ---

function Pin({ thumbnailUri }) {
  return (
    <View style={pinStyles.container}>
      <View style={pinStyles.box}>
        {thumbnailUri ? (
          <Image source={{ uri: thumbnailUri }} style={pinStyles.image} resizeMode="cover" />
        ) : (
          <View style={pinStyles.placeholder} />
        )}
      </View>
      <View style={pinStyles.stem} />
      <View style={pinStyles.dot} />
    </View>
  );
}

function ClusterPin({ thumbnailUri, count }) {
  return (
    <View style={pinStyles.container}>
      <View style={clusterPinStyles.box}>
        {thumbnailUri ? (
          <Image source={{ uri: thumbnailUri }} style={pinStyles.image} resizeMode="cover" />
        ) : (
          <View style={pinStyles.placeholder} />
        )}
        <View style={clusterPinStyles.badge}>
          <Text style={clusterPinStyles.badgeText}>{count}</Text>
        </View>
      </View>
      <View style={pinStyles.stem} />
      <View style={pinStyles.dot} />
    </View>
  );
}

// --- Cluster player ---

function ClipVideo({ uri: playbackUri }) {
  console.log('ClipVideo received uri:', playbackUri);
  const player = useVideoPlayer(playbackUri, p => {
    p.loop = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{ flex: 1 }}
      contentFit="cover"
      nativeControls
    />
  );
}

function ClusterPlayer({ cluster, initialIndex, onClose, onIndexChange }) {
  const [index, setIndex] = useState(initialIndex);
  const { width: screenWidth } = useWindowDimensions();
  const edgeWidth = screenWidth * 0.2;
  const indexRef = useRef(initialIndex);

  const goRef = useRef(null);
  goRef.current = (delta) => {
    const next = Math.max(0, Math.min(cluster.clips.length - 1, indexRef.current + delta));
    if (next === indexRef.current) return;
    indexRef.current = next;
    setIndex(next);
    onIndexChange(next);
  };

  const makePan = () =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, gs) => {
        if (Math.abs(gs.dx) > 30 && Math.abs(gs.dx) > Math.abs(gs.dy)) {
          goRef.current(gs.dx < 0 ? 1 : -1);
        }
      },
    });

  const leftPan = useRef(makePan()).current;
  const rightPan = useRef(makePan()).current;

  const clip = cluster.clips[index];

  return (
    <Modal visible animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <ClipVideo key={clip.id} uri={clip.playbackUri} />

        {/* Left edge zone — 20% width, captures swipe gestures only */}
        <View
          style={[clusterStyles.edgeZone, { left: 0, width: edgeWidth }]}
          {...leftPan.panHandlers}
        />
        {/* Right edge zone — 20% width, captures swipe gestures only */}
        <View
          style={[clusterStyles.edgeZone, { right: 0, width: edgeWidth }]}
          {...rightPan.panHandlers}
        />

        <View style={clusterStyles.indicator}>
          <Text style={clusterStyles.indicatorText}>
            {index + 1} of {cluster.clips.length}
          </Text>
        </View>

        <Pressable style={clusterStyles.closeButton} onPress={onClose}>
          <Text style={clusterStyles.closeText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// --- Profile card ---

function PersonIcon() {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />
      <View style={{ width: 12, height: 7, borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: '#fff', marginTop: 1 }} />
    </View>
  );
}

function PencilIcon() {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 14, height: 14 }}>
      <View style={{ width: 2, height: 10, backgroundColor: '#fff', transform: [{ rotate: '45deg' }], position: 'absolute' }} />
      <View style={{ width: 4, height: 4, backgroundColor: '#fff', position: 'absolute', bottom: 0, transform: [{ rotate: '45deg' }] }} />
    </View>
  );
}

function ProfileCard({ profile, momentCount, totalDuration }) {
  const initials = getInitials(profile?.full_name, profile?.username);
  const displayName = profile?.full_name || profile?.username || '—';
  const location = profile?.home_location || 'Adelaide, Australia';

  return (
    <View style={styles.profileCard}>
      {/* Avatar row */}
      <View style={styles.avatarRow}>
        {/* Avatar with circle badge */}
        <View style={{ position: 'relative', marginRight: 12 }}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
          {/* TODO: connect to Circle count in Slice 6 */}
          <View style={styles.circleBadge}>
            <Text style={styles.circleBadgeText}>0</Text>
          </View>
        </View>

        {/* Name and location */}
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.location} numberOfLines={1}>{location}</Text>
        </View>

        {/* Icon buttons */}
        <View style={styles.iconRow}>
          <Pressable
            style={styles.iconButtonSecondary}
            onPress={() => console.log('manage circle')}
          >
            <PersonIcon />
          </Pressable>
          <Pressable
            style={styles.iconButtonAccent}
            onPress={() => console.log('edit profile')}
          >
            <PencilIcon />
          </Pressable>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Stats row */}
      <View style={styles.statsRow}>
        <Text style={styles.stat}>{momentCount} moments</Text>
        <Text style={styles.statDot}> · </Text>
        <Text style={styles.stat}>{formatDuration(totalDuration)}</Text>
        <Text style={styles.statDot}> · </Text>
        {/* TODO: connect to Here Too count in Slice 7 */}
        <Text style={styles.stat}>0 here too</Text>
      </View>
    </View>
  );
}

// --- Main screen ---

export default function MapScreen() {
  const [clips, setClips] = useState([]);
  const [profile, setProfile] = useState(null);
  const [allClips, setAllClips] = useState([]);
  const [selectedSingleClip, setSelectedSingleClip] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const lastViewedIndex = useRef({});

  const clusters = useMemo(() => buildClusters(clips), [clips]);

  const momentCount = allClips.length;
  const totalDuration = allClips.reduce((sum, c) => sum + (c.duration ?? 0), 0);

  useFocusEffect(
    useCallback(() => {
      const fetchAll = async () => {
        try {
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError || !user) throw userError ?? new Error('No user');

          const [profileResult, clipsResult] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', user.id).single(),
            supabase.from('clips').select('*').eq('user_id', user.id),
          ]);

          if (profileResult.data) setProfile(profileResult.data);

          const data = clipsResult.data ?? [];
          setAllClips(data);

          const located = data.filter(c => c.latitude != null && c.longitude != null);
          console.log('Clips fetched:', located.length, 'with GPS coordinates');

          const withThumb = located.map(c => ({ ...c, thumbnailUri: c.thumbnail_url ?? null }));
          setClips(withThumb);

          for (const clip of withThumb) {
            if (clip.thumbnail_url) continue;
            resolveThumbnail(clip, user.id);
          }
        } catch (err) {
          console.error('Failed to fetch map data:', err.message);
        }
      };

      fetchAll();
    }, [])
  );

  const resolveThumbnail = async (clip, userId) => {
    try {
      const { data: signedData, error: signedError } = await supabase.storage
        .from('clips')
        .createSignedUrl(clip.uri, 3600);
      if (signedError) throw signedError;

      console.log('Signed URL length:', signedData.signedUrl.length);
      console.log('Signed URL preview:', signedData.signedUrl.slice(0, 50));
      console.log('Full signed URL:', signedData.signedUrl);

      const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(
        signedData.signedUrl,
        { time: 1000 }
      );

      const thumbBlob = await fetch(thumbUri).then(r => r.blob());
      const thumbPath = `${userId}/thumb_${clip.timestamp}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('thumbnails')
        .upload(thumbPath, thumbBlob, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('thumbnails')
        .getPublicUrl(thumbPath);

      const { error: updateError } = await supabase
        .from('clips')
        .update({ thumbnail_url: publicUrl })
        .eq('id', clip.id);
      if (updateError) throw updateError;

      setClips(prev =>
        prev.map(c => c.id === clip.id ? { ...c, thumbnailUri: publicUrl } : c)
      );
    } catch (err) {
      console.error('Thumbnail resolution failed for clip', clip.id, ':', err.message);
      console.error('Full error object:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
    }
  };

  const handleClusterTap = async (cluster) => {
    const resolved = await Promise.all(
      cluster.clips.map(async (clip) => {
        try {
          const { data, error } = await supabase.storage
            .from('clips')
            .createSignedUrl(clip.uri, 3600);
          if (error) throw error;
          return { ...clip, playbackUri: data.signedUrl };
        } catch (err) {
          console.error('Skipping clip', clip.id, '- signed URL failed:', err.message);
          return null;
        }
      })
    );

    const resolvedClips = resolved.filter(Boolean);

    if (resolvedClips.length === 0) {
      Alert.alert('No clips available');
      return;
    }

    const initialIndex = Math.min(lastViewedIndex.current[cluster.id] ?? 0, resolvedClips.length - 1);
    if (resolvedClips.length === 1) {
      setSelectedSingleClip(resolvedClips[0]);
    } else {
      setSelectedCluster({ ...cluster, clips: resolvedClips, startIndex: initialIndex });
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        mapType="mutedStandard"
        initialRegion={ADELAIDE}
        rotateEnabled={false}
        pitchEnabled={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsTraffic={false}
        showsCompass={false}
        showsScale={false}
        showsUserLocation={false}
        showsIndoors={false}
      >
        {clusters.map(cluster => (
          <Marker
            key={cluster.id}
            coordinate={cluster.centroid}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={cluster.clips.some(c => c.thumbnailUri === null)}
            onPress={() => handleClusterTap(cluster)}
          >
            {cluster.clips.length === 1 ? (
              <Pin thumbnailUri={cluster.clips[0].thumbnailUri} />
            ) : (
              <ClusterPin
                thumbnailUri={cluster.clips[cluster.clips.length - 1].thumbnailUri}
                count={cluster.clips.length}
              />
            )}
          </Marker>
        ))}
      </MapView>

      <ProfileCard
        profile={profile}
        momentCount={momentCount}
        totalDuration={totalDuration}
      />

      {selectedSingleClip ? (
        <VideoPlayer
          clip={selectedSingleClip}
          onClose={() => setSelectedSingleClip(null)}
        />
      ) : null}

      {selectedCluster ? (
        <ClusterPlayer
          cluster={selectedCluster}
          initialIndex={selectedCluster.startIndex}
          onClose={() => setSelectedCluster(null)}
          onIndexChange={(i) => { lastViewedIndex.current[selectedCluster.id] = i; }}
        />
      ) : null}
    </View>
  );
}

// --- Styles ---

const pinStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  box: {
    width: 38,
    height: 38,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    backgroundColor: COLORS.accent,
  },
  stem: {
    width: 2,
    height: 8,
    backgroundColor: COLORS.accent,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
});

const clusterPinStyles = StyleSheet.create({
  box: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 18,
  },
});

const clusterStyles = StyleSheet.create({
  edgeZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  indicator: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  indicatorText: {
    color: COLORS.text,
    fontSize: 12,
    opacity: 0.7,
    letterSpacing: 1,
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

const styles = StyleSheet.create({
  profileCard: {
    position: 'absolute',
    top: 52,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(31,31,31,0.92)',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#333330',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '500',
  },
  circleBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1F1F1F',
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBadgeText: {
    color: COLORS.accent,
    fontSize: 8,
    fontFamily: STAMP_FONT,
    lineHeight: 10,
  },
  name: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '500',
  },
  location: {
    color: COLORS.secondary,
    fontSize: 11,
    marginTop: 1,
  },
  iconRow: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButtonSecondary: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonAccent: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 0.5,
    backgroundColor: '#333330',
    marginVertical: 10,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    color: COLORS.accent,
    fontSize: 11,
    fontFamily: STAMP_FONT,
    letterSpacing: 0.04 * 11,
  },
  statDot: {
    color: COLORS.accent,
    fontSize: 11,
    fontFamily: STAMP_FONT,
  },
});
