/**
 * Pictures of the uniform for the Planner's "What to wear" card: none yet (and no uniform rules in
 * uniform.ts), so the Planner shows no uniform. See schools/khroyals for how they're set up.
 */
import type { ImageSourcePropType } from 'react-native';

export const UNIFORM_IMAGES: Record<'daily' | 'chapel', { boys: ImageSourcePropType | null; girls: ImageSourcePropType | null }> = {
  daily: { boys: null, girls: null },
  chapel: { boys: null, girls: null },
};

export const UNIFORM_STORE = '';
