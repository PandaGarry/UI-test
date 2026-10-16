const {execSync} = require("child_process");
const path = require("path");
const {defineConfig} = require("vite");
const {sourceTransformPlugin, uiPlugin} = require("./scripts/vite-plugins");

// Some hosts do not provide a .git directory: fall back to "dev" instead of crashing the build.
const clientHash = (() => {
	try {
		return execSync("git describe --always --long --tags --abbrev=10 --dirty --broken").toString().replace(/\n/g, "");
	} catch {
		return "dev";
	}
})();

module.exports = defineConfig({
	plugins: [sourceTransformPlugin(), uiPlugin()],
	define: {
		"process.env.BUILD_CLIENT_HASH": JSON.stringify(clientHash),
		// Default to the local game server (see ../server). Override with the GAME_SERVER env variable.
		"process.env.BUILD_GAME_SERVER": JSON.stringify(process.env.GAME_SERVER || "http://localhost:10364"),
	},
	publicDir: false,
	build: {
		outDir: "out",
		emptyOutDir: true,
		sourcemap: true,
		chunkSizeWarningLimit: 2000, // intentionally a single bundle (see codeSplitting below)
		rollupOptions: {
			output: {codeSplitting: false}, // one bundle, UI modules are loaded in order
		},
	},
	server: {
		// Cloud IDEs / containers (Replit): bind on all interfaces, honour the injected PORT, allow external hosts.
		host: "0.0.0.0",
		port: process.env.PORT ? Number(process.env.PORT) : 8080,
		strictPort: true,
		allowedHosts: true,
		// The linked simulation package lives in ../packages/core: allow dev serving from the repository root.
		fs: {allow: [path.resolve(__dirname, "..")]},
		proxy: {
			"/api/v1": {
				target: process.env.API_SERVER || "http://localhost:13527",
				changeOrigin: true,
			},
		},
	},
	preview: {
		host: "0.0.0.0",
		port: process.env.PORT ? Number(process.env.PORT) : 8080,
		allowedHosts: true,
	},
});
