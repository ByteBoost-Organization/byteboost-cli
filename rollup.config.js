export default {
  input: ['dist/managers/index.js'],
  output: {
    dir: 'dist',
    format: 'cjs',
    entryFileNames: '[name].cjs',
    preserveModules: true,
  },
};
