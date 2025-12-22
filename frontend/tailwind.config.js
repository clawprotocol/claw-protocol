// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        clawbg: "#050816",
        clawaccent: "#10b981",
        clawaccentSoft: "#22c55e",
        clawdanger: "#ef4444",
      },
    },
  },
  plugins: [],
};
