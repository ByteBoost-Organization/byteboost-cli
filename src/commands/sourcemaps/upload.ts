import { Command } from '@commander-js/extra-typings';
import { readFileSync } from 'fs';
import { Config } from '../../config.js';
import { UploadSourceMapsHandler } from '../../managers/sourcemaps/upload.js';

// ~/projekt/byteboost/byteboost-application/client

if (Config.BB_DEBUG) {
  // Disables SSL certificate validation
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
}

const getPackageVersion = (path: string, usePackageVersion?: true) => {
  if (!usePackageVersion) return undefined;

  const packageJSON = JSON.parse(readFileSync(`${path}/package.json`, 'utf-8'));

  return packageJSON.version;
};

export const UploadSourcemapsCommand = new Command()
  .name('upload')
  .description('Upload sourcemaps to Byteboost')
  .option(
    '-v, --packageJSONVersion',
    'Use the version from package.json. If this is not defined we will automatically generate an unique id for you',
  )
  .option('--dist <dist>', 'Name of the distribution folder, eg build or dist')
  .option(
    '-c, --cleanup',
    'Remove sourcemaps after uploading. This is helpful if you are running for example nextjs and dont want your sourcemaps to be public.',
  )
  .argument('<path>', 'Path to your project root directory')
  .action(async (path: string, options) => {
    const startTime = Date.now();
    const handler = new UploadSourceMapsHandler(path, options.dist);
    const isValidJsDir = handler.isPathValidJsDirectory();

    if (!isValidJsDir) {
      console.warn(
        `[Byteboost] The path ${path} is not a valid JS project directory. Couldn't find package.json`,
      );
      return;
    }

    const success = handler.loadEnvironmentVariables();
    if (success !== true) {
      if (success !== false) console.log(`[Byteboost] ${success}`);
      return;
    }

    try {
      const sessionId = await handler.startUploadSession(
        getPackageVersion(path, options.packageJSONVersion),
      );

      handler.sessionId = sessionId;

      handler.compileSourceMapPathsList();

      if (!handler.mapFilePaths[0]) {
        console.log(
          `[Byteboost] No sourcemaps found in path ${handler.fullpath}`,
        );

        return;
      }

      await handler.tagFilesWithDebugInfo();

      await handler.uploadSourcemaps();
      if (options.cleanup) {
        handler.cleanupSourceMaps();
        console.log('[Byteboost] Sourcemaps cleaned up');
      }

      handler.finishSession();

      console.log(
        `[Byteboost] Uploaded sourcemaps in ${(Date.now() - startTime) / 1000} seconds`,
      );
    } catch (err: any) {
      console.error(`[Byteboost] ${err.message}`);
    }
  });
