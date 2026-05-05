/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Poppins", "sans-serif"],
      },
      colors: {
        panel: "#0b1830",
        panelSoft: "#111f3a",
        accent: "#17a8ff",
        safe: "#17d763",
        danger: "#ff4a3d",
      },
      boxShadow: {
        neon: "0 0 0 1px rgba(23,168,255,0.25), 0 20px 45px rgba(2, 9, 25, 0.45)",
      },
    },
  },
  plugins: [],
};
