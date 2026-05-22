import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: "#0d0f12",
        panel: "#14181d",
        edge: "#232830",
        bitcoin: "#f7931a",
        up: "#16c784",
        down: "#ea3943",
        ink: "#e6e8eb",
        muted: "#8a8f99",
        faint: "#6b7280",
      },
    },
  },
  plugins: [],
};

export default config;
