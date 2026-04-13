import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { COLORS } from './constants';
import { supabase } from './supabase';

const ADELAIDE = {
  latitude: -34.9285,
  longitude: 138.6007,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function MapScreen() {
  const [clips, setClips] = useState([]);

  useEffect(() => {
    const fetchClips = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) throw userError ?? new Error('No user');

        const { data, error } = await supabase
          .from('clips')
          .select('*')
          .eq('user_id', user.id);
        if (error) throw error;

        const located = data.filter(c => c.latitude != null && c.longitude != null);
        console.log('Clips fetched:', located.length, 'with GPS coordinates');
        setClips(located);
      } catch (err) {
        console.error('Failed to fetch clips for map:', err.message);
      }
    };

    fetchClips();
  }, []);

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
        {clips.map(clip => (
          <Marker
            key={clip.id}
            coordinate={{ latitude: clip.latitude, longitude: clip.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.dot} />
          </Marker>
        ))}
      </MapView>

      <View style={styles.profileCard}>
        <Text style={styles.name}>Jesse Royans</Text>
        <Text style={styles.location}>Adelaide, Australia</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
  },
  profileCard: {
    position: 'absolute',
    top: 52,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(31,31,31,0.92)',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#333330',
    padding: 12,
    paddingHorizontal: 16,
  },
  name: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '500',
  },
  location: {
    color: COLORS.secondary,
    fontSize: 12,
    marginTop: 2,
  },
});
