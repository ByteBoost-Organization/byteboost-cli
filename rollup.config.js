import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';

export default [
  {
    input: [
      'dist/index.js',
      'dist/index.d.ts',
      'dist/managers/index.js',
      'dist/managers/index.d.ts',
    ],
    output: [
      {
        format: 'cjs',
        entryFileNames: '[name].cjs',
        preserveModules: true,
        dir: './dist',
      },
    ],
    plugins: [commonjs(), json(), resolve()],
  },
];
