import path from 'node:path';
import { config } from 'dotenv';

// Resolved against this module, not process.cwd(): `npm --prefix server start`,
// pm2 and systemd all run with a different working directory, and a cwd-relative
// path would silently load nothing — the server would then answer `routes: []`
// and 400 every call with no diagnostic.
//
// override: true is Mugah parity — the repo .env is the single source of truth
// for these keys, so it wins over whatever happens to be exported in the shell.
config({ path: path.resolve(import.meta.dirname, '../../.env'), override: true });
