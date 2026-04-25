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
      keyframes: {
        strengthBarPulse: {
          "0%, 100%": { opacity: "1", filter: "brightness(1)" },
          "50%": { opacity: "1", filter: "brightness(1.18)" },
        },
        strengthReveal: {
          "0%": { opacity: "0", transform: "translateY(-4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        draftReadyShell: {
          "0%": { transform: "scale(1)", filter: "brightness(1)", boxShadow: "0 0 0 0 rgba(16,185,129,0)" },
          "40%": {
            transform: "scale(1.01)",
            filter: "brightness(1.04)",
            boxShadow:
              "0 0 36px -10px rgba(52,211,153,0.45), 0 0 0 1px rgba(52,211,153,0.22), inset 0 0 24px -12px rgba(52,211,153,0.12)",
          },
          "100%": { transform: "scale(1)", filter: "brightness(1)", boxShadow: "0 0 0 0 rgba(16,185,129,0)" },
        },
        readyTitleFade: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "strength-bar-pulse": "strengthBarPulse 300ms ease-out 1",
        "strength-reveal": "strengthReveal 300ms ease-out forwards",
        "draft-ready-shell": "draftReadyShell 680ms ease-out forwards",
        "ready-title-fade": "readyTitleFade 520ms ease-out 60ms forwards",
      },
    },
  },
  plugins: [],
};