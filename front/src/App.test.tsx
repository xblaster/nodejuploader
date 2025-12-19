import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import * as hashModule from './utils/hash';
import * as uploadModule from './utils/upload';

// Mock the utility modules
vi.mock('./utils/hash');
vi.mock('./utils/upload');

describe('App Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Initial Render', () => {
        it('should render the application title', () => {
            render(<App />);
            expect(screen.getByText(/NodjUploader/i)).toBeInTheDocument();
        });

        it('should render the subtitle', () => {
            render(<App />);
            expect(screen.getByText(/Upload massive files seamlessly via GET chunks/i)).toBeInTheDocument();
        });

        it('should render the upload area', () => {
            render(<App />);
            expect(screen.getByText(/Click or drag file to upload/i)).toBeInTheDocument();
        });

        it('should show file size limitation text', () => {
            render(<App />);
            expect(screen.getByText(/Any size allowed/i)).toBeInTheDocument();
        });

        it('should have a hidden file input', () => {
            render(<App />);
            const fileInput = document.getElementById('fileInput') as HTMLInputElement;
            expect(fileInput).toBeInTheDocument();
            expect(fileInput.type).toBe('file');
        });
    });

    describe('File Selection', () => {
        it('should handle file selection via input', () => {
            render(<App />);

            const fileInput = document.getElementById('fileInput') as HTMLInputElement;
            const testFile = new File(['test content'], 'test.txt', { type: 'text/plain' });

            fireEvent.change(fileInput, { target: { files: [testFile] } });

            expect(screen.getByText('test.txt')).toBeInTheDocument();
        });

        it('should display file size in MB', () => {
            render(<App />);

            const fileInput = document.getElementById('fileInput') as HTMLInputElement;
            const testFile = new File(['A'.repeat(2 * 1024 * 1024)], 'large.txt');

            fireEvent.change(fileInput, { target: { files: [testFile] } });

            expect(screen.getByText(/2.00 MB/i)).toBeInTheDocument();
        });

        it('should show Start Upload button after file selection', () => {
            render(<App />);

            const fileInput = document.getElementById('fileInput') as HTMLInputElement;
            const testFile = new File(['test'], 'test.txt');

            fireEvent.change(fileInput, { target: { files: [testFile] } });

            expect(screen.getByText('Start Upload')).toBeInTheDocument();
        });

        it('should reset error when new file is selected', () => {
            render(<App />);

            const fileInput = document.getElementById('fileInput') as HTMLInputElement;
            const file1 = new File(['test1'], 'file1.txt');
            const file2 = new File(['test2'], 'file2.txt');

            // Select first file and trigger error by starting upload
            fireEvent.change(fileInput, { target: { files: [file1] } });

            // Mock error
            vi.mocked(hashModule.calculateFileHash).mockRejectedValue(new Error('Hash error'));

            const uploadButton = screen.getByText('Start Upload');
            fireEvent.click(uploadButton);

            // Wait for error to appear
            waitFor(() => {
                expect(screen.getByText(/Upload failed/i)).toBeInTheDocument();
            });

            // Select new file
            fireEvent.change(fileInput, { target: { files: [file2] } });

            // Error should be cleared
            expect(screen.queryByText(/Upload failed/i)).not.toBeInTheDocument();
        });

        it('should handle empty file selection', () => {
            render(<App />);

            const fileInput = document.getElementById('fileInput') as HTMLInputElement;

            // Trigger change with no files
            fireEvent.change(fileInput, { target: { files: [] } });

            // Should still show initial state
            expect(screen.getByText(/Click or drag file to upload/i)).toBeInTheDocument();
        });
    });

    describe('Drag and Drop', () => {
        it('should handle drag over event', () => {
            render(<App />);

            const dropZone = screen.getByText(/Click or drag file to upload/i).closest('div');

            fireEvent.dragOver(dropZone!, {
                dataTransfer: { files: [] }
            });

            // Visual feedback should change (border color changes on drag over)
            expect(dropZone).toBeInTheDocument();
        });

        it('should handle drag leave event', () => {
            render(<App />);

            const dropZone = screen.getByText(/Click or drag file to upload/i).closest('div');

            fireEvent.dragOver(dropZone!, {
                dataTransfer: { files: [] }
            });

            fireEvent.dragLeave(dropZone!, {
                dataTransfer: { files: [] }
            });

            expect(dropZone).toBeInTheDocument();
        });

        it('should handle file drop', () => {
            render(<App />);

            const dropZone = screen.getByText(/Click or drag file to upload/i).closest('div');
            const testFile = new File(['dropped content'], 'dropped.txt');

            fireEvent.drop(dropZone!, {
                dataTransfer: {
                    files: [testFile]
                }
            });

            expect(screen.getByText('dropped.txt')).toBeInTheDocument();
        });

        it('should clear previous state on new drop', () => {
            render(<App />);

            const dropZone = screen.getByText(/Click or drag file to upload/i).closest('div');
            const file1 = new File(['file1'], 'first.txt');
            const file2 = new File(['file2'], 'second.txt');

            fireEvent.drop(dropZone!, {
                dataTransfer: { files: [file1] }
            });

            expect(screen.getByText('first.txt')).toBeInTheDocument();

            fireEvent.drop(dropZone!, {
                dataTransfer: { files: [file2] }
            });

            expect(screen.getByText('second.txt')).toBeInTheDocument();
            expect(screen.queryByText('first.txt')).not.toBeInTheDocument();
        });
    });

    describe('Upload Process', () => {
        it('should start upload when button is clicked', async () => {
            const mockHash = 'mockhash123';
            const mockCalculateHash = vi.mocked(hashModule.calculateFileHash);
            const mockUploadFile = vi.mocked(uploadModule.uploadFile);

            mockCalculateHash.mockResolvedValue(mockHash);
            mockUploadFile.mockResolvedValue(undefined);

            render(<App />);

            const fileInput = document.getElementById('fileInput') as HTMLInputElement;
            const testFile = new File(['test'], 'test.txt');

            fireEvent.change(fileInput, { target: { files: [testFile] } });

            const uploadButton = screen.getByText('Start Upload');
            fireEvent.click(uploadButton);

            await waitFor(() => {
                expect(mockCalculateHash).toHaveBeenCalledWith(
                    testFile,
                    expect.any(Function)
                );
            });

            await waitFor(() => {
                expect(mockUploadFile).toHaveBeenCalledWith(
                    testFile,
                    mockHash,
                    expect.any(Function)
                );
            });
        });

        it('should show hashing status', async () => {
            const mockCalculateHash = vi.mocked(hashModule.calculateFileHash);
            mockCalculateHash.mockImplementation(() => new Promise(() => {})); // Never resolves

            render(<App />);

            const fileInput = document.getElementById('fileInput') as HTMLInputElement;
            const testFile = new File(['test'], 'test.txt');

            fireEvent.change(fileInput, { target: { files: [testFile] } });
            fireEvent.click(screen.getByText('Start Upload'));

            await waitFor(() => {
                expect(screen.getByText(/Calculating Hash/i)).toBeInTheDocument();
            });
        });

        it('should show uploading status with percentage', async () => {
            const mockCalculateHash = vi.mocked(hashModule.calculateFileHash);
            const mockUploadFile = vi.mocked(uploadModule.uploadFile);

            mockCalculateHash.mockResolvedValue('hash');
            mockUploadFile.mockImplementation(async (file, hash, onProgress) => {
                onProgress({ totalChunks: 10, sentChunks: 5, status: 'uploading' });
            });

            render(<App />);

            const fileInput = document.getElementById('fileInput') as HTMLInputElement;
            const testFile = new File(['test'], 'test.txt');

            fireEvent.change(fileInput, { target: { files: [testFile] } });
            fireEvent.click(screen.getByText('Start Upload'));

            await waitFor(() => {
                expect(screen.getByText(/Uploading... 50%/i)).toBeInTheDocument();
            });
        });

        it('should show assembling status', async () => {
            const mockCalculateHash = vi.mocked(hashModule.calculateFileHash);
            const mockUploadFile = vi.mocked(uploadModule.uploadFile);

            mockCalculateHash.mockResolvedValue('hash');
            mockUploadFile.mockImplementation(async (file, hash, onProgress) => {
                onProgress({ totalChunks: 1, sentChunks: 1, status: 'assembling' });
            });

            render(<App />);

            const fileInput = document.getElementById('fileInput') as HTMLInputElement;
            const testFile = new File(['test'], 'test.txt');

            fireEvent.change(fileInput, { target: { files: [testFile] } });
            fireEvent.click(screen.getByText('Start Upload'));

            await waitFor(() => {
                expect(screen.getByText(/Assembling on Server/i)).toBeInTheDocument();
            });
        });

        it('should show success message when upload completes', async () => {
            const mockCalculateHash = vi.mocked(hashModule.calculateFileHash);
            const mockUploadFile = vi.mocked(uploadModule.uploadFile);

            mockCalculateHash.mockResolvedValue('hash');
            mockUploadFile.mockImplementation(async (file, hash, onProgress) => {
                onProgress({
                    totalChunks: 1,
                    sentChunks: 1,
                    status: 'ready',
                    downloadUrl: 'http://localhost:8080/file/test-id'
                });
            });

            render(<App />);

            const fileInput = document.getElementById('fileInput') as HTMLInputElement;
            const testFile = new File(['test'], 'test.txt');

            fireEvent.change(fileInput, { target: { files: [testFile] } });
            fireEvent.click(screen.getByText('Start Upload'));

            await waitFor(() => {
                expect(screen.getByText(/Upload Complete!/i)).toBeInTheDocument();
            });
        });

        it('should show download link when upload is ready', async () => {
            const mockCalculateHash = vi.mocked(hashModule.calculateFileHash);
            const mockUploadFile = vi.mocked(uploadModule.uploadFile);

            mockCalculateHash.mockResolvedValue('hash');
            mockUploadFile.mockImplementation(async (file, hash, onProgress) => {
                onProgress({
                    totalChunks: 1,
                    sentChunks: 1,
                    status: 'ready',
                    downloadUrl: 'http://localhost:8080/file/test-id'
                });
            });

            render(<App />);

            const fileInput = document.getElementById('fileInput') as HTMLInputElement;
            const testFile = new File(['test'], 'test.txt');

            fireEvent.change(fileInput, { target: { files: [testFile] } });
            fireEvent.click(screen.getByText('Start Upload'));

            await waitFor(() => {
                expect(screen.getByText(/Download File/i)).toBeInTheDocument();
            });

            const downloadLink = screen.getByText(/Download File/i).closest('a');
            expect(downloadLink).toHaveAttribute('href', 'http://localhost:8080/file/test-id');
        });

        it('should handle upload errors', async () => {
            const mockCalculateHash = vi.mocked(hashModule.calculateFileHash);

            mockCalculateHash.mockRejectedValue(new Error('Hash calculation failed'));

            render(<App />);

            const fileInput = document.getElementById('fileInput') as HTMLInputElement;
            const testFile = new File(['test'], 'test.txt');

            fireEvent.change(fileInput, { target: { files: [testFile] } });
            fireEvent.click(screen.getByText('Start Upload'));

            await waitFor(() => {
                expect(screen.getByText(/Upload failed. Please try again./i)).toBeInTheDocument();
            });
        });

        it('should show error status on failure', async () => {
            const mockCalculateHash = vi.mocked(hashModule.calculateFileHash);
            const mockUploadFile = vi.mocked(uploadModule.uploadFile);

            mockCalculateHash.mockResolvedValue('hash');
            mockUploadFile.mockRejectedValue(new Error('Network error'));

            render(<App />);

            const fileInput = document.getElementById('fileInput') as HTMLInputElement;
            const testFile = new File(['test'], 'test.txt');

            fireEvent.change(fileInput, { target: { files: [testFile] } });
            fireEvent.click(screen.getByText('Start Upload'));

            await waitFor(() => {
                expect(screen.getByText(/Error Occurred/i)).toBeInTheDocument();
            });
        });
    });

    describe('UI Interactions', () => {
        it('should open file selector when drop zone is clicked', () => {
            render(<App />);

            const dropZone = screen.getByText(/Click or drag file to upload/i).closest('div');
            const fileInput = document.getElementById('fileInput') as HTMLInputElement;

            const clickSpy = vi.spyOn(fileInput, 'click');

            fireEvent.click(dropZone!);

            expect(clickSpy).toHaveBeenCalled();
        });

        it('should prevent default on drag over', () => {
            render(<App />);

            const dropZone = screen.getByText(/Click or drag file to upload/i).closest('div');
            const event = new Event('dragover', { bubbles: true, cancelable: true });

            const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

            fireEvent(dropZone!, event);

            expect(preventDefaultSpy).toHaveBeenCalled();
        });

        it('should show file icon when file is selected', () => {
            render(<App />);

            const fileInput = document.getElementById('fileInput') as HTMLInputElement;
            const testFile = new File(['test'], 'document.pdf');

            fireEvent.change(fileInput, { target: { files: [testFile] } });

            // Icon should be visible (FileText icon from lucide-react)
            expect(screen.getByText('document.pdf')).toBeInTheDocument();
        });

        it('should calculate and display progress percentage correctly', async () => {
            const mockCalculateHash = vi.mocked(hashModule.calculateFileHash);
            const mockUploadFile = vi.mocked(uploadModule.uploadFile);

            mockCalculateHash.mockResolvedValue('hash');
            mockUploadFile.mockImplementation(async (file, hash, onProgress) => {
                onProgress({ totalChunks: 4, sentChunks: 1, status: 'uploading' });
            });

            render(<App />);

            const fileInput = document.getElementById('fileInput') as HTMLInputElement;
            const testFile = new File(['test'], 'test.txt');

            fireEvent.change(fileInput, { target: { files: [testFile] } });
            fireEvent.click(screen.getByText('Start Upload'));

            await waitFor(() => {
                // 1/4 = 25%
                expect(screen.getByText(/Uploading... 25%/i)).toBeInTheDocument();
            });
        });
    });

    describe('Edge Cases', () => {
        it('should handle very large file sizes', () => {
            render(<App />);

            const fileInput = document.getElementById('fileInput') as HTMLInputElement;
            // Simulate a 5GB file
            const largeFile = new File(['x'.repeat(100)], 'huge.bin');
            Object.defineProperty(largeFile, 'size', { value: 5 * 1024 * 1024 * 1024 });

            fireEvent.change(fileInput, { target: { files: [largeFile] } });

            expect(screen.getByText(/5120.00 MB/i)).toBeInTheDocument();
        });

        it('should handle zero-sized files', () => {
            render(<App />);

            const fileInput = document.getElementById('fileInput') as HTMLInputElement;
            const emptyFile = new File([], 'empty.txt');

            fireEvent.change(fileInput, { target: { files: [emptyFile] } });

            expect(screen.getByText(/0.00 MB/i)).toBeInTheDocument();
        });

        it('should handle files with special characters in name', () => {
            render(<App />);

            const fileInput = document.getElementById('fileInput') as HTMLInputElement;
            const specialFile = new File(['test'], 'file with spaces & special!@#.txt');

            fireEvent.change(fileInput, { target: { files: [specialFile] } });

            expect(screen.getByText('file with spaces & special!@#.txt')).toBeInTheDocument();
        });

        it('should not start upload if no file is selected', () => {
            const mockCalculateHash = vi.mocked(hashModule.calculateFileHash);

            render(<App />);

            // Try to access upload functionality without file
            // (button shouldn't be visible without file selection)
            expect(screen.queryByText('Start Upload')).not.toBeInTheDocument();
            expect(mockCalculateHash).not.toHaveBeenCalled();
        });
    });
});
