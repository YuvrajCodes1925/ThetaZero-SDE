import { useEffect, useState, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import type { FC } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Slider } from "@/components/ui/slider";
import { Send, Plus, BrainCircuit, FileText, Loader2, AlertTriangle, MessageSquare, MoreHorizontal, Pencil, Trash2, Share2, UploadCloud, X as CloseIcon, Youtube, Clipboard, FileUp, FileCode2, FileSpreadsheet, Presentation, FileAudio, FileQuestion, Layers, Lightbulb, Library, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/ThemeToggle';
import { API_BASE_URL } from '@/config';

const endpointMap: Record<string,string> = {
  mcq:          'mcq',
  quiz:         'quiz',
  flashcardSet: 'flashcards',
  teachMeBack:  'teachmeback',
};

// --- Type Definitions ---
export interface Collection { _id: string; name: string; totalChars: number; }
export interface Source { _id: string; fileInfo: { filename: string; format: string; size: number; location: string; }; uploadedAt: string; }
interface ChatMessageData { role: 'user' | 'assistant'; content: string; timestamp: string; }
export interface ReinforcementItemStub {
    _id: string;
    type: 'mcq' | 'mindMap' | 'quiz' | 'flashcardSet' | 'teachMeBack';
    difficulty?: string;
    createdAt: string;
}
type UploadableFile = { file: File; status: 'pending' | 'uploading' | 'error'; error?: string; };
type AddSourceTab = 'file' | 'youtube' | 'text';
interface FileToReplace {
    existingSource: Source;
    newFile: File;
}
type SourcePaneHandle = {
    openAddSourceDialog: () => void;
};

// --- Helper Functions ---
const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const SourceIcon = ({ format }: { format: string }) => {
    const className = "h-5 w-5 mt-1 text-muted-foreground shrink-0";
    switch (format) {
        case 'pdf': return <FileText className={className} />;
        case 'docx': return <FileCode2 className={className} />;
        case 'xlsx': return <FileSpreadsheet className={className} />;
        case 'pptx': return <Presentation className={className} />;
        case 'audio': return <FileAudio className={className} />;
        case 'youtube': return <Youtube className={cn(className, "text-red-600")} />;
        default: return <FileText className={className} />;
    }
};

// --- Main Page Component ---
export function CollectionPage() {
    const { collectionId } = useParams<{ collectionId: string }>();
    const [sources, setSources] = useState<Source[]>([]);
    const [collection, setCollection] = useState<Collection | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const addSourceDialogRef = useRef<SourcePaneHandle>(null);

    const openAddSourceDialog = () => addSourceDialogRef.current?.openAddSourceDialog();
    
    // State for mobile layout
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [isSourcesPaneOpen, setIsSourcesPaneOpen] = useState(false);
    const [isPracticePaneOpen, setIsPracticePaneOpen] = useState(false);
    
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!collectionId) return;
        const fetchAllData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const [collectionRes, sourcesRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/collections/${collectionId}`),
                    fetch(`${API_BASE_URL}/collections/${collectionId}/sources`),
                ]);
                if (!collectionRes.ok) throw new Error((await collectionRes.json()).detail || 'Could not find collection.');
                setCollection(await collectionRes.json());
                if (!sourcesRes.ok) {
                    // if sources is empty, it may 404, which is fine. We'll get an empty array.
                    if (sourcesRes.status !== 404) {
                       throw new Error('Failed to fetch sources.');
                    }
                    setSources([]);
                } else {
                     setSources(await sourcesRes.json());
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchAllData();
    }, [collectionId]);

    const handleSourcesUpdated = (newSources: Source[]) => {
        setSources(prev => [...prev, ...newSources]);
    }

    if (isLoading) { return <div className="flex h-screen w-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>; }
    if (error) { return <div className="flex h-screen w-screen items-center justify-center text-center p-8"><div><AlertTriangle className="mx-auto h-12 w-12 mb-4 text-destructive" /><h2 className="text-xl font-semibold mb-2">Could Not Load Collection</h2><p className="text-muted-foreground">{error}</p><Button asChild className="mt-6"><Link to="/">Go back to Collections</Link></Button></div></div>; }

    if (isMobile) {
        return (
            <div className="h-[100dvh] w-full flex flex-col relative overflow-hidden">
                {/* Mobile Header */}
                <header className="flex items-center justify-between h-16 px-4 border-b shrink-0 z-10 bg-background/95 backdrop-blur-sm">
                    <Button variant="ghost" size="icon" onClick={() => setIsSourcesPaneOpen(true)}><Library /></Button>
                    <h1 className="text-lg font-semibold truncate px-2">{collection?.name || 'Chat'}</h1>
                    <Button variant="ghost" size="icon" onClick={() => setIsPracticePaneOpen(true)}><BrainCircuit /></Button>
                </header>

                {/* Main Chat View */}
                <div className="flex-1 overflow-hidden">
                    <ChatView collectionName={collection?.name} sources={sources} onAddSourceClick={openAddSourceDialog} isMobile={isMobile} />
                </div>
                
                {/* Sources Sidebar */}
                <div className={cn("fixed inset-0 bg-black/60 z-40 transition-opacity", isSourcesPaneOpen ? "opacity-100" : "opacity-0 pointer-events-none")} onClick={() => setIsSourcesPaneOpen(false)} />
                <aside className={cn("absolute top-0 left-0 h-full w-4/5 max-w-sm bg-background z-50 transition-transform duration-300 ease-in-out shadow-2xl", isSourcesPaneOpen ? 'translate-x-0' : '-translate-x-full')}>
                    <SourcePane ref={addSourceDialogRef} sources={sources} setSources={setSources} onSourcesUpdated={handleSourcesUpdated} isMobile={true} onClose={() => setIsSourcesPaneOpen(false)} />
                </aside>
                
                {/* Practice Sidebar */}
                <div className={cn("fixed inset-0 bg-black/60 z-40 transition-opacity", isPracticePaneOpen ? "opacity-100" : "opacity-0 pointer-events-none")} onClick={() => setIsPracticePaneOpen(false)} />
                <aside className={cn("absolute top-0 right-0 h-full w-4/5 max-w-sm bg-background z-50 transition-transform duration-300 ease-in-out shadow-2xl", isPracticePaneOpen ? 'translate-x-0' : 'translate-x-full')}>
                    <PracticePane collection={collection} sources={sources} isMobile={true} onClose={() => setIsPracticePaneOpen(false)} />
                </aside>
            </div>
        )
    }

    return (
        <div className="h-[100dvh] w-full flex flex-col">
            <ResizablePanelGroup direction="horizontal" className="flex-1">
                <ResizablePanel defaultSize={25} minSize={25} maxSize={25}>
                    <SourcePane ref={addSourceDialogRef} sources={sources} setSources={setSources} onSourcesUpdated={handleSourcesUpdated} />
                </ResizablePanel>
                <ResizableHandle disabled />
                <ResizablePanel defaultSize={50} minSize={50} maxSize={50}>
                    <ChatView collectionName={collection?.name} sources={sources} onAddSourceClick={openAddSourceDialog} isMobile={isMobile}/>
                </ResizablePanel>
                <ResizableHandle disabled />
                <ResizablePanel defaultSize={25} minSize={25} maxSize={25}>
                    <PracticePane collection={collection} sources={sources} />
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}

// --- Child Components for CollectionPage ---

interface SourcePaneProps {
  sources: Source[];
  setSources: React.Dispatch<React.SetStateAction<Source[]>>;
  onSourcesUpdated: (newSources: Source[]) => void;
  isMobile?: boolean;
  onClose?: () => void;
}
const SourcePane = forwardRef<SourcePaneHandle, SourcePaneProps>(({ sources, setSources, onSourcesUpdated, isMobile, onClose }, ref) => {
    const { collectionId } = useParams<{ collectionId: string }>();
    const navigate = useNavigate();
    const [isAddSourceDialogOpen, setIsAddSourceDialogOpen] = useState(false);
    const [sourceToRename, setSourceToRename] = useState<Source | null>(null);
    const [sourceToDelete, setSourceToDelete] = useState<Source | null>(null);
    const [newSourceName, setNewSourceName] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useImperativeHandle(ref, () => ({
        openAddSourceDialog: () => {
            setIsAddSourceDialogOpen(true);
        },
    }));

    const handleRename = useCallback(async () => {
        if (!sourceToRename || !newSourceName.trim() || !collectionId) return;
        setIsSubmitting(true);
        try {
            const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/sources/${sourceToRename._id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newName: newSourceName }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || 'Failed to rename file.');
            setSources(prev => prev.map(s => s._id === sourceToRename._id ? data : s));
            setSourceToRename(null);
            setNewSourceName("");
        } catch (err) { console.error(err); } finally { setIsSubmitting(false); }
    }, [collectionId, newSourceName, sourceToRename, setSources]);

    const handleDelete = useCallback(async () => {
        if (!sourceToDelete || !collectionId) return;
        setIsSubmitting(true);
        try {
            const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/sources/${sourceToDelete._id}`, { method: 'DELETE' });
            if (!response.ok && response.status !== 204) throw new Error((await response.json()).detail || 'Failed to delete file.');
            setSources(prev => prev.filter(s => s._id !== sourceToDelete._id));
            setSourceToDelete(null);
        } catch (err) { console.error(err); } finally { setIsSubmitting(false); }
    }, [collectionId, sourceToDelete, setSources]);

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between h-16 px-4 border-b shrink-0">
                {isMobile ? (
                    <h2 className="text-xl font-semibold">Sources</h2>
                ) : (
                    <nav><Link to="/" className="flex items-center gap-2 text-base font-semibold hover:underline text-muted-foreground">&larr; All Collections</Link></nav>
                )}
                {isMobile && <Button variant="ghost" size="icon" onClick={onClose}><CloseIcon /></Button>}
            </div>
            <div className="flex-1 flex flex-col overflow-y-auto">
                <div className="p-4 space-y-4 shrink-0">
                    <div className={cn("flex justify-between items-center", isMobile && "flex-col")}>
                        <h2 className={cn("text-xl font-semibold", isMobile && "hidden")}>Sources</h2>
                        <Dialog open={isAddSourceDialogOpen} onOpenChange={setIsAddSourceDialogOpen}><DialogTrigger asChild><Button size="sm" variant="outline" className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" /> Add</Button></DialogTrigger><AddSourceDialogContent onSourcesUpdated={onSourcesUpdated} setIsOpen={setIsAddSourceDialogOpen} sources={sources} setSources={setSources} /></Dialog>
                    </div>
                    {!isMobile && <Separator />}
                </div>
                <div className="px-4 pb-4 space-y-2">
                    {sources.length > 0 ? sources.map(source => (
                        <Card key={source._id} className="p-3 hover:bg-accent/50 cursor-pointer" onClick={() => navigate(`/collections/${collectionId}/sources/${source._id}`, { state: { source } })}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                    <SourceIcon format={source.fileInfo.format} />
                                    <div className="flex-1 min-w-0"><p className="font-medium truncate" title={source.fileInfo.filename}>{source.fileInfo.filename}</p><p className="text-xs text-muted-foreground">{formatBytes(source.fileInfo.size)}</p></div>
                                </div>
                                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSourceToRename(source); setNewSourceName(source.fileInfo.filename); }}><Pencil className="mr-2 h-4 w-4" /><span>Rename</span></DropdownMenuItem><DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setSourceToDelete(source);}}><Trash2 className="mr-2 h-4 w-4" /><span>Delete</span></DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                            </div>
                        </Card>
                    )) : <div className="pt-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-4"><FileText className="h-10 w-10"/><p>No sources yet.</p><p>Click "+ Add" to get started.</p></div>}
                </div>
            </div>
            <Dialog open={!!sourceToRename} onOpenChange={(open) => !open && setSourceToRename(null)}><DialogContent><DialogHeader><DialogTitle>Rename Document</DialogTitle><DialogDescription>Enter a new name for the document "{sourceToRename?.fileInfo.filename}".</DialogDescription></DialogHeader><div className="py-4"><Input value={newSourceName} onChange={(e) => setNewSourceName(e.target.value)} placeholder="Enter new name" onKeyPress={(e) => e.key === 'Enter' && handleRename()} /></div><DialogFooter><Button variant="outline" onClick={() => setSourceToRename(null)} disabled={isSubmitting}>Cancel</Button><Button onClick={handleRename} disabled={isSubmitting || !newSourceName.trim()}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Save</Button></DialogFooter></DialogContent></Dialog>
            <AlertDialog open={!!sourceToDelete} onOpenChange={(open) => !open && setSourceToDelete(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone. This will permanently delete the document "{sourceToDelete?.fileInfo.filename}" and all of its associated data.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={isSubmitting} onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel><AlertDialogAction onClick={(e) => {e.stopPropagation(); handleDelete();}} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        </div>
    );
});

