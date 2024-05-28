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
    '--projectVersion <projectVersion>',
    "Label the source maps with the project's version",
  )
  .option('--packageJSONVersion', 'Use the version from package.json')
  .option('--dist <dist>', 'Name of the distribution folder, eg build or dist')
  .option(
    '--cleanupSourceMaps <boolean>',
    'Remove sourcemaps after uploading. This is helpful if you are running for example nextjs and dont want your sourcemaps to be public.',
  )
  .argument('<path>', 'Path to your project root directory')
  .action(async (path: string, options) => {
    if (options.cleanupSourceMaps === undefined) {
      options.cleanupSourceMaps = 'true';
    }

    if (!options.projectVersion && !options.packageJSONVersion) {
      console.log(
        `[Byteboost] You must provide a version with --projectVersion or use --packageJSONVersion to use the version from package.json`,
      );

      return;
    }

    const startTime = Date.now();
    const handler = new UploadSourceMapsHandler(path, options.dist);

    const isValidJsDir = handler.isPathValidJsDirectory();

    if (!isValidJsDir) {
      console.warn(
        `[Byteboost] The path ${path} is not a valid JS project directory. Couldn't find package.json`,
      );
      return;
    }

    if (options.projectVersion) {
      handler.version = options.projectVersion;
    } else {
      const packageJSON = JSON.parse(
        readFileSync(`${path}/package.json`, 'utf-8'),
      );

      handler.version = packageJSON.version;
    }

    const success = handler.loadEnvironmentVariables();

    if (success !== true) {
      if (success !== false) console.log(`[Byteboost] ${success}`);
      return;
    }

    handler.compileSourceMapPathsList();

    if (!handler.mapFilePaths[0]) {
      console.log(`[Byteboost] No sourcemaps found in ${handler.fullpath}`);
      return;
    }

    await handler.tagFilesWithDebugInfo();

    await handler.uploadSourcemaps();

    if (options.cleanupSourceMaps === 'true') {
      handler.cleanupSourceMaps();

      console.log('[Byteboost] Sourcemaps cleaned up');
    }

    console.log(
      `[Byteboost] Uploaded sourcemaps in ${(Date.now() - startTime) / 1000} seconds`,
    );
  });
