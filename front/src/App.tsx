import React, { useState, useCallback } from 'react';
import { calculateFileHash } from './utils/hash';
import { uploadFile, UploadProgress } from './utils/upload';
import { Upload, CheckCircle, AlertCircle, FileText, Download } from 'lucide-react';
import './index.css';

function App() {
    const [file, setFile] = useState<File | null>(null);
    const [progress, setProgress] = useState<UploadProgress | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) {
            setFile(droppedFile);
            setError(null);
            setProgress(null);
        }
    }, []);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setError(null);
            setProgress(null);
        }
    }, []);

    const startUpload = async () => {
        if (!file) return;

        try {
            setProgress({ totalChunks: 0, sentChunks: 0, status: 'hashing' });

            const hash = await calculateFileHash(file, (p) => {
                // You could show hashing progress here if you wanted
            });

            await uploadFile(file, hash, (p) => {
                setProgress(p);
            });

        } catch (err) {
            console.error(err);
            setError('Upload failed. Please try again.');
            setProgress(prev => prev ? { ...prev, status: 'error' } : null);
        }
    };

    const percent = progress
        ? Math.round((progress.sentChunks / progress.totalChunks) * 100)
        : 0;

    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">
            <div className="max-w-xl w-full">
                <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 mb-2 text-center">
                    NodjUploader
                </h1>
                <p className="text-slate-400 text-center mb-8">Upload massive files seamlessly via GET chunks.</p>

                <div
                    className={`
            border-2 border-dashed rounded-2xl p-10 transition-all duration-200 ease-in-out
            flex flex-col items-center justify-center cursor-pointer
            ${isDragOver ? 'border-blue-500 bg-blue-500/10 scale-[1.02]' : 'border-slate-700 hover:border-slate-600 bg-slate-800/50'}
            ${file ? 'border-solid border-emerald-500/50' : ''}
          `}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('fileInput')?.click()}
                >
                    <input
                        type="file"
                        id="fileInput"
                        className="hidden"
                        onChange={handleFileSelect}
                    />

                    {!file && (
                        <>
                            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 text-blue-400 shadow-lg shadow-blue-900/20">
                                <Upload size={32} />
                            </div>
                            <p className="text-lg font-medium text-slate-200">Click or drag file to upload</p>
                            <p className="text-sm text-slate-500 mt-2">Any size allowed</p>
                        </>
                    )}

                    {file && !progress && (
                        <div className="text-center">
                            <div className="w-16 h-16 bg-emerald-900/30 rounded-full flex items-center justify-center mb-4 text-emerald-400 mx-auto">
                                <FileText size={32} />
                            </div>
                            <p className="text-xl font-medium text-white break-all">{file.name}</p>
                            <p className="text-sm text-slate-400 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>

                            <button
                                onClick={(e) => { e.stopPropagation(); startUpload(); }}
                                className="mt-6 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium shadow-lg shadow-blue-900/30 transition-all active:scale-95"
                            >
                                Start Upload
                            </button>
                        </div>
                    )}

                    {progress && (
                        <div className="w-full text-center">
                            <div className="mb-4 flex flex-col items-center">
                                {progress.status === 'hashing' && <div className="text-yellow-400 font-medium mb-2">Calculating Hash...</div>}
                                {progress.status === 'uploading' && <div className="text-blue-400 font-medium mb-2">Uploading... {percent}%</div>}
                                {progress.status === 'assembling' && <div className="text-purple-400 font-medium mb-2">Assembling on Server...</div>}
                                {progress.status === 'ready' && <div className="text-emerald-400 font-bold mb-2 text-xl">Upload Complete!</div>}
                                {progress.status === 'error' && <div className="text-red-400 font-bold mb-2">Error Occurred</div>}
                            </div>

                            {progress.status !== 'ready' && progress.status !== 'error' && (
                                <div className="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden">
                                    <div
                                        className={`h-2.5 rounded-full transition-all duration-300 ${progress.status === 'hashing' ? 'bg-yellow-500 w-full animate-pulse' :
                                                progress.status === 'assembling' ? 'bg-purple-500 w-full animate-pulse' :
                                                    'bg-blue-500'
                                            }`}
                                        style={{ width: progress.status === 'uploading' ? `${percent}%` : '100%' }}
                                    ></div>
                                </div>
                            )}

                            {progress.status === 'ready' && progress.downloadUrl && (
                                <div className="mt-4 p-4 bg-emerald-900/20 rounded-xl border border-emerald-500/20">
                                    <p className="text-emerald-200 mb-3">Your file is ready to download (valid for 24h)</p>
                                    <a
                                        href={`${progress.downloadUrl}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Download size={18} />
                                        Download File
                                    </a>
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="mt-4 flex items-center gap-2 text-red-400 bg-red-900/20 px-4 py-2 rounded-lg" onClick={(e) => e.stopPropagation()}>
                            <AlertCircle size={18} />
                            <span>{error}</span>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}

export default App;
