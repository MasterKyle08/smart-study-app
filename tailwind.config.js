/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/**/*.html',
    './public/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 10px 40px -18px rgba(15, 23, 42, 0.18)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'), // A plugin for better default form styling
    require('@tailwindcss/typography'), // A plugin for better default typography styling (prose class)
  ],
}
