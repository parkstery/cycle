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
      keyframes: {
        'sensor-led': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.2' },
        },
      },
      animation: {
        'sensor-led': 'sensor-led 1s ease-in-out infinite',
      },
    },
  },  
  plugins: [],
};
