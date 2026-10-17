// scoped-import runs first: it inlines Tailwind's preflight scoped to the Blog Admin (see app/globals.css)
export default { plugins: { "./postcss/scoped-import.cjs": {}, "@tailwindcss/postcss": {} } };
