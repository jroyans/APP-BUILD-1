import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import MapView, { Marker } from 'react-native-maps';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { COLORS } from './constants';
import { supabase } from './supabase';
import VideoPlayer from './VideoPlayer';
import CircleScreen from './CircleScreen';

const CLUSTER_THRESHOLD = 0.001;
const STAMP_FONT = 'Courier New';
const HERE_TOO_COLOR = '#F5F1E8';

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

function HereTooPin({ thumbnailUri }) {
  return (
    <View style={pinStyles.container}>
      <View style={hereTooStyles.box}>
        {thumbnailUri ? (
          <Image source={{ uri: thumbnailUri }} style={pinStyles.image} resizeMode="cover" />
        ) : (
          <View style={hereTooStyles.placeholder} />
        )}
      </View>
      <View style={hereTooStyles.stem} />
      <View style={hereTooStyles.dot} />
    </View>
  );
}

// --- Settings modal ---

function SettingsModal({ visible, onClose }) {
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Sign out failed:', err.message);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={settingsModalStyles.overlay}>
        <View style={settingsModalStyles.card}>
          <Text style={settingsModalStyles.title}>settings</Text>
          <Pressable style={settingsModalStyles.signOutButton} onPress={handleSignOut}>
            <Text style={settingsModalStyles.signOutText}>sign out</Text>
          </Pressable>
          <Pressable onPress={onClose}>
            <Text style={settingsModalStyles.cancelText}>cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// --- Profile card ---


function ProfileCard({ profile, momentCount, totalDuration, circleCount, hereTooCount, onCirclePress, onSettingsPress }) {
  const initials = getInitials(profile?.full_name, profile?.username);
  const displayName = profile?.full_name || profile?.username || '—';
  const location = profile?.home_location || 'Adelaide, Australia';

  return (
    <View style={styles.profileCard}>
      {/* Avatar row */}
      <View style={styles.avatarRow}>
        {/* Avatar with circle badge */}
        <View style={{ width: 42, height: 42, marginRight: 13 }}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
          <View style={styles.circleBadge}>
            <Text style={styles.circleBadgeText}>{circleCount}</Text>
          </View>
        </View>

        {/* Name and location */}
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.location} numberOfLines={1}>{location}</Text>
        </View>

        {/* Icon buttons */}
        <View style={styles.iconRow}>
          <Pressable style={styles.iconButtonSecondary} onPress={onCirclePress}>
            <Ionicons name="people" size={20} color="#fff" />
          </Pressable>
          <Pressable style={styles.iconButtonAccent} onPress={onSettingsPress}>
            <Ionicons name="settings" size={20} color="#fff" />
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
        <Text style={styles.stat}>{hereTooCount} here too</Text>
      </View>
    </View>
  );
}

// --- Main screen ---

