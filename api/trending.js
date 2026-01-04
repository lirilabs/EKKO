export function trending(contents) {
  const now = Date.now();
  return Object.values(contents)
    .map(c => {
      const ageH = (now - c.createdAt) / 3_600_000;
      return { ...c, score: c.likes * 3 + Math.max(0, 24 - ageH) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}
