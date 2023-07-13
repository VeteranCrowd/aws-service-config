/* eslint-env mocha */

// npm imports
import { testSetup } from '@veterancrowd/aws-cli';

// Import version from package.json.
import pkg from '../package.json' assert { type: 'json' };
if (!process.env.npm_package_version)
  process.env.npm_package_version = pkg.version;

before(async function () {
  await testSetup();
});
