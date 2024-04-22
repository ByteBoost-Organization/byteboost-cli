import { Command } from '@commander-js/extra-typings';
import { UploadSourcemapsCommand, UploadSourceMapsHandler } from './upload.js';

export { UploadSourceMapsHandler };
export const SourcemapsCommand = new Command()
  .name('sourcemaps')
  .addCommand(UploadSourcemapsCommand);
