/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,html}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        studio: {
          950: '#090a0d',
          900: '#0e1117',
          850: '#131720',
          800: '#1a1f2c',
          750: '#222838',
          700: '#2c3345',
          600: '#40495f',
          500: '#5e6983',
          400: '#8b97b0',
          300: '#b4bdd1',
          200: '#d7dce8',
          100: '#f0f3f9',
        },
        brand: {
          cyan: '#00e5ff',
          orange: '#ff6b35',
          green: '#10b981',
          rose: '#f43f5e',
          amber: '#f59e0b',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
