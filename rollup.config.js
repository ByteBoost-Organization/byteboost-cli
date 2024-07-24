import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';
import json from '@rollup/plugin-json';
import { readFileSync } from 'fs';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

export default [
  {
    input: ['src/index.ts', 'src/managers/index.ts'],
    output: [
      {
        // file: packageJson.main,
        dir: 'dist',
        format: 'cjs',
        entryFileNames: '[name].cjs',
        // inlineDynamicImports: true,
      },
      {
        // file: packageJson.module,
        dir: 'dist',
        entryFileNames: '[name].mjs',

        format: 'esm',
        // inlineDynamicImports: true,
      },
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
      json(),
    ],
  },
  // {
  //   input: 'src/managers/index.ts',
  //   output: [
  //     {
  //       file: packageJson.main,
  //       format: 'cjs',
  //       inlineDynamicImports: true,
  //     },
  //     {
  //       file: packageJson.module,
  //       format: 'esm',
  //       inlineDynamicImports: true,
  //     },
  //   ],
  //   plugins: [
  //     resolve(),
  //     commonjs(),
  //     typescript({ tsconfig: './tsconfig.json' }),
  //     json(),
  //   ],
  // },
  {
    input: 'dist/types/index.d.ts',
    output: [{ file: 'dist/index.d.ts', format: 'esm' }],
    plugins: [dts()],
  },
];
