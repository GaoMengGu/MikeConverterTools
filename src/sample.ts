const xy = [
  [359000, 2091000],
  [359045, 2091004],
  [359073, 2091028],
  [359065, 2091063],
  [359032, 2091075],
  [359003, 2091050],
];
export const sampleDxf =
  "0\nSECTION\n2\nENTITIES\n0\nPOLYLINE\n8\nSITE\n70\n1\n" +
  xy.map(([x, y]) => `0\nVERTEX\n10\n${x}\n20\n${y}\n30\n0\n`).join("") +
  "0\nSEQEND\n0\nENDSEC\n0\nEOF\n";
export const samplePoints = Array.from({ length: 20 }, (_, i) =>
  Array.from(
    { length: 20 },
    (_, j) =>
      `${359000 + i * 4} ${2091000 + j * 4} ${(695 + i * 0.25 + j * 0.15).toFixed(3)}`,
  ).join("\n"),
).join("\n");
export const sampleValues = "SITE 60\nBACKGROUND 12.5\n";
