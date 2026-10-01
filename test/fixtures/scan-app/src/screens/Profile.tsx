import { StyleSheet, Text, View } from 'react-native';
import { space } from '../theme/tokens';

// Not a style: padding: 30 in a comment must be ignored.
const config = { padding: 99, label: "padding: 30" };

export function Profile() {
  return (
    <View style={[styles.card, { marginLeft: 6 }]}>
      <Text>Don't break the scanner</Text>
      <View style={{ paddingHorizontal: 20, padding: space.md, flex: 2 }} />
      <View contentContainerStyle={{ paddingBottom: 40 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    margin: 0,
    gap: 1,
    borderRadius: 12,
    borderTopLeftRadius: 7,
    fontSize: 15,
    marginTop: -8,
    width: 100,
    top: 10 * 2,
    color: '#FFF',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 24, // mk-ignore
    // mk-ignore-next-line
    marginBottom: 20,
  },
});
