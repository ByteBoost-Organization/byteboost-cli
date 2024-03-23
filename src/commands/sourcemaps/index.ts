import { Command } from '@commander-js/extra-typings';
import { UploadSourcemapsCommand } from './upload.js';

export const SourcemapsCommand = new Command()
  .name('sourcemaps')
  .addCommand(UploadSourcemapsCommand);
