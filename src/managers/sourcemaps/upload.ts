import mime from 'mime';
import { nanoid } from 'nanoid';
import fetch from 'node-fetch';
import { join } from 'path';
import readline from 'readline';
import { validate } from 'uuid';
import {
  appendFileSync,
  createReadStream,
  lstatSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import dotenv, { DotenvParseOutput } from 'dotenv';
import FormData from 'form-data';
import { Config } from '../../config.js';

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
      console.log(`[Byteboost] Couldn't find the directory ${this.path}`);

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

  private readLastLine(filePath: string): Promise<string> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: createReadStream(filePath),
        crlfDelay: Infinity,
      });

      let lastLine = '';

      rl.on('line', (line) => {
        lastLine = line;
      });

      rl.on('close', () => {
        resolve(lastLine);
      });
    });
  }

  private parseJSON(content: string) {
    try {
      return JSON.parse(content);
    } catch (err) {
      console.log(err);
      return null;
    }
  }

  public async tagFilesWithDebugInfo() {
    for (const path of this.mapFilePaths) {
      const sourceCodePath = path.replace('.map', '');

      const fileGroup = [sourceCodePath, path];

      const debugId = nanoid();
      for (const filePath of fileGroup) {
        if (
          (await this.readLastLine(filePath)).includes('//# bbDebugId') &&
          !Config.BB_DEBUG
        ) {
          throw new Error(
            `[Byteboost] File ${filePath} already contains a debug id. We only support one debug id per file. Please regenerate the sourcemaps.`,
          );
        }

        if (filePath.includes('.map')) {
          const sourceMapContent = this.parseJSON(
            readFileSync(filePath, 'utf-8'),
          );

          if (sourceMapContent) {
            sourceMapContent.debugId = debugId;

            writeFileSync(filePath, JSON.stringify(sourceMapContent));
          }
        } else {
          appendFileSync(filePath, `\n//# bbDebugId=${debugId}`);
        }
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

  public cleanupSourceMaps() {
    for (const path of this.mapFilePaths) {
      unlinkSync(path);
    }
  }

  public async uploadSourcemaps() {
    if (this.mapFilePaths.length === 0) {
      console.log('[Byteboost] No sourcemaps found');
      return;
    }

    const res = await this.uploadFiles(this.mapFilePaths);

    if (res.status !== 201) {
      console.log('[Byteboost] Failed to upload sourcemaps');
      console.log(`[Byteboost] ${JSON.stringify(await res.json(), null, 2)}`);
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
      console.log(
        `[Byteboost] Couldn't find the .env file in your project root path ${this.path}`,
      );
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
