export function computeTrending(contents) {
  const now = Date.now();

  return Object.values(contents)
    .map(c => {
      const ageHours = (now - c.createdAt) / 3_600_000;
      const score = c.likes * 3 + Math.max(0, 24 - ageHours);
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}
