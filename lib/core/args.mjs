import { parseArgs } from 'node:util';

export function parseCommand(argv) {
  const command = argv[0];
  if (!command || command === '--help' || command === '-h') return { command: 'help' };
  if (command === '--version') return { command: 'version' };
  const schemas = {
    capture: { modes: { type: 'string', default: 'desktop' }, out: { type: 'string' }, cookie: { type: 'string' }, 'no-normalize': { type: 'boolean' }, 'max-tile': { type: 'string', default: '4000' } },
    crawl: {},
    dashboard: { port: { type: 'string', default: '0' } },
    'install-browser': {},
  };
  if (!schemas[command]) throw new Error(`Unknown command: ${command}. Run designteam --help.`);
  const { values, positionals } = parseArgs({ args: argv.slice(1), options: { ...schemas[command], help: { type: 'boolean', short: 'h' } }, allowPositionals: true, strict: true });
  if (values.help) return { command: 'help' };
  if (command === 'capture' || command === 'crawl') {
    if (!positionals.length || positionals.length > (command === 'crawl' ? 1 : 20)) throw new Error(command === 'crawl' ? 'crawl needs exactly one URL.' : 'capture needs 1–20 URLs.');
    for (const value of positionals) {
      let url;
      try { url = new URL(value); } catch { throw new Error(`Invalid URL: ${value}. Include http:// or https://.`); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`Unsupported URL: ${value}. Use http(s) without embedded credentials.`);
    }
  }
  if (command === 'capture') {
    const modes = [...new Set(values.modes.split(',').map(s => s.trim()))];
    if (!modes.length || modes.some(m => !['desktop', 'mobile'].includes(m))) throw new Error('--modes must contain desktop and/or mobile.');
    const maxTile = Number(values['max-tile']);
    if (!Number.isInteger(maxTile) || maxTile < 101 || maxTile > 4096) throw new Error('--max-tile must be an integer between 101 and 4096.');
    if (values.out !== undefined && !values.out.trim()) throw new Error('--out cannot be empty.');
    return { command, urls: positionals, options: { modes, out: values.out, cookie: values.cookie, normalize: !values['no-normalize'], maxTile } };
  }
  if (command === 'dashboard') {
    if (positionals.length !== 1) throw new Error('dashboard needs a manifest.json path.');
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port must be between 0 and 65535.');
    return { command, manifest: positionals[0], port };
  }
  if (command === 'install-browser' && positionals.length) throw new Error('install-browser takes no arguments.');
  return { command, urls: positionals };
}
