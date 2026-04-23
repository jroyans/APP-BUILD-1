import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Image, Pressable,
  ScrollView, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import MapView, { Marker } from 'react-native-maps';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { COLORS, RecordingContext } from './constants';
import { supabase } from './supabase';
import VideoPlayer from './VideoPlayer';
import CircleScreen from './CircleScreen';
import SettingsScreen from './SettingsScreen';

const STAMP_FONT = 'Courier New';

const ADELAIDE = {
  latitude: -34.9285,
  longitude: 138.6007,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// Zoom level at which pins switch between dot and polaroid
const DOT_MODE_THRESHOLD = 11;

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

// ─── Clustering ───────────────────────────────────────────────────────────────

// Zoom-aware cluster threshold in degrees.
// Aggressive at city zoom, 50m floor at high zoom to absorb GPS drift.
// Lat/lng delta from a zoom level integer
function deltaForZoom(zoom) {
  return 360 / Math.pow(2, zoom + 1);
}

// Minimum zoom level needed to make a dot's cluster actionable:
// - Must cross DOT_MODE_THRESHOLD so polaroids render
// - If multi-clip, must be high enough that the cluster either separates
//   OR is within the permanent 50m threshold (stays as one, but is now a
//   tappable cluster polaroid showing the strip)
function zoomToResolveCluster(cluster) {
  const minPolaroidZoom = DOT_MODE_THRESHOLD + 1; // first zoom where polaroids show
  if (cluster.clips.length === 1) return minPolaroidZoom;

  // Max Chebyshev distance between any pair of clips
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

  // Find the first integer zoom where the cluster threshold drops below maxDist,
  // meaning clips would start to separate. If maxDist is within the permanent
  // floor, they'll always cluster together — just show as polaroid cluster at
  // minPolaroidZoom.
  for (let z = minPolaroidZoom; z <= 20; z++) {
    if (clusterThresholdForZoom(z) < maxDist) return z;
  }
  return minPolaroidZoom;
}

function clusterThresholdForZoom(zoom) {
  const HIGH_ZOOM_FLOOR = 0.00045; // ~50m, handles GPS inaccuracy
  if (zoom <= DOT_MODE_THRESHOLD) return 0.01;   // ~1km at city view
  if (zoom >= 16) return HIGH_ZOOM_FLOOR;
  const t = (zoom - DOT_MODE_THRESHOLD) / (16 - DOT_MODE_THRESHOLD);
  return 0.01 * (1 - t) + HIGH_ZOOM_FLOOR * t;
}

// Own + HereToo clips merged into unified clusters.
// Each clip must have { latitude, longitude, timestamp, hereToo? }
function buildClusters(clips, latitudeDelta) {
  const zoom = Math.log2(360 / latitudeDelta) - 1;
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
    // Most recent first — front thumbnail + date from clips[0]
    group.sort((a, b) => b.timestamp - a.timestamp);
    const lat = group.reduce((s, c) => s + c.latitude, 0) / group.length;
    const lng = group.reduce((s, c) => s + c.longitude, 0) / group.length;
    clusters.push({
      id: `cluster_${clips[i].id ?? clips[i].localId}`,
      clips: group,
      centroid: { latitude: lat, longitude: lng },
    });
  }
  return clusters;
}

