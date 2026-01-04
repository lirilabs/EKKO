export function getGitHub(env) {
  if (!env.github.token) return null;

  return {
    api: "https://api.github.com",
    path: "data/db.enc.json",
    ...env.github
  };
}

export async function ghRequest(gh, url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${gh.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
