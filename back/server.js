const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8080;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'tmp', 'uploads');

// Middleware
app.use(cors());

// Ensure upload directory exists
fs.ensureDirSync(UPLOAD_DIR);

// --- Endpoints ---

/**
 * GET /health
 * Liveness probe
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

/**
 * GET /upload
 * Receives a chunk of the file.
 * Query params:
 *  - fid: file UUID
 *  - i: chunk index (0-based)
 *  - t: total chunks
 *  - h: file SHA-256 hash
 *  - d: base64URL encoded data
 */
app.get('/upload', async (req, res) => {
    try {
        const { fid, i, t, h, d } = req.query;

        if (!fid || !i || !t || !h || !d) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const chunkIndex = parseInt(i, 10);
        const totalChunks = parseInt(t, 10);

        // Basic validation
        if (isNaN(chunkIndex) || isNaN(totalChunks)) {
            return res.status(400).json({ error: 'Invalid numbers' });
        }

        const fileDir = path.join(UPLOAD_DIR, fid);
        await fs.ensureDir(fileDir);

        const chunkPath = path.join(fileDir, `${chunkIndex}.part`);

        // Decode data (Base64URL)
        // Note: Node's Buffer.from supports base64url since v14.18+
        const buffer = Buffer.from(d, 'base64url');

        // Write chunk
        // using 'wx' flag to fail if exists (idempotency/security check? spec says O_EXCL)
        // But for idempotency, if it exists and is same, maybe we should output 202 OK?
        // Spec says "O_EXCL pour idempotence", implies we want to avoid overwriting or parallel writes of same chunk?
        // Actually if request is retried, we might want to allow writing if content is same, or just ignore.
        // For strict O_EXCL compliance:
        try {
            await fs.writeFile(chunkPath, buffer, { flag: 'wx' });
        } catch (err) {
            if (err.code === 'EEXIST') {
                // Chunk already received, just ack
                return res.status(202).json({ received: chunkIndex, status: 'exists' });
            }
            throw err;
        }

        // Check if connection is done
        const files = await fs.readdir(fileDir);
        if (files.length === totalChunks) {
            // Trigger assembly (async)
            assembleFile(fid, totalChunks, h).catch(err => console.error(`Assembly error for ${fid}:`, err));
        }

        res.status(202).json({ received: chunkIndex });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * GET /status
 * Checks the status of the file assembly.
 */
app.get('/status', async (req, res) => {
    const { fid } = req.query;
    if (!fid) return res.status(400).json({ error: 'Missing fid' });

    const finalPath = path.join(UPLOAD_DIR, `${fid}.bin`);
    const metaPath = path.join(UPLOAD_DIR, `${fid}.meta.json`);

    if (await fs.pathExists(finalPath) && await fs.pathExists(metaPath)) {
        return res.json({ state: 'ready', downloadUrl: `/file/${fid}` });
    }

    // Check if still uploading (dir exists)
    const fileDir = path.join(UPLOAD_DIR, fid);
    if (await fs.pathExists(fileDir)) {
        return res.json({ state: 'uploading_or_assembling' });
    }

    // Check if expired/gone
    // If neither exists, it's 404 or expired
    return res.status(404).json({ state: 'not_found' });
});

/**
 * GET /file/:fid
 * Download the file.
 */
app.get('/file/:fid', async (req, res) => {
    const { fid } = req.params;
    const finalPath = path.join(UPLOAD_DIR, `${fid}.bin`);
    const metaPath = path.join(UPLOAD_DIR, `${fid}.meta.json`); // To store original filename if needed?

    if (!await fs.pathExists(finalPath)) {
        return res.status(410).send('Gone or Not Found');
    }

    // We should probably store/retrieve original filename.
    // Spec says: Content-Disposition: attachment; filename="{originalName}"
    // But we didn't receive originalName in /upload. 
    // Wait, spec 4.2.3 says {originalName}, but 4.2.1 params don't list it.
    // I should probably ask client to send metadata in a separate call or specific chunk?
    // Or maybe the spec implies we don't care about filename?
    // Spec 3.2.1: ... GET /upload? ...
    // Hmmm. 
    // I will look at the provided specs again in detail. 
    // Spec 4.2.3: "Content-Disposition: attachment; filename="{originalName}""
    // But 4.2.1 inputs only have: fid, i, t, h, d.
    // MAYBE the filename is transmitted in a standard "initialization" step or I should just use the fid.
    // Actually, section 5 says format of chunk...
    // Let's assume for now I use "download.bin" or just ID, unless I find where to get the name.

    // Actually, I can support a "meta" query param on chunk 0 ?? Or strict spec adherence?
    // "Init (client) -> génère fid".
    // I will use "file.bin" for now and comment on this gap.

    res.download(finalPath, `${fid}.bin`); // Express handles Content-Disposition
});


// --- Helpers ---

async function assembleFile(fid, totalChunks, expectedHash) {
    console.log(`Starting assembly for ${fid}`);
    const fileDir = path.join(UPLOAD_DIR, fid);
    const finalPath = path.join(UPLOAD_DIR, `${fid}.bin`);
    const metaPath = path.join(UPLOAD_DIR, `${fid}.meta.json`); // To mark as ready

    // Verify all chunks exist
    const files = await fs.readdir(fileDir);
    if (files.length !== totalChunks) {
        // Not ready yet (maybe out of order chunks)
        // In a real system we would retry or wait.
        // Here we just abort assembly if not all files are there?
        // But this function is called when i === t-1 (last INDEX sent, not necessarily last ARRIVED).
        // So we might need to check count.
        console.log(`Not all chunks present for ${fid} (${files.length}/${totalChunks}). Waiting?`);
        return;
        // NOTE: If chunks arrive out of order, the one with index t-1 might not be the last one written.
        // We should check file count on EVERY chunk if we want robustness, or handle this smarter.
        // BUT for MVP logic let's just re-check count.
    }

    // Sort files by index
    // files are named "0.part", "1.part"...
    // Sort numerically.
    files.sort((a, b) => parseInt(a) - parseInt(b));

    // Create write stream
    const writeStream = fs.createWriteStream(finalPath);
    const hash = crypto.createHash('sha256');

    for (const file of files) {
        const p = path.join(fileDir, file);
        const buffer = await fs.readFile(p); // Load chunk to memory (1KB is tiny)
        writeStream.write(buffer);
        hash.update(buffer);
    }

    writeStream.end();

    writeStream.on('finish', async () => {
        const computedHash = hash.digest('hex');
        if (computedHash === expectedHash) {
            console.log(`Assembly valid for ${fid}`);
            await fs.writeJson(metaPath, { originalName: 'unknown', ready: true });
            // Cleanup parts
            await fs.remove(fileDir);
        } else {
            console.error(`Hash mismatch for ${fid}. Expected ${expectedHash}, got ${computedHash}`);
            // Delete corrupt file
            await fs.remove(finalPath);
            // Optionally remove parts or keep for debugging? Spec says nothing. Clean up.
            await fs.remove(fileDir);
        }
    });
}

// --- Cron Jobs ---
// Clean up old files (24h)
cron.schedule('0 * * * *', async () => {
    console.log('Running cleanup...');
    const now = Date.now();
    const cleanDir = async (dir) => {
        const stat = await fs.stat(path.join(UPLOAD_DIR, dir));
        // If older than 24h
        if (now - stat.mtimeMs > 24 * 60 * 60 * 1000) {
            await fs.remove(path.join(UPLOAD_DIR, dir));
        }
    };

    if (await fs.pathExists(UPLOAD_DIR)) {
        const dirs = await fs.readdir(UPLOAD_DIR);
        for (const d of dirs) {
            await cleanDir(d);
        }
    }
});


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
