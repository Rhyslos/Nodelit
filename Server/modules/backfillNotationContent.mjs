// import modules
import * as Y from 'yjs';
import db from '../database/Database.mjs';
import { closePool } from '../database/Pool.mjs';
import { documentText } from './Collaboration.mjs';

// backfill functions
async function backfillPage(pageID) {
    const record = await db.getNotationDocument(pageID);
    if (!record?.state) return false;

    const doc = new Y.Doc();

    try {
        Y.applyUpdate(doc, new Uint8Array(record.state));
    } catch (error) {
        console.error(`Skipped ${pageID}: ${error.message}`);
        doc.destroy();
        return false;
    }

    const content = documentText(doc);
    doc.destroy();

    if (content === record.content) return false;

    await db.saveNotationDocumentContent(pageID, content);
    return true;
}

async function main() {
    const pageIDs = await db.listNotationDocumentIDs();
    let updated = 0;

    for (const pageID of pageIDs) {
        if (await backfillPage(pageID)) updated += 1;
    }

    console.log(`Backfilled ${updated} of ${pageIDs.length} notation documents`);
}

main()
    .catch(error => {
        console.error('Backfill failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closePool();
        process.exit();
    });
