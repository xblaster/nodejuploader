import { describe, it, expect, vi } from 'vitest';
import { calculateFileHash } from './utils/hash';

// Mock dependencies
vi.mock('crypto-js', () => {
    return {
        default: {
            algo: {
                SHA256: {
                    create: () => ({
                        update: vi.fn(),
                        finalize: () => ({ toString: () => 'mock-hash' })
                    })
                }
            },
            lib: {
                WordArray: { create: vi.fn() }
            }
        }
    };
});


describe('Frontend Logic', () => {
    it('calculateFileHash should return a hash', async () => {
        // Mock FileReader
        const mockFileReader = {
            readAsArrayBuffer: vi.fn(function (this: any) {
                this.onload({ target: { result: new ArrayBuffer(8) } });
            }),
            onload: vi.fn(),
            onerror: vi.fn()
        };

        // Stub global FileReader
        vi.stubGlobal('FileReader', vi.fn(() => mockFileReader));

        const file = new File(['content'], 'test.txt', { type: 'text/plain' });
        const onProgress = vi.fn();

        const hash = await calculateFileHash(file, onProgress);
        expect(hash).toBe('mock-hash');
        expect(onProgress).toHaveBeenCalled();

        vi.unstubAllGlobals();
    });
});
