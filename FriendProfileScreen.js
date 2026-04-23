import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Image, Pressable,
  ScrollView, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import { COLORS } from './constants';
import { supabase } from './supabase';
import VideoPlayer from './VideoPlayer';

const STAMP_FONT = 'Courier New';

const ADELAIDE = {
  latitude: -34.9285,
  longitude: 138.6007,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const DOT_MODE_THRESHOLD = 11;
const CLUSTER_STEP_X = 5;
const CLUSTER_STEP_Y = 4;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function formatPinDate(timestamp) {
  const d = new Date(timestamp);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}.${mm}.${yy}`;
}

function deltaForZoom(zoom) {
  return 360 / Math.pow(2, zoom + 1);
}

function zoomToResolveCluster(cluster) {
  const minPolaroidZoom = DOT_MODE_THRESHOLD + 1;
  if (cluster.clips.length === 1) return minPolaroidZoom;
  const clips = cluster.clips;
  let maxDist = 0;
  for (let i = 0; i < clips.length; i++) {
    for (let j = i + 1; j < clips.length; j++) {
      const d = Math.max(
        Math.abs(clips[i].latitude - clips[j].latitude),
        Math.abs(clips[i].longitude - clips[j].longitude)
      );
      if (d > maxDist) maxDist = d;
    }
  }
  for (let z = minPolaroidZoom; z <= 20; z++) {
    if (clusterThresholdForZoom(z) < maxDist) return z;
  }
  return minPolaroidZoom;
}

function clusterThresholdForZoom(zoom) {
  const HIGH_ZOOM_FLOOR = 0.00045;
  if (zoom <= DOT_MODE_THRESHOLD) return 0.01;
  if (zoom >= 16) return HIGH_ZOOM_FLOOR;
  const t = (zoom - DOT_MODE_THRESHOLD) / (16 - DOT_MODE_THRESHOLD);
  return 0.01 * (1 - t) + HIGH_ZOOM_FLOOR * t;
}

function buildClusters(clips, zoom) {
  const threshold = clusterThresholdForZoom(zoom);
  const used = new Set();
  const clusters = [];
  for (let i = 0; i < clips.length; i++) {
    if (used.has(i)) continue;
    const group = [clips[i]];
    used.add(i);
    for (let j = i + 1; j < clips.length; j++) {
      if (used.has(j)) continue;
      if (
        Math.abs(clips[i].latitude - clips[j].latitude) <= threshold &&
        Math.abs(clips[i].longitude - clips[j].longitude) <= threshold
      ) {
        group.push(clips[j]);
        used.add(j);
      }
    }
    group.sort((a, b) => b.timestamp - a.timestamp);
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

function pinSize(zoom) {
  return Math.min(100, Math.max(44, Math.round(64 * (1 + (zoom - 14) * 0.12))));
}

// ─── Pin components ───────────────────────────────────────────────────────────

function DotPin() {
  return <View style={[dotPinStyles.dot, { backgroundColor: COLORS.accent }]} />;
}

function PolaroidPin({ thumbnailUri, timestamp, size = 64 }) {
  const frameColor = COLORS.accent;
  const stripColor = COLORS.accent;
  const dateColor = '#F5F1E8';
  const imgH = Math.round(size * 0.68);
  const stripH = Math.round(size * 0.24);
  const pad = Math.round(size * 0.07);
  const fontSize = Math.max(7, Math.round(size * 0.14));
  return (
    <View style={pinStyles.container}>
      <View style={[pinStyles.frame, { width: size, backgroundColor: frameColor }]}>
        <View style={[pinStyles.imageWrapper, { margin: pad, marginBottom: 0, height: imgH }]}>
          {thumbnailUri
            ? <Image source={{ uri: thumbnailUri }} style={pinStyles.image} resizeMode="cover" />
            : <View style={pinStyles.placeholder} />
          }
        </View>
        <View style={[pinStyles.strip, { height: stripH, backgroundColor: stripColor }]}>
          <Text style={[pinStyles.dateText, { color: dateColor, fontSize }]}>
            {formatPinDate(timestamp)}
          </Text>
        </View>
      </View>
      <View style={pinStyles.stem} />
      <View style={pinStyles.dot} />
    </View>
  );
}

function ClusterPin({ thumbnailUri, timestamp, count, size = 64 }) {
  const frameColor = COLORS.accent;
  const stripColor = COLORS.accent;
  const dateColor = '#F5F1E8';
  const stackW = size + CLUSTER_STEP_X * 2;
  const imgH = Math.round(size * 0.68);
  const stripH = Math.round(size * 0.24);
  const pad = Math.round(size * 0.07);
  const fontSize = Math.max(7, Math.round(size * 0.14));
  const frameH = imgH + stripH + pad;
  const stemOffset = stackW - size / 2;
  return (
    <View style={clusterPinStyles.outerContainer}>
      <View style={{ width: stackW, height: frameH + CLUSTER_STEP_Y * 2 }}>
        <View style={[clusterPinStyles.frame, {
          width: size, height: frameH, backgroundColor: frameColor,
          right: CLUSTER_STEP_X * 2, bottom: CLUSTER_STEP_Y * 2,
        }]} />
        <View style={[clusterPinStyles.frame, {
          width: size, height: frameH, backgroundColor: frameColor,
          right: CLUSTER_STEP_X, bottom: CLUSTER_STEP_Y,
        }]} />
        <View style={[clusterPinStyles.frame, {
          width: size, height: frameH, backgroundColor: frameColor,
          right: 0, bottom: 0,
        }]}>
          <View style={[pinStyles.imageWrapper, { margin: pad, marginBottom: 0, height: imgH }]}>
            {thumbnailUri
              ? <Image source={{ uri: thumbnailUri }} style={pinStyles.image} resizeMode="cover" />
              : <View style={pinStyles.placeholder} />
            }
          </View>
          <View style={[clusterPinStyles.strip, { height: stripH, backgroundColor: stripColor }]}>
            <Text style={[pinStyles.dateText, { color: dateColor, fontSize }]}>
              {formatPinDate(timestamp)}
            </Text>
          </View>
          <View style={clusterPinStyles.badge}>
            <Text style={clusterPinStyles.badgeText}>{count}</Text>
          </View>
        </View>
      </View>
      <View style={{ width: stackW }}>
        <View style={[pinStyles.stem, { marginLeft: stemOffset - 1 }]} />
        <View style={[pinStyles.dot, { marginLeft: stemOffset - 3 }]} />
      </View>
    </View>
  );
}

// ─── Cluster strip ─────────────────────────────────────────────────────────────

function ClusterStrip({ cluster, onClose, onSelectClip }) {
  const { width: screenW } = useWindowDimensions();
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 14 }).start();
  }, []);

  const dismiss = () => {
    Animated.timing(slideAnim, { toValue: 300, duration: 250, useNativeDriver: true }).start(onClose);
  };

  const THUMB_W = Math.round(screenW / 4.5);
  const THUMB_H = Math.round(THUMB_W * 1.25);
  const PAD = Math.round(THUMB_W * 0.07);
  const DATE_H = Math.round(THUMB_H * 0.22);
  const IMG_H = THUMB_H - DATE_H - PAD;
  const DATE_FONT = Math.max(8, Math.round(THUMB_W * 0.15));

  return (
    <Animated.View style={[stripStyles.container, { transform: [{ translateY: slideAnim }] }]}>
      <View style={stripStyles.handleRow}>
        <View style={stripStyles.handle} />
        <Pressable style={stripStyles.closeBtn} onPress={dismiss} hitSlop={12}>
          <Ionicons name="close" size={18} color={COLORS.text} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={stripStyles.scrollContent}
      >
        {cluster.clips.map((clip) => (
          <Pressable key={clip.id} onPress={() => onSelectClip(clip)} style={{ marginRight: 10 }}>
            <View style={[stripStyles.thumbFrame, { width: THUMB_W, backgroundColor: COLORS.accent }]}>
              <View style={{ margin: PAD, marginBottom: 0, height: IMG_H, overflow: 'hidden', borderRadius: 2 }}>
                {clip.thumbnailUri
                  ? <Image source={{ uri: clip.thumbnailUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  : <View style={{ flex: 1, backgroundColor: COLORS.secondary, opacity: 0.4 }} />
                }
              </View>
              <View style={{ height: DATE_H, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[stripStyles.thumbDate, { fontSize: DATE_FONT, color: '#F5F1E8' }]}>
                  {formatPinDate(clip.timestamp)}
                </Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

// ─── Profile card ──────────────────────────────────────────────────────────────

function ProfileCard({ profile, momentCount, totalDuration, hereTooCount = 0, onBack }) {
  const [avatarError, setAvatarError] = useState(false);
  const initials = getInitials(profile?.full_name, profile?.username);
  const displayName = profile?.full_name || profile?.username || '—';
  const location = profile?.home_location || '';
  return (
    <View style={styles.profileCard}>
      <View style={styles.avatarRow}>
        <View style={{ width: 42, height: 42, marginRight: 13 }}>
          <View style={styles.avatar}>
            {profile?.avatar_url && !avatarError
              ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} onError={() => setAvatarError(true)} />
              : <Text style={styles.avatarInitials}>{initials}</Text>
            }
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          {profile?.username ? <Text style={styles.location} numberOfLines={1}>@{profile.username}</Text> : null}
          {location ? <Text style={styles.location} numberOfLines={1}>{location}</Text> : null}
        </View>
        <View style={styles.iconRow}>
          <Pressable style={styles.iconButtonSecondary} onPress={onBack} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>
      <View style={styles.divider} />
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{momentCount}</Text>
          <Text style={styles.statLabel}>moments</Text>
        </View>
        <View style={styles.statCardDivider} />
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatDuration(totalDuration)}</Text>
          <Text style={styles.statLabel}>recorded</Text>
        </View>
        <View style={styles.statCardDivider} />
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{hereTooCount}</Text>
          <Text style={styles.statLabel}>here too</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function FriendProfileScreen({ route, navigation }) {
  const { userId } = route.params;

  const [profile, setProfile] = useState(null);
  const [clips, setClips] = useState([]);
  const [zoomLevel, setZoomLevel] = useState(14);
  const [activeCluster, setActiveCluster] = useState(null);
  const [selectedClip, setSelectedClip] = useState(null);
  const mapRef = useRef(null);

  const isDotMode = zoomLevel < DOT_MODE_THRESHOLD;

  const clusters = useMemo(() => buildClusters(clips, zoomLevel), [clips, zoomLevel]);
  const size = pinSize(zoomLevel);

  const momentCount = clips.length;
  const totalDuration = clips.reduce((sum, c) => sum + (c.duration ?? 0), 0);

  useEffect(() => {
    const load = async () => {
      const [{ data: profileData }, { data: clipsData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('clips').select('*').eq('user_id', userId).order('timestamp', { ascending: false }),
      ]);
      if (profileData) setProfile(profileData);
      const located = (clipsData ?? []).filter(c => c.latitude != null && c.longitude != null);
      setClips(located.map(c => ({ ...c, thumbnailUri: c.thumbnail_url ?? null })));

      // Fit map to clips
      if (located.length > 0) {
        const coords = located.map(c => ({ latitude: c.latitude, longitude: c.longitude }));
        setTimeout(() => {
          if (!mapRef.current) return;
          if (coords.length === 1) {
            mapRef.current.animateToRegion({ ...coords[0], latitudeDelta: 0.005, longitudeDelta: 0.005 }, 600);
          } else {
            mapRef.current.fitToCoordinates(coords, {
              edgePadding: { top: 160, right: 60, bottom: 120, left: 60 },
              animated: true,
            });
          }
        }, 250);
      }
    };
    load();
  }, [userId]);

  const resolveClipUri = async (clip) => {
    const { data, error } = await supabase.storage.from('clips').createSignedUrl(clip.uri, 3600);
    if (error) throw error;
    return { ...clip, playbackUri: data.signedUrl };
  };

  const handleMarkerTap = useCallback(async (cluster) => {
    if (isDotMode) {
      const targetZoom = zoomToResolveCluster(cluster);
      const delta = deltaForZoom(targetZoom);
      mapRef.current?.animateToRegion({
        latitude: cluster.centroid.latitude,
        longitude: cluster.centroid.longitude,
        latitudeDelta: delta,
        longitudeDelta: delta,
      }, 500);
      return;
    }
    if (cluster.clips.length === 1) {
      try {
        const resolved = await resolveClipUri(cluster.clips[0]);
        setSelectedClip(resolved);
      } catch (err) {
        console.error('Clip URI failed:', err.message);
      }
    } else {
      setActiveCluster(cluster);
    }
  }, [isDotMode]);

  const handleStripSelectClip = async (clip) => {
    try {
      const resolved = await resolveClipUri(clip);
      setSelectedClip(resolved);
    } catch (err) {
      console.error('Clip URI failed:', err.message);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
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
        onRegionChangeComplete={(region) => {
          const zoom = Math.round(Math.log2(360 / region.latitudeDelta) - 1);
          setZoomLevel(Math.max(1, Math.min(20, zoom)));
        }}
      >
        {clusters.map(cluster => {
          const frontClip = cluster.clips[0];
          const isMulti = cluster.clips.length > 1;
          const stackW = size + CLUSTER_STEP_X * 2;
          const anchorX = isMulti ? (stackW - size / 2) / stackW : 0.5;
          return (
            <Marker
              key={cluster.id}
              coordinate={cluster.centroid}
              anchor={{ x: anchorX, y: 1 }}
              tracksViewChanges={cluster.clips.some(c => !c.thumbnailUri)}
              onPress={() => handleMarkerTap(cluster)}
            >
              {isDotMode ? (
                <DotPin />
              ) : isMulti ? (
                <ClusterPin
                  thumbnailUri={frontClip.thumbnailUri}
                  timestamp={frontClip.timestamp}
                  count={cluster.clips.length}
                  size={size}
                />
              ) : (
                <PolaroidPin
                  thumbnailUri={frontClip.thumbnailUri}
                  timestamp={frontClip.timestamp}
                  size={size}
                />
              )}
            </Marker>
          );
        })}
      </MapView>

      <ProfileCard
        profile={profile}
        momentCount={momentCount}
        totalDuration={totalDuration}
        onBack={() => navigation.goBack()}
      />

      {activeCluster && !selectedClip && (
        <ClusterStrip
          cluster={activeCluster}
          onClose={() => setActiveCluster(null)}
          onSelectClip={handleStripSelectClip}
        />
      )}

      {selectedClip && (
        <VideoPlayer
          clip={selectedClip}
          clips={null}
          onClose={() => setSelectedClip(null)}
          onDelete={null}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const dotPinStyles = StyleSheet.create({
  dot: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 1,
    borderColor: 'rgba(31,31,31,0.4)',
  },
});

const pinStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  frame: {
    borderRadius: 3,
    overflow: 'hidden',
  },
  imageWrapper: {
    overflow: 'hidden',
    borderRadius: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    backgroundColor: COLORS.secondary,
    opacity: 0.4,
  },
  strip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: {
    fontFamily: STAMP_FONT,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  stem: {
    width: 2,
    height: 8,
    backgroundColor: COLORS.secondary,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.secondary,
  },
});

const clusterPinStyles = StyleSheet.create({
  outerContainer: {
    alignItems: 'flex-start',
  },
  frame: {
    position: 'absolute',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#1F1F1F',
    overflow: 'hidden',
  },
  strip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 5,
    left: 5,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: '#F5F1E8',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  badgeText: {
    color: COLORS.accent,
    fontSize: 9,
    fontWeight: '700',
  },
});

const stripStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(31,31,31,0.97)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 0.5,
    borderColor: 'rgba(245,241,232,0.1)',
    paddingBottom: 28,
  },
  handleRow: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  handle: {
    width: 36,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(245,241,232,0.2)',
  },
  closeBtn: {
    position: 'absolute',
    right: 18,
    top: 9,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  thumbFrame: {
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1F1F1F',
  },
  thumbDate: {
    fontFamily: STAMP_FONT,
    fontWeight: '600',
    letterSpacing: 0.5,
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
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
  divider: {
    height: 0.5,
    backgroundColor: '#333330',
    marginVertical: 11,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: COLORS.accent,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statLabel: {
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: '400',
    fontFamily: STAMP_FONT,
    marginTop: 2,
  },
  statCardDivider: {
    width: 0.5,
    height: 28,
    backgroundColor: COLORS.secondary,
    opacity: 0.3,
  },
});
