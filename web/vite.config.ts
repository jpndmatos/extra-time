import { defineConfig, loadEnv } from "vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (env.VITE_API_URL) {
    const url = new URL(env.VITE_API_URL);
    if (
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        )) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error(
        "VITE_API_URL must be an HTTPS API origin without credentials, paths or query parameters.",
      );
  }
  return {
    base: env.PAGES_BASE_PATH || "./",
    server: { proxy: { "/api": "http://127.0.0.1:5195" } },
  };
});
