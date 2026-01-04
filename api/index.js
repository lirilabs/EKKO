export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  const { action } = req.query;

  if (action === "ping") {
    return res.status(200).json({
      ok: true,
      pong: Date.now()
    });
  }

  return res.status(200).json({
    ok: false,
    message: "Unknown action"
  });
}
