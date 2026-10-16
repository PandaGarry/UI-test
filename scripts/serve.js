// Tiny zero-dependency static server for the production build (client/out).
// Usage: `node scripts/serve.js` (or `npm start` from the repo root)
// Runtime assets (fonts, maps, textures, themes) live in client/resources and are not part of the bundle
// (vite publicDir is off), so /resources/* is served from there, the same way the dev server does.
const http = require("http");
const fs = require("fs");
const path = require("path");

const clientDir = path.join(__dirname, "..", "client");
const outRoot = path.join(clientDir, "out");
const resourcesRoot = path.join(clientDir, "resources");
const port = process.env.PORT ? Number(process.env.PORT) : 8080;
const types = {
	".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
	".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
	".txt": "text/plain", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".map": "application/json",
};

http.createServer((req, res) => {
	const url = new URL(req.url, "http://localhost");
	const pathname = decodeURIComponent(url.pathname);
	const isResource = pathname.startsWith("/resources/");
	const root = isResource ? clientDir : outRoot;
	let file = path.join(root, pathname);
	if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
	if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
		if (isResource) { res.writeHead(404); return res.end(); } // missing asset: report it, do not send HTML
		file = path.join(outRoot, "index.html"); // SPA fallback
	}
	res.writeHead(200, {"Content-Type": types[path.extname(file)] || "application/octet-stream"});
	fs.createReadStream(file).pipe(res);
}).listen(port, "0.0.0.0", () => console.log(`Serving client/out and client/resources on http://0.0.0.0:${port}`));
