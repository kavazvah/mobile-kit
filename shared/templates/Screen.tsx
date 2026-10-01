// The one component that owns safe-area insets. Every route renders inside it.
// If a navigator header or tab bar already handles an edge, leave that edge out of `edges`.
import type { ReactNode } from 'react';
import { ScrollView, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, space } from '{{tokensImport}}';

type Edge = 'top' | 'bottom';

export function Screen({
  children,
  scroll = false,
  edges = ['top', 'bottom'],
}: {
  children: ReactNode;
  /** Use for any screen that might not fit at 2.0× font scale. */
  scroll?: boolean;
  edges?: readonly Edge[];
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pad = width >= 600 ? space.xl : layout.screenPadding;
  const style: ViewStyle = {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingHorizontal: pad,
    paddingBottom: (edges.includes('bottom') ? insets.bottom : 0) + space.lg,
  };
  const inner = (
    <View style={{ width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', flex: scroll ? undefined : 1 }}>
      {children}
    </View>
  );
  return scroll ? (
    <ScrollView contentContainerStyle={style} keyboardShouldPersistTaps="handled">
      {inner}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, style]}>{inner}</View>
  );
}
