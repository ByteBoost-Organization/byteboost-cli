import { Command } from '@commander-js/extra-typings';
import { lstatSync, readdirSync, readFileSync } from 'fs';
import mime from 'mime';
// ~/projekt/byteboost/byteboost-application/client

enum FileType {
  ApplicationJson = 'application/json',
  TextJavascript = 'text/javascript',
}

class UploadSoucemapsHandler {
  private rootFoldersAndFiles = [];

  public jsFilePaths: string[] = [];
  public mapFilePaths: string[] = [];

  constructor(public path: string) {}

  public isPathValidJsDirectory() {
    try {
      const directory = readdirSync(this.path);

      if (!directory.includes('package.json')) {
        console.log(
          `The directory ${this.path} is not a valid project directory`,
        );

        return false;
      }
    } catch (err) {
      console.log(`Couldn't find the directory ${this.path}`);

      return false;
    }

    return true;
  }

  public checkPathForSourcemaps(path: string) {
    const items = readdirSync(path);

    for (const item of items) {
      if (item === 'node_modules') {
        continue;
      }

      const mimetype = mime.getType(`${path}/${item}`);

      if (mimetype === FileType.ApplicationJson && item.includes('.js.map')) {
        this.mapFilePaths.push(`${path}/${item}`);

        continue;
      }

      if (mimetype === FileType.TextJavascript) {
        const fileContent = readFileSync(`${path}/${item}`, 'utf-8');

        if (fileContent.includes('//# sourceMappingURL')) {
          this.jsFilePaths.push(`${path}/${item}`);
        }

        continue;
      }

      const stats = lstatSync(`${path}/${item}`);

      if (stats.isDirectory()) {
        this.checkPathForSourcemaps(`${path}/${item}`);

        continue;
      }
    }
  }
}

export const UploadSourcemapsCommand = new Command()
  .name('upload')
  .description('Upload sourcemaps to Byteboost')
  .option(
    '-v, --version',
    "Label the source maps with the project's version number",
  )
  .option('--dist <dist>', 'Name of the distribution folder')
  .argument('<path>', 'Path to your project directory')
  .action((path: string, options) => {
    const handler = new UploadSoucemapsHandler(path);

    // if (!handler.isPathValidJsDirectory()) {
    //   return;
    // }

    handler.checkPathForSourcemaps(path);

    console.log('Js files', handler.jsFilePaths.length);

    console.log('Sourcemaps', handler.mapFilePaths.length);

    // try {
    //   const directory = readdirSync(path);

    //   if (!directory.includes('package.json')) {
    //     console.log('This is not a valid project directory');

    //     return;
    //   }
    // } catch (err) {
    //   console.log(`Couldn't find the directory ${path}`);

    //   return;
    // }

    // const content = JSON.parse(readFileSync(`${path}/package.json`, 'utf-8'));

    // const directories: string[] = []
  });
