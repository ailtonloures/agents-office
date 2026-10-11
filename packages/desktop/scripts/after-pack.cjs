// electron-builder skips `node_modules` directories in extraResources, so the production
// dependencies of the staged daemon (build/daemon/node_modules) are copied here, after packing.
const { cpSync, existsSync } = require('node:fs');
const { join } = require('node:path');

exports.default = async function afterPack(context) {
  const source = join(__dirname, '..', 'build', 'daemon', 'node_modules');
  if (!existsSync(source))
    throw new Error('build/daemon/node_modules is missing: run stage-daemon first');
  const resources =
    context.electronPlatformName === 'darwin'
      ? join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources',
        )
      : join(context.appOutDir, 'resources');
  cpSync(source, join(resources, 'daemon', 'node_modules'), {
    recursive: true,
    verbatimSymlinks: true,
  });
};
