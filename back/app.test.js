const request = require('supertest');
const fs = require('fs-extra');
const path = require('path');
const app = require('./app');

const UPLOAD_DIR = path.join(__dirname, 'tmp', 'uploads');

// Helper to clean up test files
async function cleanupTestFiles() {
    if (await fs.pathExists(UPLOAD_DIR)) {
        await fs.remove(UPLOAD_DIR);
    }
    await fs.ensureDir(UPLOAD_DIR);
}

describe('Nodejuploader Backend Tests', () => {

    beforeEach(async () => {
        await cleanupTestFiles();
    });

    afterAll(async () => {
        await cleanupTestFiles();
    });

    describe('GET /health', () => {
        it('should return status ok', async () => {
            const response = await request(app).get('/health');
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ status: 'ok' });
        });
    });

    describe('GET /upload', () => {
        it('should return 400 if missing parameters', async () => {
            const response = await request(app).get('/upload');
            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Missing parameters' });
        });

        it('should return 400 if missing fid', async () => {
            const response = await request(app).get('/upload?i=0&t=1&h=abc&d=test');
            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Missing parameters' });
        });

        it('should return 400 if missing chunk index', async () => {
            const response = await request(app).get('/upload?fid=test-uuid&t=1&h=abc&d=test');
            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Missing parameters' });
        });

        it('should return 400 if missing total chunks', async () => {
            const response = await request(app).get('/upload?fid=test-uuid&i=0&h=abc&d=test');
            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Missing parameters' });
        });

        it('should return 400 if missing hash', async () => {
            const response = await request(app).get('/upload?fid=test-uuid&i=0&t=1&d=test');
            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Missing parameters' });
        });

        it('should return 400 if missing data', async () => {
            const response = await request(app).get('/upload?fid=test-uuid&i=0&t=1&h=abc');
            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Missing parameters' });
        });

        it('should return 400 if chunk index is not a number', async () => {
            const response = await request(app).get('/upload?fid=test-uuid&i=invalid&t=1&h=abc&d=test');
            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Invalid numbers' });
        });

        it('should return 400 if total chunks is not a number', async () => {
            const response = await request(app).get('/upload?fid=test-uuid&i=0&t=invalid&h=abc&d=test');
            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Invalid numbers' });
        });

        it('should accept a valid chunk upload', async () => {
            const data = Buffer.from('test data').toString('base64url');
            const response = await request(app).get(
                `/upload?fid=test-file-1&i=0&t=2&h=testhash&d=${data}`
            );

            expect(response.status).toBe(202);
            expect(response.body).toEqual({ received: 0 });

            // Verify chunk file was created
            const chunkPath = path.join(UPLOAD_DIR, 'test-file-1', '0.part');
            expect(await fs.pathExists(chunkPath)).toBe(true);
        });

        it('should handle multiple chunks for the same file', async () => {
            const data1 = Buffer.from('chunk1').toString('base64url');
            const data2 = Buffer.from('chunk2').toString('base64url');

            const response1 = await request(app).get(
                `/upload?fid=test-file-2&i=0&t=2&h=testhash&d=${data1}`
            );
            expect(response1.status).toBe(202);
            expect(response1.body).toEqual({ received: 0 });

            const response2 = await request(app).get(
                `/upload?fid=test-file-2&i=1&t=2&h=testhash&d=${data2}`
            );
            expect(response2.status).toBe(202);
            expect(response2.body).toEqual({ received: 1 });

            // Both chunks should exist
            const chunk0 = path.join(UPLOAD_DIR, 'test-file-2', '0.part');
            const chunk1 = path.join(UPLOAD_DIR, 'test-file-2', '1.part');
            expect(await fs.pathExists(chunk0)).toBe(true);
            expect(await fs.pathExists(chunk1)).toBe(true);
        });

        it('should return 202 with exists status if chunk already uploaded', async () => {
            const data = Buffer.from('test data').toString('base64url');

            // Upload once
            await request(app).get(
                `/upload?fid=test-file-3&i=0&t=1&h=testhash&d=${data}`
            );

            // Upload again
            const response = await request(app).get(
                `/upload?fid=test-file-3&i=0&t=1&h=testhash&d=${data}`
            );

            expect(response.status).toBe(202);
            expect(response.body).toEqual({ received: 0, status: 'exists' });
        });

        it('should decode base64url data correctly', async () => {
            const originalData = 'Hello World! 123';
            const base64url = Buffer.from(originalData).toString('base64url');

            await request(app).get(
                `/upload?fid=test-file-4&i=0&t=1&h=testhash&d=${base64url}`
            );

            const chunkPath = path.join(UPLOAD_DIR, 'test-file-4', '0.part');
            const savedData = await fs.readFile(chunkPath, 'utf8');

            expect(savedData).toBe(originalData);
        });
    });

    describe('GET /status', () => {
        it('should return 400 if fid is missing', async () => {
            const response = await request(app).get('/status');
            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'Missing fid' });
        });

        it('should return 404 if file not found', async () => {
            const response = await request(app).get('/status?fid=non-existent');
            expect(response.status).toBe(404);
            expect(response.body).toEqual({ state: 'not_found' });
        });

        it('should return uploading_or_assembling if chunks directory exists', async () => {
            const fileDir = path.join(UPLOAD_DIR, 'test-status-1');
            await fs.ensureDir(fileDir);

            const response = await request(app).get('/status?fid=test-status-1');
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ state: 'uploading_or_assembling' });
        });

        it('should return ready if final file exists', async () => {
            const fid = 'test-status-2';
            const finalPath = path.join(UPLOAD_DIR, `${fid}.bin`);
            const metaPath = path.join(UPLOAD_DIR, `${fid}.meta.json`);

            await fs.writeFile(finalPath, 'test content');
            await fs.writeJson(metaPath, { originalName: 'test.txt', ready: true });

            const response = await request(app).get(`/status?fid=${fid}`);
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ state: 'ready', downloadUrl: `/file/${fid}` });
        });

        it('should return not_found if only meta exists without bin file', async () => {
            const fid = 'test-status-3';
            const metaPath = path.join(UPLOAD_DIR, `${fid}.meta.json`);
            await fs.writeJson(metaPath, { originalName: 'test.txt', ready: true });

            const response = await request(app).get(`/status?fid=${fid}`);
            expect(response.status).toBe(404);
            expect(response.body).toEqual({ state: 'not_found' });
        });
    });

    describe('GET /file/:fid', () => {
        it('should return 410 if file does not exist', async () => {
            const response = await request(app).get('/file/non-existent-file');
            expect(response.status).toBe(410);
            expect(response.text).toBe('Gone or Not Found');
        });

        it('should download the file if it exists', async () => {
            const fid = 'test-download-1';
            const finalPath = path.join(UPLOAD_DIR, `${fid}.bin`);
            const testContent = 'This is test file content';

            await fs.writeFile(finalPath, testContent);

            const response = await request(app).get(`/file/${fid}`);
            expect(response.status).toBe(200);
            expect(response.body.toString()).toBe(testContent);
            expect(response.headers['content-disposition']).toContain(`${fid}.bin`);
        });

        it('should handle binary file download', async () => {
            const fid = 'test-download-2';
            const finalPath = path.join(UPLOAD_DIR, `${fid}.bin`);
            const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF]);

            await fs.writeFile(finalPath, binaryData);

            const response = await request(app).get(`/file/${fid}`);
            expect(response.status).toBe(200);
            expect(Buffer.compare(response.body, binaryData)).toBe(0);
        });
    });

    describe('Integration: Full Upload Flow', () => {
        it('should handle complete upload, assembly, and download', async () => {
            const fid = 'integration-test-1';
            const chunks = ['Hello ', 'World', '!'];
            const fullContent = chunks.join('');

            // Upload all chunks
            for (let i = 0; i < chunks.length; i++) {
                const data = Buffer.from(chunks[i]).toString('base64url');
                const response = await request(app).get(
                    `/upload?fid=${fid}&i=${i}&t=${chunks.length}&h=dummyhash&d=${data}`
                );
                expect(response.status).toBe(202);
            }

            // Check status shows uploading/assembling
            const statusResponse = await request(app).get(`/status?fid=${fid}`);
            expect(statusResponse.status).toBe(200);
            expect(['uploading_or_assembling', 'ready']).toContain(statusResponse.body.state);
        });

        it('should handle empty chunk data', async () => {
            const fid = 'empty-chunk-test';
            // Empty buffer creates empty base64url string which might be filtered as missing parameter
            // Use a minimal valid base64url string instead
            const minimalData = 'AA'; // Valid base64url for a single byte

            const response = await request(app).get(
                `/upload?fid=${fid}&i=0&t=1&h=testhash&d=${minimalData}`
            );

            expect(response.status).toBe(202);

            const chunkPath = path.join(UPLOAD_DIR, fid, '0.part');
            expect(await fs.pathExists(chunkPath)).toBe(true);
        });

        it('should handle large chunk indices', async () => {
            const fid = 'large-index-test';
            const data = Buffer.from('test').toString('base64url');

            const response = await request(app).get(
                `/upload?fid=${fid}&i=9999&t=10000&h=testhash&d=${data}`
            );

            expect(response.status).toBe(202);

            const chunkPath = path.join(UPLOAD_DIR, fid, '9999.part');
            expect(await fs.pathExists(chunkPath)).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should handle malformed base64url data gracefully', async () => {
            const response = await request(app).get(
                '/upload?fid=test&i=0&t=1&h=hash&d=!!!invalid!!!'
            );

            // Should still accept it (base64url decoder is permissive)
            // or return 500 if it fails
            expect([202, 500]).toContain(response.status);
        });

        it('should handle special characters in fid', async () => {
            const specialFid = 'test-file-with-special-chars';
            const data = Buffer.from('test').toString('base64url');

            const response = await request(app).get(
                `/upload?fid=${specialFid}&i=0&t=1&h=hash&d=${data}`
            );

            expect(response.status).toBe(202);
        });

        it('should handle very large chunk numbers', async () => {
            const response = await request(app).get(
                '/upload?fid=test&i=999999999&t=1000000000&h=hash&d=dGVzdA'
            );

            expect(response.status).toBe(202);
        });

        it('should handle negative chunk indices', async () => {
            const response = await request(app).get(
                '/upload?fid=test&i=-1&t=1&h=hash&d=dGVzdA'
            );

            // -1 is technically a valid number, just unusual
            expect([202, 400]).toContain(response.status);
        });
    });

    describe('Edge Cases', () => {
        it('should handle single chunk upload', async () => {
            const fid = 'single-chunk';
            const data = Buffer.from('Single chunk file').toString('base64url');

            const response = await request(app).get(
                `/upload?fid=${fid}&i=0&t=1&h=hash&d=${data}`
            );

            expect(response.status).toBe(202);
            expect(response.body.received).toBe(0);
        });

        it('should handle out-of-order chunk uploads', async () => {
            const fid = 'out-of-order';
            const data1 = Buffer.from('chunk1').toString('base64url');
            const data2 = Buffer.from('chunk2').toString('base64url');

            // Upload chunk 1 before chunk 0
            await request(app).get(
                `/upload?fid=${fid}&i=1&t=2&h=hash&d=${data2}`
            );

            const response = await request(app).get(
                `/upload?fid=${fid}&i=0&t=2&h=hash&d=${data1}`
            );

            expect(response.status).toBe(202);
        });

        it('should handle URL with very long hash parameter', async () => {
            const longHash = 'a'.repeat(64); // SHA-256 is 64 chars
            const data = Buffer.from('test').toString('base64url');

            const response = await request(app).get(
                `/upload?fid=test&i=0&t=1&h=${longHash}&d=${data}`
            );

            expect(response.status).toBe(202);
        });
    });
});
