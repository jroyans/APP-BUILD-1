import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { supabase } from '../../supabase';

const SCREEN_HEIGHT = Dimensions.get('window').height;

const C = {
  bg:       '#F5F1E8',
  accent:   '#C86A4A',
  brown:    '#7A5C4D',
  charcoal: '#1F1F1F',
  inputBg:  'rgba(122,92,77,0.08)',
  error:    '#C04040',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatLocationName(result) {
  const a = result.address || {};
  const city = a.city || a.town || a.village || a.municipality || a.county || '';
  const state = a.state || '';
  const country = a.country || '';
  return [city, state, country].filter(Boolean).join(', ') || result.display_name;
}

// ─── Shared components ────────────────────────────────────────────────────────

function BackButton({ onPress }) {
  return (
    <Pressable onPress={onPress} hitSlop={14}>
      <Ionicons name="arrow-back" size={22} color={C.charcoal} />
    </Pressable>
  );
}

function TopBar({ step, showBack, onBack, insets }) {
  return (
    <View style={[ss.topRow, { paddingTop: insets.top + 16 }]}>
      <View style={ss.topSide}>
        {showBack && <BackButton onPress={onBack} />}
      </View>
      <View style={ss.topCentre}>
        <Text style={ss.wordmark}>avyda</Text>
        <Text style={ss.progress}>{step} of 3</Text>
      </View>
      <View style={ss.topSide} />
    </View>
  );
}

// ─── SetupIntroScreen (pre-existing) ─────────────────────────────────────────

export function SetupIntroScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={ss.screen}>
      <View style={[ss.oldTopRow, { paddingTop: insets.top + 16 }]}>
        <Text style={ss.wordmark}>avyda</Text>
      </View>
      <View style={ss.mid}>
        <Text style={ss.placeholder}>Setup stage coming soon</Text>
      </View>
    </View>
  );
}

// ─── Screen 13 — NameScreen ───────────────────────────────────────────────────

export function NameScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const canContinue = name.trim().length > 0;

  async function handleContinue() {
    if (!canContinue) return;
    setSaving(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No session');
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ full_name: name.trim() })
        .eq('id', user.id);
      if (dbError) throw dbError;
      navigation.navigate('AvatarScreen');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={ss.screen}>
      <TopBar step={1} showBack={false} insets={insets} />

      <View style={ss.content}>
        <Text style={ss.heading}>What's your name?</Text>
        <TextInput
          style={ss.input}
          value={name}
          onChangeText={v => { setName(v); setError(null); }}
          placeholder="Your full name"
          placeholderTextColor="rgba(122,92,77,0.4)"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleContinue}
        />
        {error ? <Text style={ss.errorText}>{error}</Text> : null}
      </View>

      <View style={[ss.footer, { paddingBottom: Math.max(insets.bottom, 32) }]}>
        <Pressable
          style={[ss.btn, !canContinue && ss.btnDisabled]}
          onPress={handleContinue}
          disabled={!canContinue || saving}
        >
          {saving
            ? <ActivityIndicator color={C.bg} size="small" />
            : <Text style={ss.btnText}>Continue</Text>
          }
        </Pressable>
      </View>
    </View>
  );
}

// ─── Screen 14 — AvatarScreen ─────────────────────────────────────────────────

