export default {
  input: [
    'dist/index.js',
    'dist/managers/index.js',
    'dist/managers/sourcemaps/index.js',
  ],
  output: {
    dir: 'dist',
    format: 'cjs',
    entryFileNames: '[name].cjs',
    preserveModules: true,
  },
};
