import type { Config } from 'tailwindcss';

/* Dostelo storefront Tailwind configuration.
   Tailwind CSS v3.4.19, chosen deliberately over v4: v3 exposes an
   explicit content list and corePlugins.preflight, which is the
   only way to guarantee that no global reset ever touches the
   ported legacy stylesheet (src/styles/legacy.css). The v4 engine
   also auto-detects content, which would scan the preserved
   legacy HTML file under public/legacy and generate utilities
   from it.
   Every theme value below resolves to an existing design token
   CSS variable from @dostelo/design-tokens (tokens.css). No
   colour, radius, shadow or font value is hard-coded here: the
   font stack is the legacy body stack verbatim. */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        surface: 'var(--surface)',
        surface2: 'var(--surface2)',
        ink: 'var(--ink)',
        body: 'var(--body)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        dark: 'var(--dark)',
        dark2: 'var(--dark2)',
        'on-dark': 'var(--on-dark)',
        'on-dark-mut': 'var(--on-dark-mut)',
        chip: 'var(--chip)',
      },
      borderRadius: {
        lg: 'var(--r-lg)',
        md: 'var(--r-md)',
        sm: 'var(--r-sm)',
      },
      fontFamily: {
        sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        token: 'var(--shadow)',
      },
    },
  },
  plugins: [],
};

export default config;
