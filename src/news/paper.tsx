/**
 * The newsletter's look, shared by an issue (IssueView) and the Planner's button (RoyalNewsCard): white paper with
 * ruled lines, and the masthead's brush script in the newsletter's accent (theme.newsletter).
 */
import { Platform, View, type TextStyle } from 'react-native';
import { useFonts, KaushanScript_400Regular } from '@expo-google-fonts/kaushan-script';
import { SCHOOL } from '../school';

export const NEWS = SCHOOL.theme.newsletter;
/** The paper's ruled lines, this far apart. */
export const RULE = 26;
export const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' });

/** Ruled lines filling their parent (which sets the height), behind what's written on it. */
export function RuledLines({ height }: { height: number }) {
  const lines = Math.max(0, Math.floor(height / RULE));
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {Array.from({ length: lines }, (_, i) => (
        <View key={i} style={{ position: 'absolute', left: 0, right: 0, height: 1, top: (i + 1) * RULE, backgroundColor: '#E6E8EB' }} />
      ))}
    </View>
  );
}

/** The masthead's font: the brush script once it has loaded, a heavy italic until then. */
export function useMastheadFont(): TextStyle {
  const [loaded] = useFonts({ KaushanScript_400Regular });
  return loaded ? { fontFamily: 'KaushanScript_400Regular' } : { fontStyle: 'italic', fontWeight: '800' };
}
