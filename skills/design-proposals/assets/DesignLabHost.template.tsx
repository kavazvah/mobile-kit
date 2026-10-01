// Design Lab host (mobile-kit): renders design variants as a full-screen overlay above the app's navigator.
// mk-ignore-file (dev tooling: raw values are intentional)
// Mount it once, as the last child of the root layout (<routes>/_layout.tsx). It renders nothing unless the app
// was opened with a /__design-lab/<feature> link. It reads the incoming URL itself (expo-linking), because tab
// navigators (NativeTabs, Tabs) silently drop links to routes that aren't tabs. Works with any root navigator.
// Deep link: <scheme>://__design-lab/<feature>?v=A   (&chrome=0 hides the A/B/C switcher for screenshots)
// Release builds render nothing unless built with EXPO_PUBLIC_DESIGN_LAB=1 (needed for iOS matrix runs).
import { useURL } from 'expo-linking';
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { designLab } from './registry';

const enabled = __DEV__ || process.env.EXPO_PUBLIC_DESIGN_LAB === '1';

type Lab = { feature: string; v?: string; chrome?: string };

/** "scheme://__design-lab/x?v=A" or "exp://host:8081/--/__design-lab/x?v=A" → { feature, v, chrome } */
export function parseLabUrl(url: string | null | undefined): Lab | null {
  if (!url) return null;
  let rest = url.replace(/^[a-z][\w+.-]*:\/\//i, '');
  const expo = rest.indexOf('/--/');
  if (expo >= 0) rest = rest.slice(expo + 3);
  const [pathPart, query = ''] = rest.split('?');
  const m = pathPart.match(/(?:^|\/)__design-lab\/([^/#]+)/);
  if (!m) return null;
  const params: Record<string, string> = {};
  for (const pair of query.split('#')[0].split('&')) {
    const [k, val = ''] = pair.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(val);
  }
  return { feature: decodeURIComponent(m[1]), v: params.v, chrome: params.chrome };
}

export function DesignLabHost() {
  const url = useURL();
  const pathname = usePathname();
  const [lab, setLab] = useState<Lab | null>(null);
  useEffect(() => { if (url) setLab(parseLabUrl(url)); }, [url]);
  // Leaving the lab through in-app navigation (a Stack root can show the lab route itself) closes the overlay.
  useEffect(() => { if (lab && !pathname.startsWith('/__design-lab/')) setLab(null); }, [pathname]);
  if (!enabled || !lab) return null;
  return <DesignLab lab={lab} onSelect={(v) => setLab({ ...lab, v })} />;
}

function DesignLab({ lab, onSelect }: { lab: Lab; onSelect: (v: string) => void }) {
  const { feature, v, chrome } = lab;
  const variants = designLab[feature] ?? {};
  const names = Object.keys(variants).sort();
  const current = v && variants[v] ? v : names[0];
  const Variant = current ? variants[current] : null;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', zIndex: 1000, elevation: 1000 }]}>
      {Variant ? (
        <Variant />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text accessibilityRole="header">Design Lab</Text>
          <Text>No variants for "{feature}". Features: {Object.keys(designLab).join(', ') || 'none'}</Text>
        </View>
      )}
      {chrome !== '0' && names.length > 1 ? (
        <View
          accessibilityRole="tablist"
          style={{ position: 'absolute', bottom: 32, alignSelf: 'center', flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.75)' }}>
          {names.map((name) => (
            <Pressable
              key={name}
              accessibilityRole="tab"
              accessibilityState={{ selected: name === current }}
              accessibilityLabel={`Variant ${name}`}
              onPress={() => onSelect(name)}
              style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: name === current ? '#fff' : 'transparent' }}>
              <Text style={{ color: name === current ? '#000' : '#fff', fontWeight: '600' }}>{name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
