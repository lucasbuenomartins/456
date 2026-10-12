/** Tokens definidos em src/styles/index.css como variáveis CSS (canais RGB). */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Fonte arredondada, amigável e legível.
        sans: ['"Nunito Variable"', "Nunito", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
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
        danger: { DEFAULT: token("danger"), soft: token("danger-soft"), ink: token("danger-ink") },
        info: { DEFAULT: token("info"), soft: token("info-soft") },
      },
      // Cantos generosos: visual suave e acolhedor.
      borderRadius: { lg: "14px", xl: "18px", "2xl": "24px", "3xl": "30px" },
      boxShadow: {
        card: "0 1px 2px rgb(var(--shadow) / 0.05), 0 4px 14px -6px rgb(var(--shadow) / 0.10)",
        pop: "0 16px 40px -12px rgb(var(--shadow) / 0.30), 0 4px 12px -4px rgb(var(--shadow) / 0.14)",
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
