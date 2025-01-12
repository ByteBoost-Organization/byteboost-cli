import mime from 'mime';
import { nanoid } from 'nanoid';
import fetch from 'node-fetch';
import { join } from 'path';
import readline from 'readline';
import { validate } from 'uuid';
import {
  appendFileSync,
  createReadStream,
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import dotenv from 'dotenv';
import FormData from 'form-data';
import { Config } from '../../config.js';

enum FileType {
  ApplicationJson = 'application/json',
  TextJavascript = 'text/javascript',
}

interface EnvConf extends dotenv.DotenvParseOutput {
  BYTEBOOST_PRIVATE_KEY: string;
  BYTEBOOST_PUBLIC_KEY: string;
  BYTEBOOST_DOMAIN: string;
  BYTEBOOST_ORGANIZATION: string;
}

export class UploadSourceMapsHandler {
  public mapFilePaths: string[] = [];
  public fullpath: string;

  env: Partial<EnvConf> = {};

  public sessionId: string | null = null;

  constructor(
    public path: string,
    public distName?: string,
  ) {
    this.fullpath = join(path, distName ?? '');
  }

  public async startUploadSession(version?: string) {
    try {
      const res = await fetch(
        `${Config.BB_API_URL}/sourcemaps/session${version ? `?version=${version}` : ''}`,
        {
          method: 'GET',
          headers: {
            ['X-Auth-Token']: this.env.BYTEBOOST_PRIVATE_KEY!,
            ['X-Identifier-Token']: this.env.BYTEBOOST_PUBLIC_KEY!,
            ['X-Domain']: this.env.BYTEBOOST_DOMAIN!,
            ['X-Organization']: this.env.BYTEBOOST_ORGANIZATION!,
          },
          insecureHTTPParser: true,
        },
      );

      if (res.status === 404) {
        throw new Error('404 not found');
      }

      try {
        const data = (await res.json()) as {
          data: string;
          errors: { message: string }[];
        };

        if (res.status !== 201) {
          if (!data.errors[0]) {
            throw new Error(
              'Unexpected error. please contact us at support@byteboost.io',
            );
          }

          throw new Error(data.errors[0].message);
        }

        return data.data;
      } catch (err) {
        // throw new Error(
        //   'Unexpected error. please contact us at support@byteboost.io',
        // );
        throw err;
      }
    } catch (err) {
      throw err;
    }
  }

  public async finishSession() {
    try {
      if (!this.sessionId) {
        throw new Error('No upload session found');
      }

      const res = await fetch(`${Config.BB_API_URL}/sourcemaps/session`, {
        method: 'PUT',
        headers: {
          ['X-Session']: this.sessionId!,
          ['X-Auth-Token']: this.env.BYTEBOOST_PRIVATE_KEY!,
          ['X-Identifier-Token']: this.env.BYTEBOOST_PUBLIC_KEY!,
          ['X-Domain']: this.env.BYTEBOOST_DOMAIN!,
          ['X-Organization']: this.env.BYTEBOOST_ORGANIZATION!,
        },
        insecureHTTPParser: true,
      });

      if (res.status === 404) {
        throw new Error('404 not found');
      }

      const data = (await res.json()) as {
        data: string;
        errors: { message: string }[];
      };

      if (res.status !== 201) {
        if (!data.errors[0]) {
          throw new Error(
            'Unexpected error. please contact us at support@byteboost.io',
          );
        }

        throw new Error(data.errors[0].message);
      }

      return data.data;
    } catch (err) {
      throw err;
    }
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

        if (mimetype === FileType.ApplicationJson && item.includes('.js.map')) {
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
    return new Promise((resolve, reject) => {
      try {
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
      } catch (err) {
        reject(err);
      }
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
    if (this.mapFilePaths.length === 0) {
      throw new Error('No sourcemaps found to tag');
    }

    for (const sourceMapPath of this.mapFilePaths) {
      const minifiedCodePath = sourceMapPath.replace('.map', '');

      const fileGroup = [minifiedCodePath, sourceMapPath];

      const debugId = nanoid();
      for (const filePath of fileGroup) {
        if (!existsSync(filePath)) {
          // File doesnt exist
          console.log(`[Byteboost] path ${filePath} doesn't exist`);
          continue;
        }

        try {
          if (
            (await this.readLastLine(filePath)).includes('//# bbDebugId') &&
            !Config.BB_DEBUG
          ) {
            continue;
            // throw new Error(
            //   `[Byteboost] File ${filePath} already contains a debug id. We only support one debug id per file. Please regenerate the sourcemaps.`,
            // );
          }
        } catch (err) {
          continue;
        }

        if (filePath.endsWith('.map')) {
          const sourceMapContent = this.parseJSON(
            readFileSync(filePath, 'utf-8'),
          );

          if (sourceMapContent) {
            sourceMapContent.bbDebugId = debugId;

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
      try {
        const fileContent = readFileSync(path, 'utf-8');

        const filename = path.split('/').pop();

        form.append('files', fileContent, {
          filename: filename,
          contentType: mime.getType(path) ?? undefined,
        });
      } catch (err: any) {
        console.log(`[Byteboost] ${err.message}`);
      }
    }

    return fetch(`${Config.BB_API_URL}/sourcemaps/upload`, {
      method: 'POST',
      headers: {
        ...form.getHeaders(),
        ['X-Session']: this.sessionId!,
        ['X-Domain']: this.env.BYTEBOOST_DOMAIN!,
        ['X-Organization']: this.env.BYTEBOOST_ORGANIZATION!,
        ['X-Auth-Token']: this.env.BYTEBOOST_PRIVATE_KEY!,
        ['X-Identifier-Token']: this.env.BYTEBOOST_PUBLIC_KEY!,
      },
      insecureHTTPParser: true,
      body: form,
    });
  }

  public cleanupSourceMaps() {
    for (const path of this.mapFilePaths) {
      try {
        unlinkSync(path);
      } catch (err) {
        console.log(`[Byteboost] Failed to remove ${path}`);
      }
    }
  }

  public async uploadSourcemaps() {
    if (this.mapFilePaths.length === 0) {
      console.log('[Byteboost] No sourcemaps found');
      return;
    }

    const paths: string[] = [];

    for (const path of this.mapFilePaths) {
      if (path.endsWith('.map')) {
        const splitPath = path.split('.map');

        paths.push(splitPath.join(''));
      }

      paths.push(path);
    }

    const res = await this.uploadFiles(paths);

    if (res.status !== 201) {
      try {
        console.log('[Byteboost] Failed to upload sourcemaps');
        console.log(`[Byteboost] ${JSON.stringify(await res.json(), null, 2)}`);
      } catch (err) {
        console.log(
          `[Byteboost] Unexpected error. Please contact us at support@byteboost.io`,
        );
      }
      return;
    }

    return;
  }

  public loadEnvironmentVariables() {
    try {
      const content = readFileSync(`${this.path}/.env`, 'utf-8');

      const buf = Buffer.from(content);
      const config = dotenv.parse<EnvConf>(buf);

      if (!config.BYTEBOOST_PRIVATE_KEY) {
        return 'BYTEBOOST_PRIVATE_KEY is required';
      }

      if (!config.BYTEBOOST_PUBLIC_KEY) {
        return 'BYTEBOOST_PUBLIC_KEY is required';
      }

      if (!config.BYTEBOOST_DOMAIN) {
        return 'BYTEBOOST_DOMAIN is required';
      }

      if (!config.BYTEBOOST_ORGANIZATION) {
        return 'BYTEBOOST_ORGANIZATION is required';
      }

      if (!validate(config.BYTEBOOST_PUBLIC_KEY)) {
        return 'Invalid identifier token. Must be an uuid';
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
