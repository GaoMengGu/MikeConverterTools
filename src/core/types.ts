export type Point = [number, number, number];
export type XY = [number, number];
export type Mode = "boundary" | "points" | "assign";
export interface Options {
  zone?: number;
  name?: string;
  minZ?: number;
  columns?: [number, number, number];
  boundaryId?: string;
  spacing?: number;
  progress?: (percent: number, message: string) => void;
}
export interface Polyline {
  id: string;
  layer: string;
  closed: boolean;
  vertices: Point[];
  hasBulge: boolean;
  unsupported?: string;
}
export interface Issue {
  line: number;
  reason: string;
}
export interface Stats {
  points: number;
  input: number;
  skipped: number;
  filtered: number;
  zone: number;
  epsg: number;
  centralMeridian: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin?: number;
  zMax?: number;
  layer?: string;
  rows?: number;
  matched?: number;
  unmatched?: number;
  hits?: Record<string, number>;
  defaultValue?: number;
}
export interface Preview {
  points: Point[];
  lines: { layer: string; points: XY[] }[];
  sampled: boolean;
}
export interface ConversionResult {
  content: string;
  filename: string;
  stats: Stats;
  warnings: string[];
  issues: Issue[];
  preview: Preview;
}
