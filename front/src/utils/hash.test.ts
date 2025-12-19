import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateFileHash } from './hash';
import CryptoJS from 'crypto-js';

describe('hash.ts', () => {
    describe('calculateFileHash', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should calculate hash for a small file', async () => {
            const content = 'Hello World';
            const file = new File([content], 'test.txt', { type: 'text/plain' });
            const progressUpdates: number[] = [];

            const hash = await calculateFileHash(file, (progress) => {
                progressUpdates.push(progress);
            });

            expect(hash).toBeDefined();
            expect(typeof hash).toBe('string');
            expect(hash.length).toBeGreaterThan(0);

            // Progress should have been called at least once
            expect(progressUpdates.length).toBeGreaterThan(0);
            // Final progress should be 1 (100%)
            expect(progressUpdates[progressUpdates.length - 1]).toBe(1);
        });

        it('should calculate hash for a large file in chunks', async () => {
            // Create a file larger than chunk size (2MB chunks)
            const largeContent = 'A'.repeat(5 * 1024 * 1024); // 5MB
            const file = new File([largeContent], 'large.txt');
            const progressUpdates: number[] = [];

            const hash = await calculateFileHash(file, (progress) => {
                progressUpdates.push(progress);
            });

            expect(hash).toBeDefined();
            expect(typeof hash).toBe('string');

            // Should have multiple progress updates for large file
            // 5MB / 2MB chunks = 3 chunks
            expect(progressUpdates.length).toBeGreaterThanOrEqual(3);

            // Progress should increase monotonically
            for (let i = 1; i < progressUpdates.length; i++) {
                expect(progressUpdates[i]).toBeGreaterThanOrEqual(progressUpdates[i - 1]);
            }

            // Final progress should be 1
            expect(progressUpdates[progressUpdates.length - 1]).toBe(1);
        });

        it('should produce consistent hash for same content', async () => {
            const content = 'Consistent content for hashing';
            const file1 = new File([content], 'file1.txt');
            const file2 = new File([content], 'file2.txt');

            const hash1 = await calculateFileHash(file1, () => {});
            const hash2 = await calculateFileHash(file2, () => {});

            expect(hash1).toBe(hash2);
        });

        it('should produce different hashes for different content', async () => {
            const file1 = new File(['Content A'], 'file1.txt');
            const file2 = new File(['Content B'], 'file2.txt');

            const hash1 = await calculateFileHash(file1, () => {});
            const hash2 = await calculateFileHash(file2, () => {});

            expect(hash1).not.toBe(hash2);
        });

        it('should handle empty file', async () => {
            const emptyFile = new File([], 'empty.txt');
            const progressUpdates: number[] = [];

            const hash = await calculateFileHash(emptyFile, (p) => progressUpdates.push(p));

            expect(hash).toBeDefined();
            expect(typeof hash).toBe('string');
            expect(progressUpdates.length).toBeGreaterThan(0);
        });

        it('should handle binary data correctly', async () => {
            const binaryData = new Uint8Array([0, 1, 2, 255, 254, 253]);
            const file = new File([binaryData], 'binary.bin');

            const hash = await calculateFileHash(file, () => {});

            expect(hash).toBeDefined();
            expect(typeof hash).toBe('string');
            // SHA-256 produces 64 character hex string
            expect(hash.length).toBe(64);
        });

        it('should report progress between 0 and 1', async () => {
            const content = 'A'.repeat(3 * 1024 * 1024); // 3MB
            const file = new File([content], 'file.txt');
            const progressUpdates: number[] = [];

            await calculateFileHash(file, (p) => progressUpdates.push(p));

            for (const progress of progressUpdates) {
                expect(progress).toBeGreaterThanOrEqual(0);
                expect(progress).toBeLessThanOrEqual(1);
            }
        });

        it('should handle file with exact chunk size', async () => {
            const exactSize = 2 * 1024 * 1024; // Exactly 2MB
            const content = 'B'.repeat(exactSize);
            const file = new File([content], 'exact.txt');
            const progressUpdates: number[] = [];

            const hash = await calculateFileHash(file, (p) => progressUpdates.push(p));

            expect(hash).toBeDefined();
            // Should process in 1 chunk
            expect(progressUpdates.length).toBeGreaterThan(0);
            expect(progressUpdates[progressUpdates.length - 1]).toBe(1);
        });

        it('should handle special characters', async () => {
            const specialContent = 'Hello 世界 🌍 Special: !@#$%^&*()';
            const file = new File([specialContent], 'special.txt');

            const hash = await calculateFileHash(file, () => {});

            expect(hash).toBeDefined();
            expect(hash.length).toBe(64);
        });

        it('should handle very large files', async () => {
            // Simulate a 10MB file
            const largeContent = 'X'.repeat(10 * 1024 * 1024);
            const file = new File([largeContent], 'huge.bin');
            const progressUpdates: number[] = [];

            const hash = await calculateFileHash(file, (p) => progressUpdates.push(p));

            expect(hash).toBeDefined();
            // 10MB / 2MB = 5 chunks
            expect(progressUpdates.length).toBeGreaterThanOrEqual(5);
        });

        it('should produce valid SHA-256 format', async () => {
            const file = new File(['test content'], 'test.txt');

            const hash = await calculateFileHash(file, () => {});

            // SHA-256 is 64 hex characters
            expect(hash).toMatch(/^[a-f0-9]{64}$/);
        });

        it('should call progress callback multiple times for chunked files', async () => {
            const content = 'C'.repeat(4 * 1024 * 1024); // 4MB = 2 chunks
            const file = new File([content], 'file.txt');
            let callCount = 0;

            await calculateFileHash(file, () => {
                callCount++;
            });

            expect(callCount).toBeGreaterThanOrEqual(2);
        });

        it('should handle file with metadata', async () => {
            const file = new File(['content'], 'file.txt', {
                type: 'text/plain',
                lastModified: Date.now()
            });

            const hash = await calculateFileHash(file, () => {});

            expect(hash).toBeDefined();
            expect(hash.length).toBe(64);
        });

        it('should reject on FileReader error', async () => {
            const file = new File(['test'], 'test.txt');

            // Mock FileReader to trigger error
            const originalFileReader = global.FileReader;
            const mockFileReader = vi.fn().mockImplementation(() => {
                const reader = {
                    readAsArrayBuffer: vi.fn(function (this: any) {
                        setTimeout(() => {
                            if (this.onerror) {
                                this.onerror(new Error('Read error'));
                            }
                        }, 0);
                    }),
                    onload: null,
                    onerror: null
                };
                return reader;
            });

            global.FileReader = mockFileReader as any;

            await expect(
                calculateFileHash(file, () => {})
            ).rejects.toThrow();

            global.FileReader = originalFileReader;
        });

        it('should handle file size not divisible by chunk size', async () => {
            // 3.5MB file (not evenly divisible by 2MB chunks)
            const oddSize = (3.5 * 1024 * 1024);
            const content = 'D'.repeat(Math.floor(oddSize));
            const file = new File([content], 'odd.bin');
            const progressUpdates: number[] = [];

            const hash = await calculateFileHash(file, (p) => progressUpdates.push(p));

            expect(hash).toBeDefined();
            // Should process in 2 chunks (1.75 rounds up to 2)
            expect(progressUpdates.length).toBeGreaterThanOrEqual(2);
            expect(progressUpdates[progressUpdates.length - 1]).toBe(1);
        });
    });
});
