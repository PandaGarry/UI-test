// Tiny zero-dependency static server for the production build (client/out).
// Usage: `node scripts/serve.js` (or `npm start` from the repo root)
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "client", "out");
const port = process.env.PORT ? Number(process.env.PORT) : 8080;
const types = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".map": "application/json"};

http.createServer((req, res) => {
	const url = new URL(req.url, "http://localhost");
	let file = path.join(root, decodeURIComponent(url.pathname));
	if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
	if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html"); // SPA fallback
	res.writeHead(200, {"Content-Type": types[path.extname(file)] || "application/octet-stream"});
	fs.createReadStream(file).pipe(res);
}).listen(port, "0.0.0.0", () => console.log(`Serving client/out on http://0.0.0.0:${port}`));
