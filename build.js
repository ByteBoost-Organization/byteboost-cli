#!/usr/bin/env zx
import { $, chalk } from 'zx';

try {
  await `rm -rf dist`;
  await $`npx tsc -p tsconfig.dist.json --module nodenext --outDir dist/esm`;
  await $`echo '{"type": "module"}' > dist/esm/package.json`;

  await $`npx tsc -p tsconfig.dist.json --module commonjs --outDir dist/cjs`;
  await $`echo '{"type": "commonjs"}' > dist/cjs/package.json`;

  console.log(chalk.green('Compilation successful'));
} catch (error) {
  console.error(error);
  console.error(chalk.red('Compilation failed:'), chalk.red(error.message));
}
