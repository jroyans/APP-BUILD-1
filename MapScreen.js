import { StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-maps';
import { COLORS } from './constants';

const ADELAIDE = {
  latitude: -34.9285,
  longitude: 138.6007,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function MapScreen() {
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
      />

      <View style={styles.profileCard}>
        <Text style={styles.name}>Jesse Royans</Text>
        <Text style={styles.location}>Adelaide, Australia</Text>
      </View>
    </View>
  );
}

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
