import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Image, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { COLORS, RecordingContext } from './constants';
import { supabase } from './supabase';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(fullName, username) {
  if (fullName?.trim()) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (username ?? '??').slice(0, 2).toUpperCase();
}

function formatLocationName(result) {
  const a = result.address || {};
  const city = a.city || a.town || a.village || a.municipality || a.county || '';
  const state = a.state || '';
  const country = a.country || '';
  return [city, state, country].filter(Boolean).join(', ') || result.display_name;
}

// ─── Photo action sheet ───────────────────────────────────────────────────────

function PhotoActionSheet({ visible, hasPhoto, onAdd, onRemove, onCancel }) {
  const [shown, setShown] = useState(false);
  const slideAnim = useRef(new Animated.Value(200)).current;

  useEffect(() => {
    if (visible) {
      setShown(true);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 200, duration: 200, useNativeDriver: true })
        .start(() => setShown(false));
    }
  }, [visible]);

  if (!shown) return null;

  return (
    <View style={sheetStyles.overlay}>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onCancel} />
      <Animated.View style={[sheetStyles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <Pressable style={sheetStyles.option} onPress={onAdd}>
          <Text style={sheetStyles.optionText}>{hasPhoto ? 'change photo' : 'add photo'}</Text>
        </Pressable>
        {hasPhoto && (
          <>
            <View style={sheetStyles.divider} />
            <Pressable style={sheetStyles.option} onPress={onRemove}>
              <Text style={[sheetStyles.optionText, { color: COLORS.accent }]}>remove photo</Text>
            </Pressable>
          </>
        )}
        <View style={sheetStyles.gap} />
        <Pressable style={sheetStyles.option} onPress={onCancel}>
          <Text style={sheetStyles.cancelText}>cancel</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ─── Save tick hook ───────────────────────────────────────────────────────────

function useSaveTick() {
  const opacity = useRef(new Animated.Value(0)).current;
  const flash = useCallback(() => {
    opacity.stopAnimation();
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1000),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [opacity]);
  return { opacity, flash };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function EditProfileScreen({ onBack, onProfileUpdated }) {
  const insets = useSafeAreaInsets();
  const { profile: initialProfile } = useContext(RecordingContext);

  const [userId, setUserId] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(initialProfile?.avatar_url ?? null);
  const [username, setUsername] = useState(initialProfile?.username ?? '');
  const [fullName, setFullName] = useState(initialProfile?.full_name ?? '');
  const [locationSearch, setLocationSearch] = useState('');
  const [locationResults, setLocationResults] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);

  const [photoActionSheet, setPhotoActionSheet] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState('idle'); // idle | checking | available | taken

  const nameTick = useSaveTick();
  const usernameTick = useSaveTick();
  const locationTick = useSaveTick();

  const originalUsername = useRef(initialProfile?.username ?? '');
  const usernameDebounce = useRef(null);
  const locationDebounce = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  // Sync fields if context profile loads after this component mounts
  useEffect(() => {
    if (!initialProfile) return;
    setAvatarUrl(prev => prev ?? initialProfile.avatar_url ?? null);
    setUsername(prev => prev || initialProfile.username || '');
    setFullName(prev => prev || initialProfile.full_name || '');
    if (!originalUsername.current) originalUsername.current = initialProfile.username ?? '';
  }, [initialProfile]);

  // ─── Photo ──────────────────────────────────────────────────────────────────

  const handleAddPhoto = async () => {
    setPhotoActionSheet(false);
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !userId) return;

    setPhotoUploading(true);
    try {
      const uri = result.assets[0].uri;
      const base64 = await FileSystemLegacy.readAsStringAsync(uri, { encoding: 'base64' });
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const path = `${userId}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, bytes.buffer, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const urlWithBust = `${publicUrl}?t=${Date.now()}`;
      const { error: dbError } = await supabase.from('profiles').update({ avatar_url: urlWithBust }).eq('id', userId);
      if (dbError) {
        console.error('avatar_url DB write failed:', dbError.message, dbError);
        throw dbError;
      }
      console.log('avatar_url saved to DB:', urlWithBust);
      setAvatarUrl(urlWithBust);
      onProfileUpdated?.({ avatar_url: urlWithBust });
    } catch (err) {
      console.error('Photo upload failed:', err.message);
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoActionSheet(false);
    if (!userId) return;
    try {
      await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
      setAvatarUrl(null);
      onProfileUpdated?.({ avatar_url: null });
    } catch (err) {
      console.error('Remove photo failed:', err.message);
    }
  };

  // ─── Username ────────────────────────────────────────────────────────────────

  const handleUsernameChange = (text) => {
    setUsername(text);
    clearTimeout(usernameDebounce.current);
    const trimmed = text.trim().toLowerCase();
    if (!trimmed) { setUsernameStatus('idle'); return; }
    if (trimmed === originalUsername.current) { setUsernameStatus('available'); return; }
    setUsernameStatus('checking');
    usernameDebounce.current = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', trimmed)
          .maybeSingle();
        setUsernameStatus(data ? 'taken' : 'available');
      } catch { setUsernameStatus('idle'); }
    }, 400);
  };

  const handleUsernameBlur = async () => {
    if (usernameStatus !== 'available' || !userId) return;
    const trimmed = username.trim().toLowerCase();
    if (!trimmed || trimmed === originalUsername.current) return;
    try {
      await supabase.from('profiles').update({ username: trimmed }).eq('id', userId);
      originalUsername.current = trimmed;
      onProfileUpdated?.({ username: trimmed });
      usernameTick.flash();
    } catch (err) {
      console.error('Username save failed:', err.message);
    }
  };

  // ─── Full name ───────────────────────────────────────────────────────────────

  const handleFullNameBlur = async () => {
    if (!userId) return;
    const trimmed = fullName.trim();
    if (trimmed === (initialProfile?.full_name ?? '').trim()) return;
    try {
      await supabase.from('profiles').update({ full_name: trimmed }).eq('id', userId);
      onProfileUpdated?.({ full_name: trimmed });
      nameTick.flash();
    } catch (err) {
      console.error('Full name save failed:', err.message);
    }
  };

  // ─── Location ────────────────────────────────────────────────────────────────

  const handleLocationChange = (text) => {
    setLocationSearch(text);
    setSelectedLocation(null);
    clearTimeout(locationDebounce.current);
    if (!text.trim()) { setLocationResults([]); return; }
    locationDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&limit=5&addressdetails=1`,
          { headers: { 'User-Agent': 'VoraApp/1.0', 'Accept-Language': 'en' } }
        );
        setLocationResults(await res.json());
      } catch { setLocationResults([]); }
    }, 450);
  };

  const handleSelectLocation = (result) => {
    const name = formatLocationName(result);
    setSelectedLocation({ name, latitude: parseFloat(result.lat), longitude: parseFloat(result.lon) });
    setLocationSearch(name);
    setLocationResults([]);
  };

  const handleConfirmLocation = async () => {
    if (!selectedLocation || !userId) return;
    try {
      await supabase.from('profiles').update({ home_location: selectedLocation.name }).eq('id', userId);
      onProfileUpdated?.({ home_location: selectedLocation.name });
      setSelectedLocation(null);
      locationTick.flash();
    } catch (err) {
      console.error('Location save failed:', err.message);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  const initials = getInitials(initialProfile?.full_name, initialProfile?.username);
  const showAvailableTick =
    usernameStatus === 'available' &&
    username.trim().toLowerCase() !== originalUsername.current;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </Pressable>
        <Text style={styles.title}>edit profile</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── Avatar ─────────────────────────────────────────────────────────── */}
        <View style={styles.avatarSection}>
          <Pressable onPress={() => setPhotoActionSheet(true)} style={styles.avatarPressable}>
            {photoUploading ? (
              <View style={styles.avatar}>
                <ActivityIndicator color={COLORS.text} />
              </View>
            ) : avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={11} color={COLORS.text} />
            </View>
          </Pressable>
        </View>

        {/* ── Username ───────────────────────────────────────────────────────── */}
        <View style={styles.field}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>USERNAME</Text>
            <Animated.Text style={[styles.savedText, { opacity: usernameTick.opacity }]}>saved</Animated.Text>
          </View>
          <View style={styles.inputRow}>
            <Text style={styles.prefix}>@</Text>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={username}
              onChangeText={handleUsernameChange}
              onBlur={handleUsernameBlur}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="username"
              placeholderTextColor={COLORS.secondary}
            />
            <View style={styles.statusSlot}>
              {usernameStatus === 'checking' && (
                <ActivityIndicator size="small" color={COLORS.secondary} />
              )}
              {showAvailableTick && (
                <Ionicons name="checkmark" size={17} color="#6ABF6A" />
              )}
              {usernameStatus === 'taken' && (
                <Ionicons name="close" size={17} color={COLORS.accent} />
              )}
            </View>
          </View>
          {usernameStatus === 'taken' && (
            <Text style={styles.errorText}>username taken</Text>
          )}
        </View>

        {/* ── Full name ──────────────────────────────────────────────────────── */}
        <View style={styles.field}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>FULL NAME</Text>
            <Animated.Text style={[styles.savedText, { opacity: nameTick.opacity }]}>saved</Animated.Text>
          </View>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={fullName}
              onChangeText={setFullName}
              onBlur={handleFullNameBlur}
              placeholder="your name"
              placeholderTextColor={COLORS.secondary}
            />
          </View>
        </View>

        {/* ── Home location ──────────────────────────────────────────────────── */}
        <View style={styles.field}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>HOME LOCATION</Text>
            <Animated.Text style={[styles.savedText, { opacity: locationTick.opacity }]}>saved</Animated.Text>
          </View>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={locationSearch}
              onChangeText={handleLocationChange}
              placeholder={initialProfile?.home_location || 'search places...'}
              placeholderTextColor={COLORS.secondary}
              autoCorrect={false}
            />
          </View>

          {locationResults.length > 0 && !selectedLocation && (
            <View style={styles.results}>
              {locationResults.map((r, i) => (
                <Pressable
                  key={r.place_id ?? i}
                  style={[styles.resultItem, i < locationResults.length - 1 && styles.resultDivider]}
                  onPress={() => handleSelectLocation(r)}
                >
                  <Text style={styles.resultText} numberOfLines={2}>{r.display_name}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {selectedLocation && (
            <>
              <MapView
                style={styles.mapPreview}
                region={{
                  latitude: selectedLocation.latitude,
                  longitude: selectedLocation.longitude,
                  latitudeDelta: 0.08,
                  longitudeDelta: 0.08,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                mapType="mutedStandard"
                showsPointsOfInterest={false}
                showsBuildings={false}
                showsCompass={false}
              >
                <Marker
                  coordinate={{
                    latitude: selectedLocation.latitude,
                    longitude: selectedLocation.longitude,
                  }}
                  pinColor={COLORS.accent}
                />
              </MapView>
              <Pressable style={styles.confirmBtn} onPress={handleConfirmLocation}>
                <Text style={styles.confirmText}>confirm location</Text>
              </Pressable>
            </>
          )}
        </View>

      </ScrollView>

      <PhotoActionSheet
        visible={photoActionSheet}
        hasPhoto={!!avatarUrl}
        onAdd={handleAddPhoto}
        onRemove={handleRemovePhoto}
        onCancel={() => setPhotoActionSheet(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 12,
  },
  headerBtn: {
    width: 32,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  avatarPressable: {
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarInitials: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '600',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  field: {
    marginBottom: 28,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  savedText: {
    color: COLORS.secondary,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  prefix: {
    color: COLORS.secondary,
    fontSize: 15,
    marginRight: 4,
  },
  input: {
    color: COLORS.text,
    fontSize: 15,
    padding: 0,
  },
  statusSlot: {
    width: 22,
    alignItems: 'center',
    marginLeft: 6,
  },
  errorText: {
    color: COLORS.accent,
    fontSize: 12,
    marginTop: 5,
    marginLeft: 2,
  },
  results: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    marginTop: 6,
    overflow: 'hidden',
  },
  resultItem: {
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  resultDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.background,
  },
  resultText: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 18,
  },
  mapPreview: {
    height: 160,
    borderRadius: 10,
    marginTop: 10,
    overflow: 'hidden',
  },
  confirmBtn: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  confirmText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
});

const sheetStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    marginHorizontal: 12,
    marginBottom: 12,
    overflow: 'hidden',
    paddingVertical: 4,
  },
  option: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  optionText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '500',
  },
  divider: {
    height: 0.5,
    backgroundColor: 'rgba(245,241,232,0.08)',
    marginHorizontal: 16,
  },
  gap: {
    height: 8,
    backgroundColor: COLORS.background,
  },
  cancelText: {
    color: COLORS.secondary,
    fontSize: 15,
  },
});
