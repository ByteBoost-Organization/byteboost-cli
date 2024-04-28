import { Command } from '@commander-js/extra-typings';

import { readFileSync } from 'fs';
import { Config } from '../../config.js';
import { UploadSourceMapsHandler } from '../../managers/sourcemaps/upload.js';

// ~/projekt/byteboost/byteboost-application/client

if (Config.BB_DEBUG) {
  // Disables SSL certificate validation
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
}

export const UploadSourcemapsCommand = new Command()
  .name('upload')
  .description('Upload sourcemaps to Byteboost')
  .option(
    '--version <version>',
    "Label the source maps with the project's version",
  )
  .option('--packageJSONVersion', 'Use the version from package.json')
  .option('--dist <dist>', 'Name of the distribution folder')
  .argument('<path>', 'Path to your project directory')
  .action(async (path: string, options) => {
    if (!options.version && !options.packageJSONVersion) {
      console.log(
        `You must provide a version with --version or use --packageJSONVersion to use the version from package.json`,
      );

      return;
    }

    const startTime = Date.now();
    const handler = new UploadSourceMapsHandler(path, options.dist);

    const isValidJsDir = handler.isPathValidJsDirectory();

    if (!isValidJsDir) {
      console.warn(
        `The path ${path} is not a valid JS project directory. Couldn't find package.json`,
      );
      return;
    }

    if (options.version) {
      handler.version = options.version;
    } else {
      const packageJSON = JSON.parse(
        readFileSync(`${path}/package.json`, 'utf-8'),
      );

      handler.version = packageJSON.version;
    }

    const success = handler.loadEnvironmentVariables();

    if (success !== true) {
      console.log(success);
      return;
    }

    handler.compileSourceMapPathsList();

    if (!handler.mapFilePaths[0]) {
      console.log(`No sourcemaps found in ${handler.fullpath}`);
      return;
    }

    await handler.tagFilesWithDebugInfo();

    handler.uploadSourcemaps();

    console.log(
      `Uploaded sourcemaps in ${(Date.now() - startTime) / 1000} seconds`,
    );
  });