export default function MapScreen() {
  const [clips, setClips] = useState([]);
  const [hereTooClips, setHereTooClips] = useState([]);
  const [hereTooCount, setHereTooCount] = useState(0);
  const [profile, setProfile] = useState(null);
  const [allClips, setAllClips] = useState([]);
  const [circleCount, setCircleCount] = useState(0);
  const [showCircle, setShowCircle] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedSingleClip, setSelectedSingleClip] = useState(null);
  const [selectedClips, setSelectedClips] = useState(null);
  const currentUserIdRef = useRef(null);

  const refreshClips = useCallback(async () => {
    if (!currentUserIdRef.current) return;
    try {
      const { data } = await supabase.from('clips').select('*').eq('user_id', currentUserIdRef.current);
      const all = data ?? [];
      setAllClips(all);
      const located = all.filter(c => c.latitude != null && c.longitude != null);
      const withThumb = located.map(c => ({ ...c, thumbnailUri: c.thumbnail_url ?? null }));
      setClips(withThumb);
    } catch (err) {
      console.error('Clips refresh failed:', err.message);
    }
  }, []);

  const clusters = useMemo(() => buildClusters(clips), [clips]);

  const momentCount = allClips.length;
  const totalDuration = allClips.reduce((sum, c) => sum + (c.duration ?? 0), 0);

  useFocusEffect(
    useCallback(() => {
      const fetchAll = async () => {
        try {
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError || !user) throw userError ?? new Error('No user');
          currentUserIdRef.current = user.id;

          const [profileResult, clipsResult, circleResult, hereTooResult] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', user.id).single(),
            supabase.from('clips').select('*').eq('user_id', user.id),
            supabase.from('circles').select('user_id, circle_member_id').or(`user_id.eq.${user.id},circle_member_id.eq.${user.id}`),
            supabase.from('here_too_requests').select('clip_id').eq('requester_id', user.id).eq('status', 'approved'),
          ]);

          if (profileResult.data) setProfile(profileResult.data);
          setCircleCount(new Set((circleResult.data ?? []).map(r => r.user_id === user.id ? r.circle_member_id : r.user_id)).size);

          const hereTooRows = hereTooResult.data ?? [];
          setHereTooCount(hereTooRows.length);

          if (hereTooRows.length > 0) {
            const clipIds = hereTooRows.map(r => r.clip_id).filter(Boolean);
            const { data: hereTooClipData } = await supabase
              .from('clips')
              .select('*')
              .in('id', clipIds);
            const located = (hereTooClipData ?? []).filter(c => c.latitude != null && c.longitude != null);
            setHereTooClips(located.map(c => ({ ...c, thumbnailUri: c.thumbnail_url ?? null })));
          } else {
            setHereTooClips([]);
          }

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

    setSelectedSingleClip(resolvedClips[0]);
    setSelectedClips(resolvedClips.length > 1 ? resolvedClips : null);
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
        {hereTooClips.map(clip => (
          <Marker
            key={`heretoo_${clip.id}`}
            coordinate={{ latitude: clip.latitude, longitude: clip.longitude }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={clip.thumbnailUri === null}
            onPress={async () => {
              try {
                const { data, error } = await supabase.storage.from('clips').createSignedUrl(clip.uri, 3600);
                if (error) throw error;
                setSelectedSingleClip({ ...clip, playbackUri: data.signedUrl });
                setSelectedClips(null);
              } catch (err) {
                console.error('HereToo signed URL failed:', err.message);
              }
            }}
          >
            <HereTooPin thumbnailUri={clip.thumbnailUri} />
          </Marker>
        ))}
      </MapView>

      <ProfileCard
        profile={profile}
        momentCount={momentCount}
        totalDuration={totalDuration}
        circleCount={circleCount}
        hereTooCount={hereTooCount}
        onCirclePress={() => setShowCircle(true)}
        onSettingsPress={() => setShowSettings(true)}
      />
      <SettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />

      <CircleScreen
        visible={showCircle}
        onClose={() => setShowCircle(false)}
        onCircleChanged={() => {
          const uid = profile?.id;
          if (!uid) return;
          supabase.from('circles').select('user_id, circle_member_id').or(`user_id.eq.${uid},circle_member_id.eq.${uid}`).then(({ data }) => {
            setCircleCount(new Set((data ?? []).map(r => r.user_id === uid ? r.circle_member_id : r.user_id)).size);
          });
        }}
      />

      {selectedSingleClip ? (
        <VideoPlayer
          clip={selectedSingleClip}
          clips={selectedClips}
          onClose={() => { setSelectedSingleClip(null); setSelectedClips(null); }}
          onDelete={refreshClips}
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

const hereTooStyles = StyleSheet.create({
  box: {
    width: 38,
    height: 38,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: HERE_TOO_COLOR,
    overflow: 'hidden',
  },
  placeholder: {
    flex: 1,
    backgroundColor: HERE_TOO_COLOR,
  },
  stem: {
    width: 2,
    height: 8,
    backgroundColor: HERE_TOO_COLOR,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: HERE_TOO_COLOR,
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

const styles = StyleSheet.create({
  profileCard: {
    position: 'absolute',
    top: 52,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(31,31,31,0.92)',
    borderRadius: 15,
    borderWidth: 0.5,
    borderColor: '#333330',
    paddingVertical: 13,
    paddingHorizontal: 18,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '500',
  },
  circleBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#1F1F1F',
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBadgeText: {
    color: COLORS.accent,
    fontSize: 9,
    fontFamily: STAMP_FONT,
    lineHeight: 11,
  },
  name: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '500',
  },
  location: {
    color: COLORS.secondary,
    fontSize: 12,
    marginTop: 1,
  },
  iconRow: {
    flexDirection: 'row',
    gap: 9,
  },
  iconButtonSecondary: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonAccent: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 0.5,
    backgroundColor: '#333330',
    marginVertical: 11,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    color: COLORS.accent,
    fontSize: 12,
    fontFamily: STAMP_FONT,
    letterSpacing: 0.04 * 12,
  },
  statDot: {
    color: COLORS.accent,
    fontSize: 12,
    fontFamily: STAMP_FONT,
  },
});

const settingsModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#1F1F1F',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#333330',
    padding: 24,
    width: '80%',
  },
  title: {
    color: '#F5F1E8',
    fontSize: 15,
    fontWeight: '500',
    fontFamily: 'Courier New',
    marginBottom: 20,
  },
  signOutButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  signOutText: {
    color: '#E63946',
    fontSize: 14,
    fontFamily: 'Courier New',
  },
  cancelText: {
    color: '#7A5C4D',
    fontSize: 13,
    fontFamily: 'Courier New',
    textAlign: 'center',
  },
});
