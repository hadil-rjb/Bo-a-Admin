/** @type {import('next').NextConfig} */
export default {
  // NEXT_DIST_DIR: another build folder (e.g. a second dev server next to yours); scripts/check-css.mjs reads it too
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};
