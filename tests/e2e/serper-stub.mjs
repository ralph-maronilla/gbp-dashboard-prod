// A stand-in for google.serper.dev: three reviews for any place, one page. Records the calls it gets so tests can check them.
import http from "node:http";

const port = Number(process.env.SERPER_STUB_PORT ?? 4010);
const calls = [];

const template = [
  { id: "stub-r1", rating: 5, isoDate: new Date(Date.now() - 2 * 86400_000).toISOString(), snippet: "Great doctor and very caring staff.", user: { name: "Ana Reyes", link: "https://www.google.com/maps/contrib/1" }, response: { snippet: "Thank you!", date: "a day ago" } },
  { id: "stub-r2", rating: 2, isoDate: new Date(Date.now() - 5 * 86400_000).toISOString(), snippet: "Long waiting time, we waited two hours.", user: { name: "Ben dela Cruz", link: "https://www.google.com/maps/contrib/2" } },
  { id: "stub-r3", rating: 4, isoDate: new Date(Date.now() - 9 * 86400_000).toISOString(), snippet: "Clean facilities.", user: { name: "Cora S. Lim" } },
];
// Review ids are unique per place (the database keeps one row per Google review id).
const reviewsFor = (cid) => template.map((r) => ({ ...r, id: `${r.id}-${cid}` }));

http
  .createServer((req, res) => {
    const json = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && req.url === "/health") return json(200, { ok: true });
    if (req.method === "GET" && req.url === "/calls") return json(200, calls);
    if (req.method === "DELETE" && req.url === "/calls") return calls.splice(0), json(200, { ok: true });
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      calls.push({ path: req.url, key: req.headers["x-api-key"], body });
      if (req.url === "/reviews") return json(200, { reviews: reviewsFor(body.cid ?? body.placeId ?? "x"), nextPageToken: "", credits: 1 });
      if (req.url === "/maps") return json(200, { places: [{ title: "Stub Place", address: "1 Stub St, Manila", rating: 4.5, ratingCount: 120, type: "Clinic", cid: body.cid }], credits: 3 });
      return json(404, { message: "not found" });
    });
  })
  .listen(port, "127.0.0.1", () => console.log(`serper stub on ${port}`));
