import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';
import json from '@rollup/plugin-json';
import { readFileSync } from 'fs';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

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
        // file: packageJson.main,
        format: 'cjs',
        // sourcemap: true,
        // inlineDynamicImports: true,
        entryFileNames: '[name].cjs',
        preserveModules: true,
        dir: './dist',
      },
      // {
      //   file: packageJson.module,
      //   format: 'esm',
      //   sourcemap: true,
      //   inlineDynamicImports: true,
      // },
    ],
    plugins: [
      commonjs(),
      json(),
      resolve(),
      // typescript({ tsconfig: './tsconfig.json' }),
    ],
  },
  // {
  //   input: 'dist/types/index.d.ts',
  //   output: [{ file: 'dist/index.d.ts', format: 'esm' }],
  //   plugins: [dts()],
  // },
];
