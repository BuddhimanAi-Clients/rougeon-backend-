import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { prisma } from '../configs/database.config.js';
import { AppError } from '../shared/errors/app-error.js';
import { bootstrapInitialAdmin } from '../shared/auth/bootstrap-admin.service.js';

async function ask(question: string) {
  const terminal = createInterface({ input, output });
  try {
    return (await terminal.question(question)).trim();
  } finally {
    terminal.close();
  }
}

async function askHidden(question: string): Promise<string> {
  if (!input.isTTY || !output.isTTY) throw new Error('An interactive terminal is required to enter the administrator password safely.');
  output.write(question);
  input.setRawMode(true);
  input.resume();
  input.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      input.off('data', onData);
      input.setRawMode(false);
      output.write('\n');
      resolve(value);
    };
    const onData = (key: string) => {
      if (key === '\u0003') {
        input.off('data', onData);
        input.setRawMode(false);
        output.write('\n');
        reject(new Error('Bootstrap cancelled'));
      } else if (key === '\r' || key === '\n') finish();
      else if (key === '\u007f' || key === '\b') value = value.slice(0, -1);
      else if (!key.startsWith('\u001b')) value += key;
    };
    input.on('data', onData);
  });
}

async function run() {
  const name = await ask('Initial admin name: ');
  const email = await ask('Initial admin email: ');
  const password = await askHidden('Initial admin password (hidden): ');
  const confirmedPassword = await askHidden('Confirm password (hidden): ');
  if (password !== confirmedPassword) throw new AppError(422, 'PASSWORD_MISMATCH', 'Passwords do not match');
  const admin = await bootstrapInitialAdmin({ name, email, password });
  output.write(`Initial admin created for ${admin.email}. You can now sign in to the Admin app.\n`);
}

run()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unable to bootstrap the initial administrator';
    output.write(`Bootstrap failed: ${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