// Pin size: 64px at latitudeDelta ≈ 0.05 (zoom 14), scales continuously, capped 44–100px
function pinSize(latitudeDelta) {
  const zoom = Math.log2(360 / latitudeDelta) - 1;
  return Math.min(100, Math.max(44, Math.round(64 * (1 + (zoom - 14) * 0.12))));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Simple dot shown below DOT_MODE_THRESHOLD
function DotPin({ hereToo }) {
  return (
    <View style={[dotPinStyles.dot, {
      backgroundColor: hereToo ? '#F5F1E8' : COLORS.accent,
    }]} />
  );
}

function PolaroidPin({ thumbnailUri, timestamp, hereToo = false, ownerProfile = null, size = 64 }) {
  const [badgeError, setBadgeError] = useState(false);
  const frameColor = hereToo ? '#F5F1E8' : COLORS.accent;
  const stripColor = hereToo ? '#FFFFFF' : COLORS.accent;
  const dateColor = hereToo ? COLORS.secondary : '#F5F1E8';
  const imgH = Math.round(size * 0.68);
  const stripH = Math.round(size * 0.24);
  const pad = Math.round(size * 0.07);
  const fontSize = Math.max(7, Math.round(size * 0.14));
  const avatarSize = Math.round(size * 0.28);
  return (
    <View style={pinStyles.container}>
      <View style={[pinStyles.frame, { width: size, backgroundColor: frameColor }]}>
        <View style={[pinStyles.imageWrapper, { margin: pad, marginBottom: 0, height: imgH }]}>
          {thumbnailUri ? (
            <Image source={{ uri: thumbnailUri }} style={pinStyles.image} resizeMode="cover" />
          ) : (
            <View style={pinStyles.placeholder} />
          )}
        </View>
        {hereToo && ownerProfile && (
          <View style={[pinStyles.cornerBadge, { top: pad, left: pad, width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2, overflow: 'hidden' }]}>
            {ownerProfile.avatar_url && !badgeError
              ? <Image source={{ uri: ownerProfile.avatar_url }} style={{ width: avatarSize, height: avatarSize }} onError={() => setBadgeError(true)} />
              : <Text style={[pinStyles.cornerBadgeText, { fontSize: Math.max(6, Math.round(avatarSize * 0.42)) }]}>{getInitials(ownerProfile.full_name, ownerProfile.username)}</Text>
            }
          </View>
        )}
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

const CLUSTER_STEP_X = 5;
const CLUSTER_STEP_Y = 4;

function ClusterPin({ thumbnailUri, timestamp, count, frontHereToo = false, size = 64 }) {
  const frameColor = frontHereToo ? '#F5F1E8' : COLORS.accent;
  const stripColor = frontHereToo ? '#FFFFFF' : COLORS.accent;
  const dateColor = frontHereToo ? COLORS.secondary : '#F5F1E8';
  const stackW = size + CLUSTER_STEP_X * 2;
  const stemOffset = stackW - size / 2;
  const imgH = Math.round(size * 0.68);
  const stripH = Math.round(size * 0.24);
  const pad = Math.round(size * 0.07);
  const fontSize = Math.max(7, Math.round(size * 0.14));
  const frameH = imgH + stripH + pad;
  return (
    <View style={clusterPinStyles.outerContainer}>
      <View style={{ width: stackW, height: frameH + CLUSTER_STEP_Y * 2 }}>
        {/* Back frames — same color as front, separated by 1px dark border */}
        <View style={[clusterPinStyles.frame, {
          width: size, height: frameH, backgroundColor: frameColor,
          right: CLUSTER_STEP_X * 2, bottom: CLUSTER_STEP_Y * 2,
        }]} />
        <View style={[clusterPinStyles.frame, {
          width: size, height: frameH, backgroundColor: frameColor,
          right: CLUSTER_STEP_X, bottom: CLUSTER_STEP_Y,
        }]} />
        {/* Front frame */}
        <View style={[clusterPinStyles.frame, {
          width: size, height: frameH, backgroundColor: frameColor,
          right: 0, bottom: 0,
        }]}>
          <View style={[pinStyles.imageWrapper, { margin: pad, marginBottom: 0, height: imgH }]}>
            {thumbnailUri ? (
              <Image source={{ uri: thumbnailUri }} style={pinStyles.image} resizeMode="cover" />
            ) : (
              <View style={pinStyles.placeholder} />
            )}
          </View>
          <View style={[clusterPinStyles.strip, { height: stripH, backgroundColor: stripColor }]}>
            <Text style={[pinStyles.dateText, { color: dateColor, fontSize }]}>
              {formatPinDate(timestamp)}
            </Text>
          </View>
          {/* Count badge top-left */}
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

function ThumbAvatar({ ownerProfile, size }) {
  const [imgError, setImgError] = useState(false);
  return ownerProfile.avatar_url && !imgError
    ? <Image source={{ uri: ownerProfile.avatar_url }} style={{ width: size, height: size }} onError={() => setImgError(true)} />
    : <Text style={[stripStyles.thumbAvatarText, { fontSize: Math.max(6, Math.round(size * 0.42)) }]}>{getInitials(ownerProfile.full_name, ownerProfile.username)}</Text>;
}

function ClusterStrip({ cluster, ownerProfiles, onClose, onSelectClip }) {
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
  const AVATAR_SIZE = Math.round(THUMB_W * 0.26);
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
        {cluster.clips.map((clip) => {
          const isHereToo = clip.hereToo ?? false;
          const frameColor = isHereToo ? '#F5F1E8' : COLORS.accent;
          const dateColor = isHereToo ? COLORS.secondary : '#F5F1E8';
          const ownerProfile = isHereToo ? ownerProfiles[clip.user_id] : null;
          return (
            <Pressable key={clip.id ?? clip.localId} onPress={() => onSelectClip(clip)} style={{ marginRight: 10 }}>
              <View style={[stripStyles.thumbFrame, { width: THUMB_W, backgroundColor: frameColor }]}>
                <View style={{ margin: PAD, marginBottom: 0, height: IMG_H, overflow: 'hidden', borderRadius: 2 }}>
                  {clip.thumbnailUri ? (
                    <Image source={{ uri: clip.thumbnailUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <View style={{ flex: 1, backgroundColor: COLORS.secondary, opacity: 0.4 }} />
                  )}
                </View>
                {isHereToo && ownerProfile && (
                  <View style={[stripStyles.thumbAvatar, {
                    width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2,
                    top: PAD, left: PAD, overflow: 'hidden',
                  }]}>
                    <ThumbAvatar ownerProfile={ownerProfile} size={AVATAR_SIZE} />
                  </View>
                )}
                <View style={{ height: DATE_H, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[stripStyles.thumbDate, { fontSize: DATE_FONT, color: dateColor }]}>
                    {formatPinDate(clip.timestamp)}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}


// ─── Profile card ──────────────────────────────────────────────────────────────

function ProfileCard({ profile, momentCount, totalDuration, circleCount, hereTooCount, pendingRequestCount, onCirclePress, onSettingsPress }) {
  const [avatarError, setAvatarError] = useState(false);
  const initials = getInitials(profile?.full_name, profile?.username);
  const displayName = profile?.full_name || profile?.username || '—';
  const location = profile?.home_location || 'Adelaide, Australia';
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
          <View style={styles.circleBadge}>
            <Text style={styles.circleBadgeText}>{circleCount}</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          {profile?.username ? <Text style={styles.location} numberOfLines={1}>@{profile.username}</Text> : null}
          <Text style={styles.location} numberOfLines={1}>{location}</Text>
        </View>
        <View style={styles.iconRow}>
          <View>
            <Pressable style={styles.iconButtonSecondary} onPress={onCirclePress}>
              <Ionicons name="people" size={20} color="#fff" />
            </Pressable>
            {pendingRequestCount > 0 && <View style={styles.requestDot} />}
          </View>
          <Pressable style={styles.iconButtonAccent} onPress={onSettingsPress}>
            <Ionicons name="settings" size={20} color="#fff" />
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

export default function MapScreen({ navigation }) {
  const [clips, setClips] = useState([]);
  const [hereTooClips, setHereTooClips] = useState([]);
  const [hereTooCount, setHereTooCount] = useState(0);
  const [allClips, setAllClips] = useState([]);
  const [circleCount, setCircleCount] = useState(0);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [ownerProfiles, setOwnerProfiles] = useState({});
  const [showCircle, setShowCircle] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [latitudeDelta, setLatitudeDelta] = useState(0.05);
  const [activeCluster, setActiveCluster] = useState(null);
  const [selectedClip, setSelectedClip] = useState(null);
  const currentUserIdRef = useRef(null);
  const mapRef = useRef(null);

  const { pendingClips, removePendingClip, setIsStripOpen, profile, setProfile } = useContext(RecordingContext);

  const isDotMode = Math.log2(360 / latitudeDelta) - 1 < DOT_MODE_THRESHOLD;

  const supabaseTimestamps = useMemo(() => new Set(clips.map(c => c.timestamp)), [clips]);
  const mergedOwnClips = useMemo(() => {
    const fresh = pendingClips.filter(
      p => p.latitude != null && p.longitude != null && !supabaseTimestamps.has(p.timestamp)
    );
    return [...clips, ...fresh];
  }, [clips, pendingClips, supabaseTimestamps]);

  // Unified clip pool: own clips + hereToo clips tagged with hereToo:true
  const allClipsForMap = useMemo(() => [
    ...mergedOwnClips,
    ...hereTooClips.map(c => ({ ...c, hereToo: true })),
  ], [mergedOwnClips, hereTooClips]);

  const clusters = useMemo(() => buildClusters(allClipsForMap, latitudeDelta), [allClipsForMap, latitudeDelta]);
  const size = pinSize(latitudeDelta);

  const momentCount = allClips.length;
  const totalDuration = allClips.reduce((sum, c) => sum + (c.duration ?? 0), 0);

  const fitToAllClips = useCallback((ownLocated, hereTooLocated) => {
    const coords = [
      ...ownLocated.map(c => ({ latitude: c.latitude, longitude: c.longitude })),
      ...hereTooLocated.map(c => ({ latitude: c.latitude, longitude: c.longitude })),
    ].filter(c => c.latitude != null && c.longitude != null);
    if (coords.length === 0) return;
    setTimeout(() => {
      if (!mapRef.current) return;
      if (coords.length === 1) {
        mapRef.current.animateToRegion({
          ...coords[0],
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 600);
      } else {
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 160, right: 60, bottom: 120, left: 60 },
          animated: true,
        });
      }
    }, 250);
  }, []);

  const refreshClips = useCallback(async () => {
    if (!currentUserIdRef.current) return;
    try {
      const { data } = await supabase.from('clips').select('*').eq('user_id', currentUserIdRef.current);
      const all = data ?? [];
      setAllClips(all);
      const located = all.filter(c => c.latitude != null && c.longitude != null);
      setClips(located.map(c => ({ ...c, thumbnailUri: c.thumbnail_url ?? null })));
    } catch (err) {
      console.error('Clips refresh failed:', err.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const fetchAll = async () => {
        try {
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError || !user) throw userError ?? new Error('No user');
          currentUserIdRef.current = user.id;

          const [clipsResult, circleResult, hereTooResult, pendingCircleResult, pendingHereTooResult] = await Promise.all([
            supabase.from('clips').select('*').eq('user_id', user.id),
            supabase.from('circles').select('user_id, circle_member_id').or(`user_id.eq.${user.id},circle_member_id.eq.${user.id}`),
            supabase.from('here_too_requests').select('clip_id').eq('requester_id', user.id).eq('status', 'approved'),
            supabase.from('circle_requests').select('id', { count: 'exact', head: true }).eq('receiver_id', user.id).eq('status', 'pending'),
            supabase.from('here_too_requests').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).eq('status', 'pending'),
          ]);

          setPendingRequestCount((pendingCircleResult.count ?? 0) + (pendingHereTooResult.count ?? 0));

          setCircleCount(new Set((circleResult.data ?? []).map(r => r.user_id === user.id ? r.circle_member_id : r.user_id)).size);

          const hereTooRows = hereTooResult.data ?? [];
          setHereTooCount(hereTooRows.length);

          let locatedHereToo = [];
          if (hereTooRows.length > 0) {
            const clipIds = hereTooRows.map(r => r.clip_id).filter(Boolean);
            const { data: hereTooClipData } = await supabase.from('clips').select('*').in('id', clipIds);
            locatedHereToo = (hereTooClipData ?? []).filter(c => c.latitude != null && c.longitude != null);
            setHereTooClips(locatedHereToo.map(c => ({ ...c, thumbnailUri: c.thumbnail_url ?? null })));

            // Fetch owner profiles for hereToo clips
            const ownerIds = [...new Set(locatedHereToo.map(c => c.user_id))].filter(Boolean);
            if (ownerIds.length > 0) {
              const { data: profilesData } = await supabase.from('profiles').select('*').in('id', ownerIds);
              const profileMap = {};
              (profilesData ?? []).forEach(p => { profileMap[p.id] = p; });
              setOwnerProfiles(profileMap);
            }
          } else {
            setHereTooClips([]);
          }

          const data = clipsResult.data ?? [];
          setAllClips(data);
          const located = data.filter(c => c.latitude != null && c.longitude != null);
          console.log('Clips fetched:', located.length, 'with GPS coordinates');
          const withThumb = located.map(c => ({ ...c, thumbnailUri: c.thumbnail_url ?? null }));
          setClips(withThumb);

          // Remove pending clips now confirmed in Supabase
          const supabaseTs = new Set(data.map(c => c.timestamp));
          pendingClips.filter(p => supabaseTs.has(p.timestamp)).forEach(p => removePendingClip(p.localId));

          for (const clip of withThumb) {
            if (clip.thumbnail_url) continue;
            resolveThumbnail(clip, user.id);
          }

          // Fit map to show all clips on every focus
          fitToAllClips(located, locatedHereToo);
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
        .from('clips').createSignedUrl(clip.uri, 3600);
      if (signedError) throw signedError;

      const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(signedData.signedUrl, { time: 1000 });
      const thumbBlob = await fetch(thumbUri).then(r => r.blob());
      const thumbPath = `${userId}/thumb_${clip.timestamp}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('thumbnails').upload(thumbPath, thumbBlob, { contentType: 'image/jpeg' });
      if (uploadError && uploadError.statusCode !== '409') throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('thumbnails').getPublicUrl(thumbPath);

      const { error: updateError } = await supabase.from('clips')
        .update({ thumbnail_url: publicUrl }).eq('id', clip.id);
      if (updateError) throw updateError;

      setClips(prev => prev.map(c => c.id === clip.id ? { ...c, thumbnailUri: publicUrl } : c));
    } catch (err) {
      console.error('Thumbnail resolution failed for clip', clip.id, ':', err.message);
    }
  };

  const resolveClipUri = async (clip) => {
    if (clip.isLocal) return { ...clip, playbackUri: clip.uri };
    const { data, error } = await supabase.storage.from('clips').createSignedUrl(clip.uri, 3600);
    if (error) throw error;
    return { ...clip, playbackUri: data.signedUrl };
  };

  const handleMarkerTap = async (cluster) => {
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
      setIsStripOpen(true);
    }
  };

  const handleStripClose = () => {
    setActiveCluster(null);
    setIsStripOpen(false);
  };

  const handleStripSelectClip = async (clip) => {
    try {
      const resolved = await resolveClipUri(clip);
      setSelectedClip(resolved);
    } catch (err) {
      console.error('Clip URI failed:', err.message);
    }
  };

  const handleVideoClose = () => {
    setSelectedClip(null);
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
        onRegionChange={(region) => {
          setLatitudeDelta(region.latitudeDelta);
        }}
      >
        {clusters.map(cluster => {
          const frontClip = cluster.clips[0];
          const frontHereToo = frontClip.hereToo ?? false;
          const stackW = size + CLUSTER_STEP_X * 2;
          const isMulti = cluster.clips.length > 1;
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
                <DotPin hereToo={frontHereToo} />
              ) : isMulti ? (
                <ClusterPin
                  thumbnailUri={frontClip.thumbnailUri}
                  timestamp={frontClip.timestamp}
                  count={cluster.clips.length}
                  frontHereToo={frontHereToo}
                  size={size}
                />
              ) : (
                <PolaroidPin
                  thumbnailUri={frontClip.thumbnailUri}
                  timestamp={frontClip.timestamp}
                  hereToo={frontHereToo}
                  ownerProfile={frontHereToo ? ownerProfiles[frontClip.user_id] : null}
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
        circleCount={circleCount}
        hereTooCount={hereTooCount}
        pendingRequestCount={pendingRequestCount}
        onCirclePress={() => setShowCircle(true)}
        onSettingsPress={() => setShowSettings(true)}
      />
      <CircleScreen
        visible={showCircle}
        onClose={() => setShowCircle(false)}
        onProfilePress={(userId) => { setShowCircle(false); navigation.navigate('FriendProfile', { userId }); }}
        onPendingCountChange={(count) => setPendingRequestCount(count)}
        onCircleChanged={() => {
          const uid = profile?.id;
          if (!uid) return;
          supabase.from('circles').select('user_id, circle_member_id').or(`user_id.eq.${uid},circle_member_id.eq.${uid}`).then(({ data }) => {
            setCircleCount(new Set((data ?? []).map(r => r.user_id === uid ? r.circle_member_id : r.user_id)).size);
          });
        }}
      />

      {activeCluster && !selectedClip && (
        <ClusterStrip
          cluster={activeCluster}
          ownerProfiles={ownerProfiles}
          onClose={handleStripClose}
          onSelectClip={handleStripSelectClip}
        />
      )}

      {selectedClip && (
        <VideoPlayer
          clip={selectedClip}
          clips={null}
          onClose={handleVideoClose}
          onDelete={refreshClips}
        />
      )}

      <SettingsScreen
        visible={showSettings}
        onClose={() => setShowSettings(false)}
      />
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
  cornerBadge: {
    position: 'absolute',
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    borderWidth: 1,
    borderColor: 'rgba(31,31,31,0.3)',
  },
  cornerBadgeText: {
    color: '#F5F1E8',
    fontWeight: '700',
    fontFamily: STAMP_FONT,
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
  thumbAvatar: {
    position: 'absolute',
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    borderWidth: 1,
    borderColor: 'rgba(31,31,31,0.3)',
  },
  thumbAvatarText: {
    color: '#F5F1E8',
    fontWeight: '700',
    fontFamily: STAMP_FONT,
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
  circleBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1F1F1F',
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBadgeText: {
    color: COLORS.accent,
    fontSize: 10,
    fontFamily: STAMP_FONT,
    fontWeight: '600',
    includeFontPadding: false,
    textAlignVertical: 'center',
    marginLeft: 0.5,
    marginTop: 0.5,
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
  requestDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#C86A4A',
    borderWidth: 1.5,
    borderColor: 'rgba(31,31,31,0.92)',
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

