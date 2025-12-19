import '@testing-library/jest-dom';

// Polyfill for Blob.arrayBuffer() which is not available in jsdom
if (typeof Blob.prototype.arrayBuffer === 'undefined') {
    Blob.prototype.arrayBuffer = function () {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
                resolve(reader.result as ArrayBuffer);
            };
            reader.readAsArrayBuffer(this);
        });
    };
}

// Polyfill for File API if needed
if (typeof File === 'undefined') {
    (global as any).File = class File extends Blob {
        name: string;
        lastModified: number;

        constructor(bits: BlobPart[], name: string, options?: FilePropertyBag) {
            super(bits, options);
            this.name = name;
            this.lastModified = options?.lastModified || Date.now();
        }
    };
}
