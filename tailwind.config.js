/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/**/*.html',
    './public/**/*.js',
  ],
  theme: {
    extend: {
      // You can extend the default theme here if needed in the future
      // For example, custom colors, fonts, etc.
      // colors: {
      //   'brand-blue': '#007bff',
      // },
      // fontFamily: {
      //   sans: ['Inter', 'sans-serif'],
      // },
    },
  },
  plugins: [
    require('@tailwindcss/forms'), // A plugin for better default form styling
    require('@tailwindcss/typography'), // A plugin for better default typography styling (prose class)
  ],
}