const AddSourceDialogContent: FC<{onSourcesUpdated: (newSources: Source[]) => void, setIsOpen: (isOpen: boolean) => void, sources: Source[], setSources: React.Dispatch<React.SetStateAction<Source[]>>}> = ({onSourcesUpdated, setIsOpen, sources, setSources}) => {
    const { collectionId } = useParams<{ collectionId: string }>();
    const [addSourceTab, setAddSourceTab] = useState<AddSourceTab>('file');
    const [stagedFiles, setStagedFiles] = useState<UploadableFile[]>([]);
    const [fileToReplace, setFileToReplace] = useState<FileToReplace | null>(null);
    const [youtubeUrlInput, setYoutubeUrlInput] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
        setUploadError(null);
        if (fileRejections.length > 0) { setUploadError(`Invalid file type.`); return; }
        const filesToStage: UploadableFile[] = [];
        acceptedFiles.forEach(newFile => {
            const existingSource = sources.find(source => source.fileInfo.filename === newFile.name);
            if (existingSource) setFileToReplace({ existingSource, newFile });
            else filesToStage.push({ file: newFile, status: 'pending' });
        });
        setStagedFiles(prev => [...prev, ...filesToStage].slice(0, 20 - sources.length));
    }, [sources]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: {'application/pdf': ['.pdf'],'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],'audio/mpeg': ['.mp3'],'audio/wav': ['.wav'],} });
    
    const handleUploadFiles = useCallback(async () => {
        if (stagedFiles.length === 0 || isUploading) return;
        setIsUploading(true);
        setUploadError(null);
        const formData = new FormData();
        stagedFiles.forEach(f => formData.append('files', f.file));
        try {
            const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/upload`, { method: 'POST', body: formData });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || 'Upload failed');
            onSourcesUpdated(data);
            setStagedFiles([]);
            setIsOpen(false);
        } catch (err) {
            setUploadError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            setIsUploading(false);
        }
    }, [collectionId, isUploading, stagedFiles, setIsOpen, onSourcesUpdated]);

    const handleAddYoutubeUrl = useCallback(async () => {
        if (!youtubeUrlInput.trim() || isUploading) return;
        setIsUploading(true);
        setUploadError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/upload/youtube`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: youtubeUrlInput }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || 'Failed to add YouTube URL.');
            onSourcesUpdated([data]);
            setYoutubeUrlInput('');
            setIsOpen(false);
        } catch (err) {
            setUploadError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            setIsUploading(false);
        }
    }, [collectionId, isUploading, youtubeUrlInput, setIsOpen, onSourcesUpdated]);

    const handleConfirmReplace = useCallback(async () => {
        if (!fileToReplace) return;
        setIsSubmitting(true);
        try {
            await fetch(`${API_BASE_URL}/collections/${collectionId}/sources/${fileToReplace.existingSource._id}`, { method: 'DELETE' });
            setSources(prev => prev.filter(s => s._id !== fileToReplace.existingSource._id));
            setStagedFiles(prev => [...prev, { file: fileToReplace.newFile, status: 'pending' }]);
        } catch (err) {
            setUploadError(err instanceof Error ? err.message : 'File replacement failed.');
        } finally {
            setFileToReplace(null);
            setIsSubmitting(false);
        }
    }, [collectionId, fileToReplace, setSources]);

    const removeStagedFile = useCallback((fileName: string) => setStagedFiles(prev => prev.filter(f => f.file.name !== fileName)), []);

    return (
        <>
            <DialogContent className="sm:max-w-3xl h-5/6 flex flex-col">
                <DialogHeader><DialogTitle>Add New Sources</DialogTitle></DialogHeader>
                <div className="flex-1 flex flex-col gap-4 py-4">
                    <div className="flex items-center justify-center gap-2 border-b pb-4">
                        <Button variant={addSourceTab === 'file' ? 'secondary' : 'ghost'} onClick={() => setAddSourceTab('file')}><FileUp className="mr-2 h-4 w-4"/>Upload Files</Button>
                        <Button variant={addSourceTab === 'youtube' ? 'secondary' : 'ghost'} onClick={() => setAddSourceTab('youtube')}><Youtube className="mr-2 h-4 w-4"/>From YouTube</Button>
                        <Button variant={addSourceTab === 'text' ? 'secondary' : 'ghost'} onClick={() => setAddSourceTab('text')} disabled><Clipboard className="mr-2 h-4 w-4"/>From Text</Button>
                    </div>
                    {addSourceTab === 'file' && <div {...getRootProps()} className={cn("flex-1 flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer", isDragActive && "border-primary bg-primary/10")}><input {...getInputProps()} /><UploadCloud className="w-12 h-12 text-muted-foreground mb-4" /><p className="font-semibold">Drag & drop files here, or click to select</p><p className="text-sm text-muted-foreground">Supported: PDF, DOCX, XLSX, PPTX, MP3, WAV</p></div>}
                    {addSourceTab === 'youtube' && <div className="flex-1 flex flex-col items-center justify-center p-8"><Youtube className="w-16 h-16 text-red-600 mb-4"/><p className="font-semibold mb-2">Paste a YouTube Video URL</p><Input value={youtubeUrlInput} onChange={(e) => setYoutubeUrlInput(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." /></div>}
                    {stagedFiles.length > 0 && addSourceTab === 'file' && <div className="p-4 border-t space-y-3 shrink-0"><h4 className="font-semibold text-sm">Upload Queue ({stagedFiles.length})</h4><div className="space-y-2 max-h-40 overflow-y-auto pr-2">{stagedFiles.map((f, i) => <div key={i} className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm"><div className="flex items-center gap-3 w-full min-w-0"><FileText className="h-5 w-5 shrink-0 text-muted-foreground" /><p className="truncate" title={f.file.name}>{f.file.name}</p></div><Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); removeStagedFile(f.file.name); }} disabled={isUploading}><CloseIcon className="h-4 w-4"/></Button></div>)}</div></div>}
                    {uploadError && <p className="text-xs text-center text-destructive py-2">{uploadError}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isUploading}>Cancel</Button>
                    {addSourceTab === 'file' && <Button onClick={handleUploadFiles} disabled={isUploading || stagedFiles.length === 0}>{isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Add {stagedFiles.length} file(s)</Button>}
                    {addSourceTab === 'youtube' && <Button onClick={handleAddYoutubeUrl} disabled={isUploading || !youtubeUrlInput.trim()}>{isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Add Video</Button>}
                </DialogFooter>
            </DialogContent>
            <AlertDialog open={!!fileToReplace} onOpenChange={() => setFileToReplace(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Replace File?</AlertDialogTitle><AlertDialogDescription>A file named <span className="font-semibold text-foreground">"{fileToReplace?.newFile.name}"</span> already exists. Do you want to replace it?<div className="grid grid-cols-2 gap-4 mt-4 text-sm"><div><p className="text-muted-foreground">Original Size</p><p className="font-semibold text-foreground">{formatBytes(fileToReplace?.existingSource.fileInfo.size || 0)}</p></div><div><p className="text-muted-foreground">New Size</p><p className="font-semibold text-foreground">{formatBytes(fileToReplace?.newFile.size || 0)}</p></div></div></AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => setFileToReplace(null)} disabled={isSubmitting}>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleConfirmReplace} disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Replace</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        </>
    );
}

interface ChatViewProps {
  collectionName: string | undefined;
  sources: Source[];
  onAddSourceClick: () => void;
  isMobile?: boolean;
}
const ChatView: FC<ChatViewProps> = ({ collectionName, sources, onAddSourceClick, isMobile }) => {
    const { collectionId } = useParams<{ collectionId: string }>();
    const [messages, setMessages] = useState<ChatMessageData[]>([]);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const [isRefreshConfirmOpen, setIsRefreshConfirmOpen] = useState(false);
    const [isClearingChat, setIsClearingChat] = useState(false);
    const [isHistoryEmpty, setIsHistoryEmpty] = useState(false);

    useEffect(() => {
        if (!collectionId) return;
        const fetchChat = async () => {
            try {
                const chatRes = await fetch(`${API_BASE_URL}/collections/${collectionId}/chat_session`);
                if (chatRes.ok) {
                    const data = await chatRes.json();
                    setMessages(data.messages);
                    setIsHistoryEmpty(data.messages.length === 0);
                } else {
                    setIsHistoryEmpty(true);
                }
            } catch (e) { 
                console.error("Failed to fetch chat session"); 
                setIsHistoryEmpty(true);
            }
        };
        fetchChat();
    }, [collectionId]);

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const handleSendMessage = useCallback(async () => {
        if (input.trim() === '' || !collectionId || isSending) return;
        setIsSending(true);
        setIsHistoryEmpty(false);
        const userMessage: ChatMessageData = { role: 'user', content: input, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        try {
            const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: input }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Failed to get a response.");
            }
            const assistantMessage = await response.json();
            setMessages(prev => [...prev, assistantMessage]);
        } catch (err) {
            const errorMessage: ChatMessageData = { 
                role: 'assistant', 
                content: `Sorry, an error occurred: ${err instanceof Error ? err.message : ''}`, 
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsSending(false);
        }
    }, [collectionId, input, isSending]);
    
    const handleRefreshChat = useCallback(async () => {
        if (!collectionId) return;
        setIsClearingChat(true);
        try {
            const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/chat_session`, {
                method: 'DELETE',
            });
            if (response.status !== 204) {
                const errorData = await response.json().catch(() => ({ detail: 'Failed to clear chat session.' }));
                throw new Error(errorData.detail);
            }
            setMessages([]);
            setIsHistoryEmpty(true);
        } catch (err) {
            const errorMessage: ChatMessageData = { 
                role: 'assistant', 
                content: `Sorry, an error occurred while clearing the chat: ${err instanceof Error ? err.message : ''}`, 
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsRefreshConfirmOpen(false);
            setIsClearingChat(false);
        }
    }, [collectionId]);

    const hasSources = sources.length > 0;

    const renderEmptyState = () => {
        if (isHistoryEmpty && !hasSources) {
            return (
                <div className="text-center h-full flex flex-col justify-center items-center text-muted-foreground">
                    <UploadCloud className="h-12 w-12 mb-4"/>
                    <p className="font-semibold text-lg">Add a source to get started</p>
                    <Button className="mt-4" onClick={onAddSourceClick}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Source
                    </Button>
                </div>
            )
        }
        return (
            <div className="text-center h-full flex flex-col justify-center items-center text-muted-foreground">
                <MessageSquare className="h-10 w-10 mb-2"/>
                <p className="font-medium">Chat with your documents.</p>
                <p className="text-sm">Ask a question to get started.</p>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            {!isMobile && (
                <div className="flex items-center justify-between h-16 px-4 border-b shrink-0">
                    <h1 className="text-lg font-semibold">{collectionName || 'Chat'}</h1>
                    {!isHistoryEmpty && (
                        <Button variant="ghost" onClick={() => setIsRefreshConfirmOpen(true)}>
                            <RefreshCw />
                            Refresh
                        </Button>
                    )}
                </div>
            )}
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 p-4 overflow-y-auto">
                    <div className="space-y-4">
                        {messages.length > 0 ? messages.map((msg, index) => <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>{msg.role === 'assistant' && <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 text-xs font-bold">AI</div>}<div className={`p-3 rounded-lg max-w-[75%] ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}><p className="text-sm leading-relaxed">{msg.content}</p></div></div>) : renderEmptyState()}
                        <div ref={chatEndRef} />
                    </div>
                </div>
                <div className="p-4 border-t"><div className="relative"><Input placeholder={isSending ? "Thinking..." : "Ask a question..."} className="pr-12" value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} disabled={isSending || !hasSources} /><Button type="submit" size="icon" className="absolute top-1/2 right-2 -translate-y-1/2 h-7 w-7" onClick={handleSendMessage} disabled={isSending || !hasSources}>{isSending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4" />}</Button></div></div>
            </div>
            <AlertDialog open={isRefreshConfirmOpen} onOpenChange={setIsRefreshConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure you want to refresh the chat?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will clear the entire conversation history for this collection. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isClearingChat}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRefreshChat} disabled={isClearingChat}>
                            {isClearingChat && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            Refresh
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

interface PracticePaneProps {
    collection: Collection | null;
    sources: Source[];
    isMobile?: boolean;
    onClose?: () => void;
}
const PracticePane: FC<PracticePaneProps> = ({ collection, sources, isMobile, onClose }) => {
    const { collectionId } = useParams<{ collectionId: string }>();
    const navigate = useNavigate();
    const [reinforcementItems, setReinforcementItems] = useState<ReinforcementItemStub[]>([]);
    const [isCreateItemOpen, setIsCreateItemOpen] = useState(false);
    const [itemTypeToCreate, setItemTypeToCreate] = useState<'mcq' | 'quiz' | 'flashcardSet' | 'teachMeBack' | null>(null);
    const [difficulty, setDifficulty] = useState<[number]>([1]);
    const [numberOfItems, setNumberOfItems] = useState<[number]>([5]);
    const [isGenerating, setIsGenerating] = useState(false);
    
    const hasSources = sources.length > 0;
    const disabledTooltipText = "Upload at least one source to generate";

    const maxFlashcards = useMemo(() => Math.max(1, Math.floor((collection?.totalChars || 0) / 1500)), [collection]);
    const maxMCQs = useMemo(() => Math.max(1, Math.floor((collection?.totalChars || 0) / 2000)), [collection]);
    const maxQuizItems = useMemo(() => Math.max(3, Math.min(Math.floor((collection?.totalChars || 0) / 1800), 10)), [collection]);

    useEffect(() => {
        if (!collectionId) return;
        const fetchItems = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/reinforcements`);
                if(response.ok) {
                    const data = await response.json();
                    setReinforcementItems(data);
                }
            } catch (e) { console.error("Failed to fetch reinforcement items"); }
        };
        fetchItems();
    }, [collectionId]);
    
    const handleItemClick = useCallback((item: ReinforcementItemStub) => {
        if (!collectionId) return;
        if (onClose) onClose();
        if (item.type === 'mindMap' || item.type === 'teachMeBack') {
            navigate(`/collections/${collectionId}/${item.type}`);
        } else {
            navigate(`/collections/${collectionId}/${item.type}/${item._id}`);
        }
    }, [collectionId, navigate, onClose]);

    const handleCreateItem = useCallback(async () => {
        if (!collectionId || !itemTypeToCreate) return;
        setIsGenerating(true);
        const difficultyLevels = ["easy", "medium", "hard"];
        const difficultyValue = difficultyLevels[difficulty[0]];
        
        const endpoint = endpointMap[itemTypeToCreate!];
        
        let body: any = { difficulty: difficultyValue };
        if (itemTypeToCreate !== 'teachMeBack') {
            body.numberOfItems = numberOfItems[0];
        }

        try {
            const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const newItem = await response.json();
            if (!response.ok) throw new Error(newItem.detail || `Failed to generate ${itemTypeToCreate}.`);
            
            if(newItem.type === 'teachMeBack') {
                setReinforcementItems(prev => [newItem, ...prev.filter(item => item.type !== 'teachMeBack')]);
            } else {
                setReinforcementItems(prev => [newItem, ...prev]);
            }

            setIsCreateItemOpen(false);
            handleItemClick(newItem);
        } catch (err) {
            console.error(err);
        } finally {
            setIsGenerating(false);
        }
    }, [collectionId, itemTypeToCreate, difficulty, numberOfItems, handleItemClick]);

    const openCreateDialog = useCallback((type: 'mcq' | 'quiz' | 'flashcardSet' | 'teachMeBack') => {
        setItemTypeToCreate(type);
        setDifficulty([1]);
        if (type === 'flashcardSet') setNumberOfItems([Math.min(10, maxFlashcards)]);
        else if (type === 'mcq') setNumberOfItems([Math.min(10, maxMCQs)]);
        else if (type === 'quiz') setNumberOfItems([Math.min(5, maxQuizItems)]);
        setIsCreateItemOpen(true);
    }, [maxFlashcards, maxMCQs, maxQuizItems]);

    const difficultyLabels = ["Easy", "Medium", "Hard"];

    const renderItemTypeSpecificSlider = useCallback(() => {
        if (itemTypeToCreate === 'teachMeBack') return null;

        switch(itemTypeToCreate) {
            case 'flashcardSet':
                return <div className="space-y-2"><Label>Number of Flashcards (Max: {maxFlashcards})</Label><p className="text-center font-medium">{numberOfItems[0]}</p><Slider defaultValue={numberOfItems} onValueChange={(value) => setNumberOfItems(value as [number])} max={maxFlashcards} min={1} step={1} /></div>;
            case 'mcq':
                return <div className="space-y-2"><Label>Number of Questions (Max: {maxMCQs})</Label><p className="text-center font-medium">{numberOfItems[0]}</p><Slider defaultValue={numberOfItems} onValueChange={(value) => setNumberOfItems(value as [number])} max={maxMCQs} min={1} step={1} /></div>;
            case 'quiz':
                 return <div className="space-y-2"><Label>Number of Questions (Approx. {maxQuizItems})</Label><p className="text-center font-medium">{numberOfItems[0]}</p><Slider defaultValue={numberOfItems} onValueChange={(value) => setNumberOfItems(value as [number])} max={maxQuizItems} min={3} step={1} /></div>;
            default:
                return null;
        }
    }, [itemTypeToCreate, maxFlashcards, maxMCQs, maxQuizItems, numberOfItems]);

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between h-16 px-4 border-b shrink-0">
                <h2 className="text-xl font-semibold">Practice</h2>
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    {isMobile && <Button variant="ghost" size="icon" onClick={onClose}><CloseIcon /></Button>}
                </div>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-4 space-y-3 border-b shrink-0">
                    <div title={!hasSources ? disabledTooltipText : undefined}>
                        <Button variant="outline" className="w-full justify-start gap-3" onClick={() => handleItemClick({_id: 'mindmap', type: 'mindMap', createdAt: ''})} disabled={!hasSources}><Share2 className="h-5 w-5" /> Mind Map</Button>
                    </div>
                    <div title={!hasSources ? disabledTooltipText : undefined}>
                        <Button variant="outline" className="w-full justify-start gap-3" onClick={() => openCreateDialog('teachMeBack')} disabled={!hasSources}><Lightbulb className="h-5 w-5" /> Teach Me Back</Button>
                    </div>
                    <div title={!hasSources ? disabledTooltipText : undefined}>
                        <Button variant="outline" className="w-full justify-start gap-3" onClick={() => openCreateDialog('flashcardSet')} disabled={!hasSources}><Layers className="h-5 w-5" /> Flashcards</Button>
                    </div>
                    <div title={!hasSources ? disabledTooltipText : undefined}>
                        <Button variant="outline" className="w-full justify-start gap-3" onClick={() => openCreateDialog('mcq')} disabled={!hasSources}><BrainCircuit className="h-5 w-5" /> Multiple Choice</Button>
                    </div>
                    <div title={!hasSources ? disabledTooltipText : undefined}>
                        <Button variant="outline" className="w-full justify-start gap-3" onClick={() => openCreateDialog('quiz')} disabled={!hasSources}><FileQuestion className="h-5 w-5" /> Mixed Quiz</Button>
                    </div>
                </div>
                <div className="flex-1 p-4 space-y-2 overflow-y-auto">
                    <h3 className="text-sm font-semibold text-muted-foreground">History</h3>
                    {reinforcementItems.length > 0 ? reinforcementItems.map(item => (
                        <Card key={item._id} className="p-3 hover:bg-accent/50 cursor-pointer" onClick={() => handleItemClick(item)}>
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="font-medium capitalize">{item.type.replace(/([A-Z])/g, ' $1')}</p>
                                    <p className="text-xs text-muted-foreground">Created: {new Date(item.createdAt).toLocaleDateString()}</p>
                                </div>
                                {item.difficulty && <p className="text-xs capitalize px-2 py-1 rounded-full bg-secondary text-secondary-foreground">{item.difficulty}</p>}
                            </div>
                        </Card>
                    )) : <p className="text-xs text-center text-muted-foreground pt-4">No practice items generated yet.</p>}
                </div>
            </div>
            <Dialog open={isCreateItemOpen} onOpenChange={setIsCreateItemOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Generate New {itemTypeToCreate?.replace(/([A-Z])/g, ' $1')}</DialogTitle>
                        <DialogDescription>Adjust the settings for your new practice material.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-6">
                        <div className="space-y-2">
                            <Label>Difficulty</Label>
                            <p className="text-center font-medium">{difficultyLabels[difficulty[0]]}</p>
                            <Slider defaultValue={difficulty} onValueChange={(value) => setDifficulty(value as [number])} max={2} step={1} />
                        </div>
                        {renderItemTypeSpecificSlider()}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateItemOpen(false)} disabled={isGenerating}>Cancel</Button>
                        <Button onClick={handleCreateItem} disabled={isGenerating}>
                            {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            Generate
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
