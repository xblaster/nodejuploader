const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const crypto = require('crypto');

const app = express();
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
        const buffer = Buffer.from(d, 'base64url');

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
    return res.status(404).json({ state: 'not_found' });
});

/**
 * GET /file/:fid
 * Download the file.
 */
app.get('/file/:fid', async (req, res) => {
    const { fid } = req.params;
    const finalPath = path.join(UPLOAD_DIR, `${fid}.bin`);

    if (!await fs.pathExists(finalPath)) {
        return res.status(410).send('Gone or Not Found');
    }

    res.download(finalPath, `${fid}.bin`);
});


// --- Helpers ---

async function assembleFile(fid, totalChunks, expectedHash) {
    if (process.env.NODE_ENV === 'test') {
        console.log("Mock assembly for test");
        return;
    }

    console.log(`Starting assembly for ${fid}`);
    const fileDir = path.join(UPLOAD_DIR, fid);
    const finalPath = path.join(UPLOAD_DIR, `${fid}.bin`);
    const metaPath = path.join(UPLOAD_DIR, `${fid}.meta.json`);

    const files = await fs.readdir(fileDir);
    if (files.length !== totalChunks) {
        console.log(`Not all chunks present for ${fid} (${files.length}/${totalChunks}).`);
        return;
    }

    files.sort((a, b) => parseInt(a) - parseInt(b));

    const writeStream = fs.createWriteStream(finalPath);
    const hash = crypto.createHash('sha256');

    for (const file of files) {
        const p = path.join(fileDir, file);
        const buffer = await fs.readFile(p);
        writeStream.write(buffer);
        hash.update(buffer);
    }

    writeStream.end();

    writeStream.on('finish', async () => {
        const computedHash = hash.digest('hex');
        if (computedHash === expectedHash) {
            console.log(`Assembly valid for ${fid}`);
            await fs.writeJson(metaPath, { originalName: 'unknown', ready: true });
            await fs.remove(fileDir);
        } else {
            console.error(`Hash mismatch for ${fid}. Expected ${expectedHash}, got ${computedHash}`);
            await fs.remove(finalPath);
            await fs.remove(fileDir);
        }
    });
}

// --- Cron Jobs ---
// Only start if not in test env
if (process.env.NODE_ENV !== 'test') {
    cron.schedule('0 * * * *', async () => {
        console.log('Running cleanup...');
        const now = Date.now();
        const cleanDir = async (dir) => {
            const stat = await fs.stat(path.join(UPLOAD_DIR, dir));
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
}

module.exports = app;
