import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, X, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { API_BASE_URL } from '@/config';

// A simple, beautiful AI loading animation using CSS
const AiLoadingAnimation = () => (
    <div className="relative w-6 h-6">
        <div className="absolute border-2 border-primary/20 rounded-full h-full w-full"></div>
        <div className="absolute border-2 border-primary/20 rounded-full h-full w-full animate-[spin_2s_linear_infinite]" style={{ borderTopColor: 'transparent', borderLeftColor: 'transparent' }}></div>
        <div className="absolute border-2 border-primary rounded-full h-2/3 w-2/3 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute border-2 border-primary rounded-full h-1/3 w-1/3 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-[spin_1s_linear_reverse_infinite]" style={{ borderTopColor: 'transparent', borderRightColor: 'transparent' }}></div>
    </div>
);

type UploadableFile = {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
};

interface FileUploadProps {
  collectionId: string;
  onUploadComplete: (uploadedFiles: any[]) => void;
}


export function FileUpload({ collectionId, onUploadComplete }: FileUploadProps) {
  const [files, setFiles] = useState<UploadableFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    setError(null);
    if (fileRejections.length > 0) {
        setError(`Invalid file(s) detected. Only PDFs are accepted.`);
        return;
    }

    const newFiles = acceptedFiles.map(file => ({ file, status: 'pending' } as UploadableFile));
    
    setFiles(prev => {
        const combined = [...prev, ...newFiles];
        if (combined.length > 20) {
            setError("You can upload a maximum of 20 files.");
            return prev;
        }
        return combined;
    });
  }, []);

  // Removed `noClick` and `noKeyboard` to allow the OS prompt to open.
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
  });

  const handleUpload = async () => {
    if (files.length === 0 || isUploading) return;

    setIsUploading(true);
    setError(null);
    setFiles(prev => prev.map(f => ({ ...f, status: 'uploading' })));

    const formData = new FormData();
    files.forEach(f => formData.append('files', f.file));

    try {
        const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/upload`, {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || 'Upload failed');
        }
        
        setFiles([]); // Clear the upload queue on success
        onUploadComplete(data);

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
        setError(errorMessage);
        setFiles(prev => prev.map(f => f.status === 'uploading' ? ({ ...f, status: 'error', error: 'Failed' }) : f));
    } finally {
        setIsUploading(false);
    }
  };
  
  const removeFile = (fileName: string) => {
    setFiles(prev => prev.filter(f => f.file.name !== fileName));
  };


  return (
    <Card className="p-4 border-primary/20 border">
      <div {...getRootProps()} className={`p-6 border-2 border-dashed rounded-lg text-center transition-colors ${isDragActive ? 'border-primary bg-primary/10' : 'border-border'}`}>
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
            <UploadCloud className="h-10 w-10 text-muted-foreground" />
            <p className="font-semibold">Drag & drop files here</p>
            <p className="text-xs text-muted-foreground">or</p>
            {/* This button programmatically opens the file dialog */}
            <Button type="button" variant="outline" size="sm" onClick={open}>
                Select Files
            </Button>
            <p className="text-xs text-muted-foreground mt-2">PDFs only, up to 20 files.</p>
        </div>
      </div>

      {files.length > 0 && (
        <div className="mt-4">
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm">
                        <div className="flex items-center gap-3 w-full min-w-0">
                           {f.status === 'uploading' && <AiLoadingAnimation />}
                           {f.status === 'pending' && <FileText className="h-5 w-5 text-muted-foreground shrink-0" />}
                           {f.status === 'error' && <X className="h-5 w-5 text-destructive shrink-0" />}
                           <p className="truncate" title={f.file.name}>{f.file.name}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeFile(f.file.name)} disabled={isUploading}>
                            <X className="h-4 w-4"/>
                        </Button>
                    </div>
                ))}
            </div>
          <Button className="w-full mt-4" onClick={handleUpload} disabled={isUploading || files.length === 0}>
            {isUploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Processing...</> : `Upload ${files.length} file(s)`}
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-center text-destructive">{error}</p>}
    </Card>
  );
}
