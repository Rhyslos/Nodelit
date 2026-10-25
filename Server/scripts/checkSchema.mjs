// checks schema.sql for anything that could change or remove production data; used by CI
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSchema } from '../modules/SchemaGuard.mjs';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'database', 'schema.sql');
const problems = checkSchema(await readFile(file, 'utf8'));

if (problems.length > 0) {
    console.error(`schema.sql is not additive-only:\n  ${problems.join('\n  ')}`);
    process.exit(1);
}

console.log('schema.sql is additive-only');
