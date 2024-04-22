import { Command } from '@commander-js/extra-typings';
import { lstatSync, readdirSync, readFileSync } from 'fs';
import mime from 'mime';
import FormData from 'form-data';
import fetch from 'node-fetch';
import cliProgress from 'cli-progress';
import { Config } from '../../config.js';
import dotenv, { DotenvParseOutput } from 'dotenv';
import { validate } from 'uuid';
import { nanoid } from 'nanoid';

// ~/projekt/byteboost/byteboost-application/client

if (Config.BB_DEBUG) {
  // Disables SSL certificate validation
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
}

enum FileType {
  ApplicationJson = 'application/json',
  TextJavascript = 'text/javascript',
}

interface EnvConf extends DotenvParseOutput {
  BYTEBOOST_TOKEN: string;
  BYTEBOOST_DOMAIN: string;
  BYTEBOOST_ORGANIZATION: string;
}

export class UploadSoucemapsHandler {
  public mapFilePaths: string[] = [];

  env: Partial<EnvConf> = {};

  public version: string | null = null;

  constructor(public path: string) {}

  public isPathValidJsDirectory() {
    try {
      const directory = readdirSync(this.path);

      if (!directory.includes('package.json')) {
        return false;
      }
    } catch (err) {
      console.log(`Couldn't find the directory ${this.path}`);

      return false;
    }

    return true;
  }

  public compileSourceMapPathsList(path: string = this.path) {
    try {
      const items = readdirSync(path);

      for (const item of items) {
        if (item === 'node_modules') {
          continue;
        }

        const mimetype = mime.getType(`${path}/${item}`);

        if (mimetype === FileType.ApplicationJson && item.includes('.map')) {
          this.mapFilePaths.push(`${path}/${item}`);

          continue;
        }

        const stats = lstatSync(`${path}/${item}`);

        if (stats.isDirectory()) {
          this.compileSourceMapPathsList(`${path}/${item}`);

          continue;
        }
      }
    } catch (err: any) {
      console.log(err.message);
    }
  }

  private uploadFiles(paths: string[]) {
    const form = new FormData();

    for (const path of paths) {
      const fileContent = readFileSync(path, 'utf-8');

      const filename = path.split('/').pop();

      form.append('files', fileContent, {
        filename: filename,
        contentType: mime.getType(path) ?? undefined,
      });
    }

    if (this.version) {
      form.append('version', this.version);
    }

    form.append('organization', this.env.BYTEBOOST_ORGANIZATION);
    form.append('domain', this.env.BYTEBOOST_DOMAIN);

    return fetch(`${Config.BB_API_URL}/sourcemaps`, {
      method: 'POST',
      headers: {
        ...form.getHeaders(),
        ['X-Auth-Token']: this.env.BYTEBOOST_TOKEN!,
      },
      insecureHTTPParser: true,
      body: form,
    });
  }

  public async uploadSourcemaps() {
    if (this.mapFilePaths.length === 0) {
      console.log('No sourcemaps found');
      return;
    }

    const bar = new cliProgress.Bar(
      {
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic,
    );

    bar.start(this.mapFilePaths.length, 0);

    let failedUploads = 0;

    for (const path of this.mapFilePaths) {
      const splitPath = path.split('/');
      const mapFilename = splitPath.pop();
      const fileBasePath = splitPath.join('/');
      const sourcecodeFilename = mapFilename!.replace('.map', '');

      try {
        if (!lstatSync(`${fileBasePath}/${sourcecodeFilename}`).isFile()) {
          continue;
        }
      } catch (err) {
        console.log(`Couldn't find the source code file for ${mapFilename}`);

        continue;
      }

      const result = await this.uploadFiles([
        `${fileBasePath}/${sourcecodeFilename}`,
        `${fileBasePath}/${mapFilename}`,
      ]);

      if (result.status !== 201) {
        failedUploads++;

        if (result.status === 401) {
          bar.stop();
          console.log('Unauthorized');
          return;
        } else if (result.status === 400) {
          bar.stop();
          const data = await result.json();

          // @ts-expect-error
          throw new Error(data.errors[0].message);
        }

        console.log(await result.json());
        break;
      }

      bar.increment();

      // break;
    }

    bar.stop();

    console.log(`${failedUploads} sourcemaps failed to upload`);

    return;
  }

  public loadEnvironmentVariables() {
    try {
      const content = readFileSync(`${this.path}/.env`, 'utf-8');

      const buf = Buffer.from(content);
      const config = dotenv.parse<EnvConf>(buf);

      if (!config.BYTEBOOST_TOKEN) {
        return 'BYTEBOOST_TOKEN is required';
      }

      if (!config.BYTEBOOST_DOMAIN) {
        return 'BYTEBOOST_DOMAIN is required';
      }

      if (!config.BYTEBOOST_ORGANIZATION) {
        return 'BYTEBOOST_ORGANIZATION is required';
      }

      if (!validate(config.BYTEBOOST_TOKEN)) {
        return 'Invalid auth token';
      }

      this.env = config;

      return true;
    } catch (err) {
      console.log(`Couldn't find the .env file in path ${this.path}`);
      console.log(`
      Env format:
      BYTEBOOST_TOKEN=<your-token>
      BYTEBOOST_DOMAIN=<your-domain>
      BYTEBOOST_ORGANIZATION=<your-organization>
    `);
      return false;
    }
  }
}

export const UploadSourcemapsCommand = new Command()
  .name('upload')
  .description('Upload sourcemaps to Byteboost')
  .option(
    '--auto-version',
    "Flag to disable versioning. We'll generate a random string as the version",
  )
  .option(
    '--tagged-version <version>',
    "Label the source maps with the project's version number",
  )
  .option('--dist <dist>', 'Name of the distribution folder')
  .argument('<path>', 'Path to your project directory')
  .action(async (path: string, options) => {
    if (!options.autoVersion && !options.taggedVersion) {
      console.log(
        `If you don't want to specify a version you have to pass the --auto-version flag and we will generate a random string as the version`,
      );

      return;
    }

    const startTime = Date.now();
    const handler = new UploadSoucemapsHandler(path);

    const isValidJsDir = handler.isPathValidJsDirectory();

    if (!isValidJsDir) {
      console.warn(
        `The path ${path} is not a valid JS project directory. Couldn't find package.json`,
      );
      return;
    }

    if (options.taggedVersion) {
      handler.version = options.taggedVersion;
    } else if (options.autoVersion) {
      handler.version = nanoid();
    }

    const success = handler.loadEnvironmentVariables();

    if (success !== true) {
      return;
    }

    handler.compileSourceMapPathsList();

    await handler.uploadSourcemaps();

    console.log(
      `Uploaded sourcemaps in ${(Date.now() - startTime) / 1000} seconds`,
    );
  });
