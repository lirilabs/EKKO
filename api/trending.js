export function getTrending(contents) {
  return Object.values(contents)
    .sort((a,b) =>
      (b.likes * 2 + (Date.now()-b.createdAt)/1e6) -
      (a.likes * 2 + (Date.now()-a.createdAt)/1e6)
    )
    .slice(0, 20);
}
