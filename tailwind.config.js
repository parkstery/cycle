/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./App.tsx",
    "./index.tsx",
    "./ElevationChartView.tsx",
    "./types.ts",
    "./services/**/*.ts",
  ],
  theme: {
    extend: {
      colors: {
        navy: '#001f3f', // navy blue
      },
    },
  },  
  plugins: [],
};
