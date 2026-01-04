export function getTrending(contents) {
  return Object.values(contents)
    .sort((a, b) => {
      const scoreA = a.likes * 2 + (Date.now() - a.createdAt) / 1e6;
      const scoreB = b.likes * 2 + (Date.now() - b.createdAt) / 1e6;
      return scoreB - scoreA;
    })
    .slice(0, 20);
}
