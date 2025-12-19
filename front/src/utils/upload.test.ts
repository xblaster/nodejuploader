import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { uploadFile, UploadProgress } from './upload';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock uuid
vi.mock('uuid', () => ({
    v4: () => 'test-uuid-1234'
}));

describe('upload.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    describe('uploadFile', () => {
        it('should upload a single chunk file successfully', async () => {
            const testFile = new File(['test'], 'test.txt', { type: 'text/plain' });
            const hash = 'testhash123';
            const progressUpdates: UploadProgress[] = [];
            const onProgress = (progress: UploadProgress) => {
                progressUpdates.push(progress);
            };

            // Mock upload success then ready status
            mockedAxios.get
                .mockResolvedValueOnce({ data: { received: 0 } })
                .mockResolvedValue({ data: { state: 'ready', downloadUrl: '/file/test-uuid-1234' } });

            // Start upload
            const uploadPromise = uploadFile(testFile, hash, onProgress);

            // Wait for upload call
            await vi.waitFor(() => {
                expect(mockedAxios.get).toHaveBeenCalledWith(
                    expect.stringContaining('/upload?')
                );
            });

            // Advance timer for status polling
            await vi.advanceTimersByTimeAsync(1000);

            // Wait for completion
            await uploadPromise;

            const callUrl = mockedAxios.get.mock.calls[0][0] as string;
            expect(callUrl).toContain('fid=test-uuid-1234');
            expect(callUrl).toContain('h=testhash123');
        });

        it('should upload multiple chunks correctly', async () => {
            const largeContent = 'A'.repeat(2500); // 2.5KB = 3 chunks
            const testFile = new File([largeContent], 'large.txt');
            const progressUpdates: UploadProgress[] = [];

            mockedAxios.get
                .mockResolvedValueOnce({ data: { received: 0 } })
                .mockResolvedValueOnce({ data: { received: 1 } })
                .mockResolvedValueOnce({ data: { received: 2 } })
                .mockResolvedValue({ data: { state: 'ready', downloadUrl: '/file/test' } });

            const uploadPromise = uploadFile(testFile, 'hash', (p) => progressUpdates.push(p));

            await vi.waitFor(() => {
                expect(mockedAxios.get).toHaveBeenCalledTimes(3);
            });

            // Verify all chunks were called with correct indices
            const calls = mockedAxios.get.mock.calls;
            expect(calls[0][0]).toContain('i=0');
            expect(calls[0][0]).toContain('t=3');
            expect(calls[1][0]).toContain('i=1');
            expect(calls[2][0]).toContain('i=2');

            // Advance timer to complete
            await vi.advanceTimersByTimeAsync(1000);
            await uploadPromise;
        }, 10000);

        it('should track upload progress correctly', async () => {
            const content = 'B'.repeat(2048); // 2KB = 2 chunks
            const testFile = new File([content], 'file.txt');
            const progressUpdates: UploadProgress[] = [];

            mockedAxios.get
                .mockResolvedValueOnce({ data: { received: 0 } })
                .mockResolvedValueOnce({ data: { received: 1 } })
                .mockResolvedValue({ data: { state: 'ready', downloadUrl: '/file/test' } });

            const uploadPromise = uploadFile(testFile, 'hash', (p) => progressUpdates.push(p));

            await vi.waitFor(() => {
                expect(mockedAxios.get).toHaveBeenCalledTimes(2);
            });

            // Should have initial progress
            expect(progressUpdates.some(p => p.sentChunks === 0 && p.status === 'uploading')).toBe(true);

            // Complete the upload
            await vi.advanceTimersByTimeAsync(1000);
            await uploadPromise;
        }, 10000);

        it.skip('should handle upload errors', async () => {
            const testFile = new File(['test'], 'test.txt');
            const progressUpdates: UploadProgress[] = [];

            mockedAxios.get.mockRejectedValue(new Error('Network error'));

            await expect(async () => {
                await uploadFile(testFile, 'hash', (p) => progressUpdates.push(p));
            }).rejects.toThrow();

            // Should have set error status if any progress was tracked
            if (progressUpdates.length > 0) {
                const lastProgress = progressUpdates[progressUpdates.length - 1];
                expect(lastProgress?.status).toBe('error');
            }
        }, 15000);

        it('should enter assembling state after all chunks uploaded', async () => {
            const testFile = new File(['test'], 'test.txt');
            const progressUpdates: UploadProgress[] = [];

            mockedAxios.get
                .mockResolvedValueOnce({ data: { received: 0 } })
                .mockResolvedValue({ data: { state: 'ready', downloadUrl: '/file/test' } });

            const uploadPromise = uploadFile(testFile, 'hash', (p) => progressUpdates.push(p));

            await vi.waitFor(() => {
                const assemblingUpdate = progressUpdates.find(p => p.status === 'assembling');
                expect(assemblingUpdate).toBeDefined();
            });

            // Complete the upload
            await vi.advanceTimersByTimeAsync(1000);
            await uploadPromise;
        }, 10000);

        it('should poll for status until ready', async () => {
            const testFile = new File(['test'], 'test.txt');
            const progressUpdates: UploadProgress[] = [];

            // First call is upload, subsequent calls are status checks
            mockedAxios.get
                .mockResolvedValueOnce({ data: { received: 0 } }) // Upload chunk
                .mockResolvedValueOnce({ data: { state: 'uploading_or_assembling' } }) // Status check 1
                .mockResolvedValue({
                    data: {
                        state: 'ready',
                        downloadUrl: '/file/test-uuid-1234'
                    }
                }); // Status check 2 - ready

            const uploadPromise = uploadFile(testFile, 'hash', (p) => progressUpdates.push(p));

            // Advance time for multiple poll intervals
            await vi.advanceTimersByTimeAsync(2500);

            await uploadPromise;

            const readyUpdate = progressUpdates.find(p => p.status === 'ready');
            expect(readyUpdate).toBeDefined();
            expect(readyUpdate?.downloadUrl).toContain('/file/test-uuid-1234');
        }, 15000);

        it('should encode data as base64url correctly', async () => {
            const testContent = 'Hello+World/Test=';
            const testFile = new File([testContent], 'test.txt');

            mockedAxios.get
                .mockResolvedValueOnce({ data: { received: 0 } })
                .mockResolvedValue({ data: { state: 'ready', downloadUrl: '/file/test' } });

            const uploadPromise = uploadFile(testFile, 'hash', () => {});

            await vi.waitFor(() => {
                expect(mockedAxios.get).toHaveBeenCalled();
            });

            const callUrl = mockedAxios.get.mock.calls[0][0] as string;

            // Base64url should not contain +, /, or =
            const dataParam = new URL(callUrl, 'http://localhost').searchParams.get('d');
            expect(dataParam).toBeDefined();
            expect(dataParam).not.toContain('+');
            expect(dataParam).not.toContain('/');
            expect(dataParam).not.toContain('=');

            // Complete upload
            await vi.advanceTimersByTimeAsync(1000);
            await uploadPromise;
        }, 10000);

        it('should handle files with exact chunk size', async () => {
            const exactContent = 'A'.repeat(1024); // Exactly 1KB
            const testFile = new File([exactContent], 'exact.txt');

            mockedAxios.get
                .mockResolvedValueOnce({ data: { received: 0 } })
                .mockResolvedValue({ data: { state: 'ready', downloadUrl: '/file/test' } });

            const uploadPromise = uploadFile(testFile, 'hash', () => {});

            await vi.waitFor(() => {
                expect(mockedAxios.get).toHaveBeenCalledTimes(1);
            });

            const callUrl = mockedAxios.get.mock.calls[0][0] as string;
            expect(callUrl).toContain('i=0');
            expect(callUrl).toContain('t=1');

            await vi.advanceTimersByTimeAsync(1000);
            await uploadPromise;
        }, 10000);

        it('should use correct file ID format', async () => {
            const testFile = new File(['test'], 'test.txt');

            mockedAxios.get
                .mockResolvedValueOnce({ data: { received: 0 } })
                .mockResolvedValue({ data: { state: 'ready', downloadUrl: '/file/test-uuid-1234' } });

            const uploadPromise = uploadFile(testFile, 'hash', () => {});

            await vi.waitFor(() => {
                expect(mockedAxios.get).toHaveBeenCalled();
            });

            const callUrl = mockedAxios.get.mock.calls[0][0] as string;
            expect(callUrl).toContain('fid=test-uuid-1234');

            await vi.advanceTimersByTimeAsync(1000);
            await uploadPromise;
        }, 10000);

        it('should handle very small files', async () => {
            const tinyFile = new File(['a'], 'tiny.txt');
            const progressUpdates: UploadProgress[] = [];

            mockedAxios.get
                .mockResolvedValueOnce({ data: { received: 0 } })
                .mockResolvedValue({ data: { state: 'ready', downloadUrl: '/file/test' } });

            const uploadPromise = uploadFile(tinyFile, 'hash', (p) => progressUpdates.push(p));

            await vi.waitFor(() => {
                expect(mockedAxios.get).toHaveBeenCalledTimes(1);
            });

            expect(progressUpdates.some(p => p.totalChunks === 1 && p.sentChunks === 0)).toBe(true);

            await vi.advanceTimersByTimeAsync(1000);
            await uploadPromise;
        }, 10000);

        it('should produce valid base64url from binary data', async () => {
            const binaryContent = new Uint8Array([0, 127, 255, 63, 62]);
            const testFile = new File([binaryContent], 'binary.bin');

            mockedAxios.get
                .mockResolvedValueOnce({ data: { received: 0 } })
                .mockResolvedValue({ data: { state: 'ready', downloadUrl: '/file/test' } });

            const uploadPromise = uploadFile(testFile, 'hash', () => {});

            await vi.waitFor(() => {
                expect(mockedAxios.get).toHaveBeenCalled();
            });

            const callUrl = mockedAxios.get.mock.calls[0][0] as string;
            const dataParam = new URL(callUrl, 'http://localhost').searchParams.get('d');

            // Should be URL-safe (no +, /, =)
            expect(dataParam).toMatch(/^[A-Za-z0-9_-]*$/);

            await vi.advanceTimersByTimeAsync(1000);
            await uploadPromise;
        }, 10000);
    });
});
