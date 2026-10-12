/** Tokens definidos em src/styles/index.css como variáveis CSS (canais RGB). */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      colors: {
        bg: token("bg"),
        surface: { DEFAULT: token("surface"), muted: token("surface-muted"), sunken: token("surface-sunken") },
        border: { DEFAULT: token("border"), strong: token("border-strong") },
        ink: { DEFAULT: token("ink"), muted: token("ink-muted"), subtle: token("ink-subtle"), inverse: token("ink-inverse") },
        primary: { DEFAULT: token("primary"), hover: token("primary-hover"), soft: token("primary-soft"), ink: token("primary-ink") },
        accent: { DEFAULT: token("accent"), soft: token("accent-soft") },
        success: { DEFAULT: token("success"), soft: token("success-soft") },
        warning: { DEFAULT: token("warning"), soft: token("warning-soft") },
        danger: { DEFAULT: token("danger"), soft: token("danger-soft") },
        info: { DEFAULT: token("info"), soft: token("info-soft") },
      },
      borderRadius: { lg: "10px", xl: "14px", "2xl": "18px" },
      boxShadow: {
        card: "0 1px 2px rgb(28 25 23 / 0.04), 0 1px 3px rgb(28 25 23 / 0.06)",
        pop: "0 10px 30px -10px rgb(28 25 23 / 0.25), 0 4px 10px -4px rgb(28 25 23 / 0.12)",
      },
      fontSize: {
        // Corpo nunca abaixo de 14px; padrão 15–16px.
        xs: ["0.8125rem", { lineHeight: "1.15rem" }],
        sm: ["0.875rem", { lineHeight: "1.3rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
      },
      minHeight: { touch: "44px" },
      minWidth: { touch: "44px" },
    },
  },
  plugins: [],
};
