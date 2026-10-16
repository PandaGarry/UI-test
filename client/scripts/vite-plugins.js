const fs = require("fs");
const path = require("path");
const {readStaticElements, buildCss} = require("./ui-assets");
const mapLoader = require("./map-loader");
const themeLoader = require("./theme-loader");
const shaderLoader = require("./shader-loader");

const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "src");

/**
 * The UI modules are listed explicitly in src/app/ui-modules.json (single source of truth).
 * The build fails if a listed file is missing, if a listed path is duplicated, or if a file
 * still carries a legacy `// @module` marker, so no module can be wired in silently.
 */
function readUiModuleList() {
	const manifestPath = path.join(srcDir, "app", "ui-modules.json");
	const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
	const seen = new Set();
	for (const m of manifest.modules) {
		if (seen.has(m.path)) throw new Error(`ui-modules.json: duplicate module ${m.path}`);
		seen.add(m.path);
		const file = path.join(srcDir, m.path.replace(/^\.\//, "") + ".ts");
		if (!fs.existsSync(file)) throw new Error(`ui-modules.json: missing file ${file}`);
	}
	const legacy = [];
	const walk = dir => {
		for (const f of fs.readdirSync(dir)) {
			const p = path.join(dir, f);
			if (fs.statSync(p).isDirectory()) walk(p);
			else if (f.endsWith(".ts") && /^\/\/[^\S\r\n]*@module /m.test(fs.readFileSync(p, "utf8"))) legacy.push(p);
		}
	};
	walk(srcDir);
	if (legacy.length) throw new Error(`Legacy @module markers found (remove them, use ui-modules.json): ${legacy.join(", ")}`);
	return manifest.modules.map(m => ({path: m.path, priority: 0}));
}

/** Generates the body of src/main.ts: UI modules run sequentially after the window load event. */
function generateUiLoader() {
	const modules = readUiModuleList();
	return `window.addEventListener("load", async () => {\n${modules.map(m => `\tawait import(${JSON.stringify(m.path)});`).join("\n")}\n});`;
}

/**
 * Build-time source transforms that the webpack loaders used to perform:
 * map registry (embedded default maps), theme registry, shader inlining.
 */
const sourceTransforms = {
	"src/map/MapRegistry.ts": mapLoader,
	"src/renderer/GameTheme.ts": themeLoader,
	"src/renderer/shader/ShaderManager.ts": shaderLoader,
};

function sourceTransformPlugin() {
	return {
		name: "frontline-source-transforms",
		enforce: "pre",
		async transform(code, id) {
			const rel = path.relative(root, id).replace(/\\/g, "/");
			const loader = sourceTransforms[rel];
			if (!loader) return null;
			return {code: await loader(code), map: null};
		}
	};
}

function uiPlugin() {
	const entry = path.join(srcDir, "main.ts");
	return {
		name: "frontline-ui",
		enforce: "pre",
		load(id) {
			if (path.resolve(id) !== entry) return null;
			return fs.readFileSync(entry, "utf8").replace("// BUILD_UI_MODULES_LOADER", generateUiLoader());
		},
		transformIndexHtml: {
			order: "post",
			handler(html) {
				const divs = readStaticElements().map(e =>
					`<div id="${e.id}" style="display: none">${e.html}</div>`).join("");
				return html
					.replace("</head>", `<style type="text/css">${buildCss()}</style></head>`)
					.replace("</body>", `${divs}</body>`);
			}
		},
		configureServer(server) {
			// Dev-only: edits to data files re-run the matching build-time transform.
			const goals = [
				[/resources[\\/]defaultMaps\.txt$|resources[\\/]maps[\\/]/, "src/map/MapRegistry.ts"],
				[/resources[\\/]themes[\\/]|src[\\/]ui[\\/]element[\\/]static[\\/]/, "src/renderer/GameTheme.ts"],
				[/src[\\/]renderer[\\/]shader[\\/]/, "src/renderer/shader/ShaderManager.ts"],
			];
			for (const dir of ["resources", "src/ui/element/static", "src/renderer/shader"]) {
				server.watcher.add(path.join(root, dir));
			}
			server.watcher.on("change", file => {
				const rel = path.relative(root, file);
				for (const [pattern, target] of goals) {
					if (!pattern.test(rel)) continue;
					const mod = server.moduleGraph.getModuleById(path.join(root, target));
					if (mod) server.moduleGraph.invalidateModule(mod);
					server.ws.send({type: "full-reload"});
					return;
				}
			});
		}
	};
}

module.exports = {sourceTransformPlugin, uiPlugin};
