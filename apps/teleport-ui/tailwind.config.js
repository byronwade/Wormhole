/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Wormhole brand colors from brand-identity.md
        wormhole: {
          purple: "#7C3AED",
          "purple-light": "#8B5CF6",
          "purple-dark": "#6D28D9",
        },
      },
    },
  },
  plugins: [],
};
