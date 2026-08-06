/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // 🌟  加入這一行，讓系統支援手動切換深色模式
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
