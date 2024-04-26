import { Command } from '@commander-js/extra-typings';
import dotenv, { DotenvParseOutput } from 'dotenv';
import FormData from 'form-data';
import { appendFileSync, lstatSync, readdirSync, readFileSync } from 'fs';
import mime from 'mime';
import { nanoid } from 'nanoid';
import fetch from 'node-fetch';
import { join } from 'path';
import { validate } from 'uuid';
import { Config } from '../../config.js';

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

export class UploadSourceMapsHandler {
  public mapFilePaths: string[] = [];
  public fullpath: string;

  env: Partial<EnvConf> = {};

  public version: string | null = null;

  constructor(
    public path: string,
    public distName?: string,
  ) {
    this.fullpath = join(path, distName ?? '');
  }

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

  public compileSourceMapPathsList(path: string = this.fullpath) {
    try {
      const items = readdirSync(path);

      for (const item of items) {
        if (item === 'node_modules') {
          continue;
        }

        const mimetype = mime.getType(join(path, item));

        if (mimetype === FileType.ApplicationJson && item.includes('.map')) {
          this.mapFilePaths.push(join(path, item));

          continue;
        }

        const stats = lstatSync(join(path, item));

        if (stats.isDirectory()) {
          this.compileSourceMapPathsList(join(path, item));

          continue;
        }
      }
    } catch (err: any) {
      console.log(err.message);
    }
  }

  public tagFilesWithDebugInfo() {
    for (const path of this.mapFilePaths) {
      const sourceCodePath = path.replace('.map', '');

      const fileGroup = [sourceCodePath, path];

      const debugId = nanoid();
      for (const filePath of fileGroup) {
        const content = readFileSync(filePath, 'utf-8');

        if (content.includes(`//# bbDebugId`) && !Config.BB_DEBUG) {
          throw new Error(
            `File ${filePath} already contains a debug id. We only support one debug id per file. Please regenerate the sourcemaps.`,
          );
        }

        appendFileSync(filePath, `\n//# bbDebugId=${debugId}`);

        break;
      }
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

    const res = await this.uploadFiles(this.mapFilePaths);

    if (res.status !== 201) {
      console.log('Failed to upload sourcemaps');
      console.log(JSON.stringify(await res.json(), null, 2));
      return;
    }

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

    handler.tagFilesWithDebugInfo();

    handler.uploadSourcemaps();

    console.log(
      `Uploaded sourcemaps in ${(Date.now() - startTime) / 1000} seconds`,
    );
  });
