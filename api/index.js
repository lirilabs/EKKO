export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  return res.status(200).json({
    ok: true,
    message: "EKKO API is alive"
  });
}
