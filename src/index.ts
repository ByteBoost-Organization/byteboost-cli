#! /usr/bin/env node

import { Command } from '@commander-js/extra-typings';
import { SourcemapsCommand } from './commands/sourcemaps/index.js';

let program = new Command();

program
  .name('byteboost-cli')
  .description('Cli to create and manage application services')
  .version('0.0.1');

program.addCommand(SourcemapsCommand);

program.showSuggestionAfterError();
program.showHelpAfterError();

program.parse();

export { UploadSoucemapsHandler } from './commands/sourcemaps/index.js';
