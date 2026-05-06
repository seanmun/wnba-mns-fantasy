/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        mns: {
          dark: '#0a0a0a',
          card: '#121212',
          hover: '#1a1a1a',
        },
      },
    },
  },
  plugins: [],
}
