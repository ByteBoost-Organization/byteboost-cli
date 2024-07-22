export default {
  input: 'dist/index.js',
  output: {
    dir: 'dist/',
    format: 'cjs',
    entryFileNames: '[name].cjs',
    preserveModules: true,
  },
};
