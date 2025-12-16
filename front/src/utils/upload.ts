import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_Base = 'http://localhost:8080';

// Note: Spec says 1KB chunk size. 
// "Taille fixe chunkSize = 1024 o"
const CHUNK_SIZE = 1024;

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    // btoa gives standard Base64.
    // Replace + with -, / with _, and remove =
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export interface UploadProgress {
    totalChunks: number;
    sentChunks: number;
    status: 'hashing' | 'uploading' | 'assembling' | 'ready' | 'error';
    downloadUrl?: string;
}

export async function uploadFile(
    file: File,
    hash: string,
    onProgress: (state: UploadProgress) => void
): Promise<void> {
    const fileId = uuidv4();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // Initial State
    onProgress({ totalChunks, sentChunks: 0, status: 'uploading' });

    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunkBlob = file.slice(start, end);

        // Read chunk as ArrayBuffer to convert to Base64URL
        const buffer = await chunkBlob.arrayBuffer();
        const base64Data = arrayBufferToBase64Url(buffer);

        // GET /upload parameters
        // fid={uuid}&i={i}&t={total}&h={sha256}&d={base64URL(chunk)}
        const params = new URLSearchParams({
            fid: fileId,
            i: i.toString(),
            t: totalChunks.toString(),
            h: hash,
            d: base64Data
        });

        // Check URL length constraint (8192)
        // Base URL + params length. 
        // 1KB data -> ~1366 base64 chars. URL should be fine (~1.5KB).

        try {
            await axios.get(`${API_Base}/upload?${params.toString()}`);
            onProgress({ totalChunks, sentChunks: i + 1, status: 'uploading' });
        } catch (err: any) {
            console.error(err);
            // Simple retry logic could go here, for now fail
            onProgress({ totalChunks, sentChunks: i, status: 'error' });
            throw err;
        }
    }

    // Upload finished, poll for status
    onProgress({ totalChunks, sentChunks: totalChunks, status: 'assembling' });

    const pollInterval = setInterval(async () => {
        try {
            const res = await axios.get(`${API_Base}/status?fid=${fileId}`);
            if (res.data.state === 'ready') {
                clearInterval(pollInterval);
                onProgress({
                    totalChunks,
                    sentChunks: totalChunks,
                    status: 'ready',
                    downloadUrl: `${API_Base}${res.data.downloadUrl}`
                });
            } else if (res.data.state === 'error' || res.data.state === 'not_found') {
                // Eventually timeout?
            }
        } catch (e) {
            console.error("Polling error", e);
        }
    }, 1000);
}
