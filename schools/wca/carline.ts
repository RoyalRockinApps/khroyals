/**
 * Westminster's car line traffic flow: none yet. Once the school shares its map, add the lines
 * and rules here and the picture in carlineMap.ts (see schools/khroyals). No app imports, so tests run it.
 */
export type PickupLine = string;

export const LINES: Record<string, { name: string; line: string; entrance: string; color: string }> = {};

export const lineFor = (_grade: number | null | undefined): PickupLine | null => null;

export const familyLines = (_grades: (number | null | undefined)[]): PickupLine[] => [];

export const TRAFFIC_RULES: string[] = [];

export const TRAFFIC_HINT = '';
