export function zoneInfo(zone = 37) {
  if (!Number.isInteger(zone) || zone < 25 || zone > 45)
    throw new Error("三度带号须为 25～45 的整数。");
  return { zone, epsg: 4488 + zone, centralMeridian: zone * 3 };
}

export function prefixX(x: number, zone = 37) {
  zoneInfo(zone);
  if (!Number.isFinite(x)) throw new Error("X 坐标必须是有限数值。");
  if (x < 1e7) return x + zone * 1e6;
  const source = Math.floor(x / 1e6);
  if (source !== zone)
    throw new Error(
      `输入坐标已有 ${source} 带号，与所选 ${zone} 带不符；请先完成实际投影转换。`,
    );
  return x;
}
