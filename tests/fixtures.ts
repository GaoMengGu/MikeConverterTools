export function dxf(
  polygons: {
    layer: string;
    xy: number[][];
    closed?: boolean;
    bulge?: number;
  }[],
) {
  let text = "0\nSECTION\n2\nENTITIES\n";
  for (const p of polygons) {
    text += `0\nPOLYLINE\n8\n${p.layer}\n70\n${p.closed === false ? 0 : 1}\n`;
    for (const [x, y] of p.xy) {
      text += `0\nVERTEX\n8\n${p.layer}\n10\n${x}\n20\n${y}\n30\n0\n`;
      if (p.bulge) text += `42\n${p.bulge}\n`;
    }
    text += "0\nSEQEND\n";
  }
  return text + "0\nENDSEC\n0\nEOF\n";
}

export const square = [
  [359000, 2091000],
  [359010, 2091000],
  [359010, 2091010],
  [359000, 2091010],
];
export const road = { layer: "ROAD", xy: square };
export const boundaryDxf = dxf([road]);