export function AvatarScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [avatarUri, setAvatarUri] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function pickFromLibrary() {
    setError(null);
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled) setAvatarUri(result.assets[0].uri);
  }

  async function takePhoto() {
    setError(null);
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) return;
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled) setAvatarUri(result.assets[0].uri);
  }

  async function handleContinue() {
    if (!avatarUri) {
      navigation.navigate('HomeLocationScreen');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No session');

      const base64 = await FileSystemLegacy.readAsStringAsync(avatarUri, { encoding: 'base64' });
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const path = `${user.id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, bytes.buffer, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const urlWithBust = `${publicUrl}?t=${Date.now()}`;
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ avatar_url: urlWithBust })
        .eq('id', user.id);
      if (dbError) throw dbError;

      navigation.navigate('HomeLocationScreen');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={ss.screen}>
      <TopBar step={2} showBack onBack={() => navigation.goBack()} insets={insets} />

      <View style={ss.content}>
        <Text style={ss.heading}>Put a face to the name.</Text>

        <View style={ss.avatarWrap}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={ss.avatarImage} />
          ) : (
            <View style={ss.avatarPlaceholder}>
              <Text style={ss.avatarPlus}>+</Text>
            </View>
          )}
        </View>

        <View style={ss.photoButtons}>
          <Pressable style={ss.outlineBtn} onPress={takePhoto}>
            <Text style={ss.outlineBtnText}>Take photo</Text>
          </Pressable>
          <Pressable style={ss.outlineBtn} onPress={pickFromLibrary}>
            <Text style={ss.outlineBtnText}>Choose from library</Text>
          </Pressable>
        </View>

        {error ? <Text style={[ss.errorText, { marginTop: 12, textAlign: 'center' }]}>{error}</Text> : null}
      </View>

      <View style={[ss.footer, { paddingBottom: Math.max(insets.bottom, 32) }]}>
        <Pressable
          style={{ alignSelf: 'center', marginBottom: 14 }}
          onPress={() => navigation.navigate('HomeLocationScreen')}
        >
          <Text style={ss.skipText}>Skip for now</Text>
        </Pressable>
        <Pressable
          style={[ss.btn, uploading && ss.btnDisabled]}
          onPress={handleContinue}
          disabled={uploading}
        >
          {uploading
            ? <ActivityIndicator color={C.bg} size="small" />
            : <Text style={ss.btnText}>Continue</Text>
          }
        </Pressable>
      </View>
    </View>
  );
}

// ─── Screen 15 — HomeLocationScreen ──────────────────────────────────────────

export function HomeLocationScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [locationText, setLocationText] = useState('');
  const [resolving, setResolving] = useState(true);
  const [manualMode, setManualMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function resolveLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setManualMode(true);
          setResolving(false);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude, longitude } = pos.coords;
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
          { headers: { 'User-Agent': 'VoraApp/1.0', 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        setLocationText(formatLocationName(data));
        setResolving(false);
      } catch {
        setManualMode(true);
        setResolving(false);
      }
    }
    resolveLocation();
  }, []);

  async function handleSave() {
    const loc = locationText.trim();
    if (!loc) return;
    setSaving(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No session');
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ home_location: loc, onboarded: true })
        .eq('id', user.id);
      if (dbError) throw dbError;
      navigation.navigate('HabitCameraScreen');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const canSave = !resolving && locationText.trim().length > 0;

  return (
    <View style={ss.screen}>
      <TopBar step={3} showBack onBack={() => navigation.goBack()} insets={insets} />

      <View style={ss.content}>
        <Text style={ss.heading}>Where do you call home?</Text>
        <Text style={ss.subtext}>
          This anchors your map. Moments near home feel close, moments far away feel far.
        </Text>

        {resolving ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 32 }} />
        ) : manualMode ? (
          <TextInput
            style={[ss.input, { marginTop: 24 }]}
            value={locationText}
            onChangeText={v => { setLocationText(v); setError(null); }}
            placeholder="Your home city"
            placeholderTextColor="rgba(122,92,77,0.4)"
            autoFocus
            returnKeyType="done"
          />
        ) : (
          <View style={ss.pillWrap}>
            <View style={ss.locationPill}>
              <Text style={ss.pillText}>{locationText}</Text>
            </View>
            <Text style={ss.settingsNote}>Not right? Update it later in settings.</Text>
          </View>
        )}

        {error ? <Text style={[ss.errorText, { marginTop: 12, textAlign: 'center' }]}>{error}</Text> : null}
      </View>

      <View style={[ss.footer, { paddingBottom: Math.max(insets.bottom, 32) }]}>
        <Pressable
          style={[ss.btn, !canSave && ss.btnDisabled]}
          onPress={handleSave}
          disabled={!canSave || saving}
        >
          {saving
            ? <ActivityIndicator color={C.bg} size="small" />
            : <Text style={ss.btnText}>That's home</Text>
          }
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // ── Top bar ──
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  topSide: {
    width: 40,
    paddingTop: 2,
  },
  topCentre: {
    alignItems: 'center',
  },
  wordmark: {
    fontSize: 16,
    fontWeight: '500',
    color: C.accent,
    letterSpacing: 1,
  },
  progress: {
    color: C.accent,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginTop: 8,
  },

  // ── Content ──
  content: {
    paddingHorizontal: 24,
    paddingTop: SCREEN_HEIGHT * 0.22,
  },
  heading: {
    fontSize: 26,
    fontWeight: '500',
    color: C.charcoal,
  },
  subtext: {
    color: C.brown,
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
  },
  input: {
    backgroundColor: C.inputBg,
    color: C.charcoal,
    fontSize: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 20,
  },
  errorText: {
    color: C.error,
    fontSize: 12,
    marginTop: 8,
  },

  // ── Avatar ──
  avatarWrap: {
    marginTop: 24,
    alignSelf: 'center',
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(122,92,77,0.12)',
    borderWidth: 2,
    borderColor: 'rgba(200,106,74,0.4)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlus: {
    color: C.accent,
    fontSize: 28,
    fontWeight: '400',
    lineHeight: 32,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    justifyContent: 'center',
  },
  outlineBtn: {
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  outlineBtnText: {
    color: C.accent,
    fontSize: 13,
    fontWeight: '500',
  },
  skipText: {
    color: C.brown,
    fontSize: 13,
    fontWeight: '400',
  },

  // ── Location pill ──
  pillWrap: {
    marginTop: 24,
    alignItems: 'center',
  },
  locationPill: {
    backgroundColor: 'rgba(200,106,74,0.1)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  pillText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '500',
  },
  settingsNote: {
    color: C.brown,
    fontSize: 11,
    opacity: 0.6,
    marginTop: 10,
  },

  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: C.bg,
  },
  btn: {
    backgroundColor: C.accent,
    borderRadius: 24,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    color: C.bg,
    fontSize: 16,
    fontWeight: '500',
  },

  // ── SetupIntroScreen legacy ──
  oldTopRow: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  mid: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    color: C.brown,
    fontSize: 16,
    fontWeight: '400',
  },
});
