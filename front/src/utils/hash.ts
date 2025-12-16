import CryptoJS from 'crypto-js';

export async function calculateFileHash(file: File, onProgress: (progress: number) => void): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunkSize = 1024 * 1024 * 2; // 2MB chunks for hashing
        const chunks = Math.ceil(file.size / chunkSize);
        let currentChunk = 0;
        const sha256 = CryptoJS.algo.SHA256.create();
        const reader = new FileReader();

        reader.onload = function (e) {
            if (!e.target?.result) return;

            const arrayBuffer = e.target.result as ArrayBuffer;
            const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer as any); // Type cast for simplicity, CryptoJS supports ArrayBuffer

            sha256.update(wordArray);

            currentChunk++;
            onProgress(currentChunk / chunks);

            if (currentChunk < chunks) {
                loadNext();
            } else {
                resolve(sha256.finalize().toString());
            }
        };

        reader.onerror = reject;

        function loadNext() {
            const start = currentChunk * chunkSize;
            const end = ((start + chunkSize) >= file.size) ? file.size : start + chunkSize;
            reader.readAsArrayBuffer(file.slice(start, end));
        }

        loadNext();
    });
}
