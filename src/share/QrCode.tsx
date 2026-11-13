import { useMemo } from 'react';
import { Image, View, type ImageSourcePropType } from 'react-native';
import { qrRows } from './qr';

/** How much of the code's width a logo in the middle may cover (well within what high error correction recovers). */
export const LOGO_SHARE = 0.24;

/**
 * A QR code about `size` points wide, dark on white with the standard quiet zone around it. With `logo`, the code is
 * encoded with high error correction and the logo sits in the middle on a white patch.
 */
export function QrCode({ value, size = 240, label, color = '#000', logo }: {
  value: string; size?: number; label?: string; color?: string; logo?: ImageSourcePropType;
}) {
  const { size: modules, rows } = useMemo(() => qrRows(value, logo ? 'H' : 'M'), [value, logo]);
  const QUIET = 4;  // modules of white border scanners expect
  const cell = Math.max(1, Math.floor(size / (modules + QUIET * 2)));  // whole points keep edges crisp
  const patch = Math.round((modules * cell * LOGO_SHARE) / cell) * cell;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label ?? `QR code for ${value}`}
      style={{ backgroundColor: '#fff', padding: cell * QUIET, borderRadius: 12 }}>
      {rows.map((runs, r) => (
        <View key={r} style={{ flexDirection: 'row', height: cell }}>
          {runs.map((run, i) => (
            <View key={i} style={{ width: run.length * cell, backgroundColor: run.dark ? color : '#fff' }} />
          ))}
        </View>
      ))}
      {!!logo && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: patch, height: patch, borderRadius: patch / 2, backgroundColor: '#fff', padding: cell, alignItems: 'center', justifyContent: 'center' }}>
            <Image source={logo} style={{ width: patch - cell * 2, height: patch - cell * 2, borderRadius: (patch - cell * 2) / 2 }} resizeMode="contain" />
          </View>
        </View>
      )}
    </View>
  );
}
