import { Command } from '@commander-js/extra-typings';
import { UploadSourcemapsCommand, UploadSoucemapsHandler } from './upload.js';

export { UploadSoucemapsHandler };
export const SourcemapsCommand = new Command()
  .name('sourcemaps')
  .addCommand(UploadSourcemapsCommand);
