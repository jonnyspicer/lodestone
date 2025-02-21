/** @type {import('tailwindcss').Config} */
export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			fontFamily: {
				sans: ["Inter", "system-ui", "Helvetica", "Arial", "sans-serif"],
				serif: ["Lora", "Georgia", "serif"],
			},
			colors: {
				primary: "#4D49F9",
			},
		},
	},
	plugins: [],
};
