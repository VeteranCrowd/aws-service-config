/*
******************* DO NOT EDIT THIS NOTICE *****************
This code and all related intellectual property is owned by  
Veteran Crowd Rewards, LLC. It is not to be disclosed, copied
or used without written permission.                          
*************************************************************
*/

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
