// schema guard: schema.sql runs on every deploy against production, so it may only add things.
// Anything that could remove or rewrite existing data is rejected before the script runs.

// configuration constants
const ALWAYS_FORBIDDEN = [
    { pattern: /\bDROP\b/i, reason: 'DROP removes tables, columns, indexes or constraints' },
    { pattern: /\bTRUNCATE\b/i, reason: 'TRUNCATE empties a table' },
    { pattern: /\bDELETE\s+FROM\b/i, reason: 'DELETE removes rows' },
    { pattern: /\bRENAME\b/i, reason: 'RENAME breaks the running app and old backups' },
    { pattern: /\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i, reason: 'changing a column type can rewrite or lose data' }
];

// UPDATE is only allowed inside a run-once step, so a data fix can never repeat on every boot
const UPDATE_PATTERN = /(?<!\bON\s+)\bUPDATE\s+(?!CASCADE\b|SET\s+(NULL|DEFAULT)\b|RESTRICT\b|NO\s+ACTION\b)/i;
const DO_BLOCK = /\bDO\s+\$(\w*)\$([\s\S]*?)\$\1\$/gi;
const RUN_ONCE = /\bpg_temp\.run_once\s*\(/i;

// utility functions
function stripComments(sql) {
    return sql
        .replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '))
        .replace(/--[^\n]*/g, match => ' '.repeat(match.length));
}

function lineOf(text, index) {
    return text.slice(0, index).split('\n').length;
}

function findAll(text, rules, problems) {
    for (const { pattern, reason } of rules) {
        const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);

        for (const match of text.matchAll(global)) {
            const line = lineOf(text, match.index);
            const snippet = text.split('\n')[line - 1].trim().slice(0, 100);
            problems.push(`line ${line}: ${reason}: ${snippet}`);
        }
    }
}

// main functions
export function checkSchema(sql) {
    const problems = [];
    let text = stripComments(sql);

    // run-once steps may UPDATE, but still may not DROP, DELETE and so on
    text = text.replace(DO_BLOCK, (block, tag, body, offset) => {
        if (!RUN_ONCE.test(body)) return block;

        const prefix = text.slice(0, offset).replace(/[^\n]/g, ' ');
        findAll(prefix + block, ALWAYS_FORBIDDEN, problems);

        return block.replace(/[^\n]/g, ' ');
    });

    findAll(text, [...ALWAYS_FORBIDDEN, { pattern: UPDATE_PATTERN, reason: 'UPDATE outside a run-once step would run on every deploy' }], problems);

    return [...new Set(problems)].sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
}

export function assertSchemaSafe(sql) {
    const problems = checkSchema(sql);
    if (problems.length === 0) return;

    throw new Error(
        `schema.sql contains statements that could change or remove production data, so it was not run:\n  ${problems.join('\n  ')}\n`
        + 'Only additive changes are allowed. Put one-off data fixes inside IF pg_temp.run_once(\'<id>\') THEN ... END IF.'
    );
}
