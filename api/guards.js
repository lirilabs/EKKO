const hits = new Map();

export function rateLimit(ip, limit) {
  const now = Date.now();
  const rec = hits.get(ip) || { count: 0, time: now };

  if (now - rec.time > 60_000) {
    hits.set(ip, { count: 1, time: now });
    return true;
  }

  rec.count++;
  hits.set(ip, rec);
  return rec.count <= limit;
}
