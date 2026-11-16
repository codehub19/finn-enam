import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const port = process.env.PORT || '4173';
const apiPort = process.env.FINN_API_PORT || '4174';
const root = new URL('.', import.meta.url);
const start = (path, args, env) => spawn(process.execPath, [fileURLToPath(new URL(path, root)), ...args], { stdio: 'inherit', env });
const api = start('server.mjs', [], {...process.env, HOST: '127.0.0.1', PORT: apiPort,
  PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:' + port});
const web = start('node_modules/next/dist/bin/next', ['start', '-p', port, '-H', process.env.HOST || '127.0.0.1'], process.env);

function stop(code) {
  process.exitCode = code;
  api.kill();
  web.kill();
}
for (const child of [api, web]) child.once('exit', code => stop(code ?? process.exitCode ?? 1));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop(0));
