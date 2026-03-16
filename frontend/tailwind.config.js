/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // 'sans' is the default font in Tailwind
        // Adding your font to the start of the array makes it the primary font
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Or create a custom class name
        heading: ['Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}