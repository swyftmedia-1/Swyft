'use strict';

const bcrypt = require('bcryptjs');
const readline = require('node:readline');

// Standard readline works reliably in Windows PowerShell and VS Code terminals.
// Input is visible while typing; do not run while screen-sharing or on a shared terminal.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

(async () => {
  try {
    console.log('For this local terminal only, password characters will be visible as you type.');
    const password = await ask('Enter the CMS password (minimum 12 characters): ');
    if (password.length < 12) throw new Error('Use at least 12 characters for the CMS password.');
    const confirmation = await ask('Confirm the CMS password: ');
    if (password !== confirmation) throw new Error('Passwords do not match.');
    const hash = await bcrypt.hash(password, 12);
    console.log('\nCopy this bcrypt hash into the private server environment variable ADMIN_PASSWORD_HASH.');
    console.log('Do not put the password or hash in website files, GitHub, or cms-config.js.\n');
    console.log(hash);
  } catch (error) {
    console.error(`\n${error.message}`);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
})();
