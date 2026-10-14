const fs = require("fs");
const path = require("path");
const {readStaticElements, buildCss} = require("./ui-assets");
const mapLoader = require("./map-loader");
const themeLoader = require("./theme-loader");
const shaderLoader = require("./shader-loader");

const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "src");

/** Collects every src/**.ts file that declares `// @module <name> [priority]`. */
function findModules(dir) {
	const modules = [];
	for (const file of fs.readdirSync(dir)) {
		const filePath = path.join(dir, file);
		if (fs.statSync(filePath).isDirectory()) {
			modules.push(...findModules(filePath));
		} else if (file.endsWith(".ts")) {
			const match = fs.readFileSync(filePath, "utf8").match(/\/\/[^\S\r\n]*@module (.+)(?: (-?\d+))?/);
			if (!match) continue;
			modules.push({path: "./" + path.relative(srcDir, filePath).replace(/\\/g, "/").replace(/\.ts$/, ""), priority: match[2] || 0});
		}
	}
	return modules;
}

/** Generates the body of src/main.ts: UI modules run sequentially after the window load event. */
function generateUiLoader() {
	const modules = findModules(srcDir).sort((a, b) => b.priority - a.priority);
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
