import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API from `devdash serve` runs on 8765; /api calls are forwarded there in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8765" },
  },
});
