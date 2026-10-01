// Design Lab route (mobile-kit). It only makes <scheme>://__design-lab/<feature> a valid URL.
// The variants are drawn by <DesignLabHost /> in the root layout, as an overlay, because tab navigators
// (NativeTabs, Tabs) don't display routes that aren't tabs.
import { Redirect } from 'expo-router';
import { View } from 'react-native';

const enabled = __DEV__ || process.env.EXPO_PUBLIC_DESIGN_LAB === '1';

export default function DesignLabRoute() {
  if (!enabled) return <Redirect href="/" />;
  return <View style={{ flex: 1 }} />;
}
