import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { FC } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, ArrowLeft, RefreshCw, Trash2, Plus, Minus, ChevronRight, MessageSquare, Book, Share2, Send, Youtube, FileText, FileAudio, FileCode2, FileSpreadsheet, Presentation, Expand, Shrink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from "@/components/ui/input";
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { API_BASE_URL } from '@/config';

// --- Type Definitions ---
interface Source { _id: string; fileInfo: { filename: string; format: string; size: number; location: string; }; uploadedAt: string; }
interface ChatMessageData { role: 'user' | 'assistant'; content: string; timestamp: string; }
interface MindMapNode { id?: string; topic: string; children: MindMapNode[]; }
interface MindMapData { type: "mindMap"; roots: MindMapNode[]; }
interface SummaryData { type: "summary"; text: string; }
type DocumentAnalysisData = MindMapData | SummaryData;
interface DocumentAnalysisOut { _id: string; type: 'mindMap' | 'summary'; data: DocumentAnalysisData; }
type LayoutNode = { id: string; name: string; children: LayoutNode[]; x: number; y: number; depth: number; width: number; height: number; sourceData: MindMapNode; parent?: LayoutNode; };
type LayoutLink = { id: string; source: LayoutNode; target: LayoutNode; d: string; };
type AnalysisTab = 'chat' | 'summary' | 'mindmap';

// --- Constants ---
const SESSION_KEY = 'doc-chat';
const SESSION_TTL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
const NODE_HEIGHT = 50;
const HORIZONTAL_SPACING = 60;
const VERTICAL_SPACING = 20;
const NODE_HORIZONTAL_PADDING = 40;
const MIN_NODE_WIDTH = 120;
const CHEVRON_OFFSET = 16;
const MIN_ZOOM_WIDTH = 200;
const MAX_ZOOM_WIDTH = 8000;

// --- Helper Components & Functions ---
const setSession = (sessionId: string) => {
    if (typeof localStorage === 'undefined') return;
    const now = new Date();
    const item = {
        sessionId: sessionId,
        expires: now.getTime() + SESSION_TTL,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(item));
};

const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const SourceIcon = ({ format, className = "h-8 w-8 text-muted-foreground shrink-0" }: { format: string, className?: string }) => {
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

const getYoutubeEmbedUrl = (url: string): string | null => {
    let videoId = null;
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname === "youtu.be") videoId = urlObj.pathname.slice(1);
        else if (urlObj.hostname.includes("youtube.com")) videoId = urlObj.searchParams.get("v");
    } catch (e) { return null; }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
};

// --- Reusable Tab Selector Component ---
interface TabSelectorProps {
    activeTab: AnalysisTab;
    onTabChange: (tab: AnalysisTab) => void;
}
const TabSelector: FC<TabSelectorProps> = ({ activeTab, onTabChange }) => {
    const tabsContainerRef = useRef<HTMLDivElement>(null);
    const [indicatorStyle, setIndicatorStyle] = useState({});

    const tabRefs = {
        chat: useRef<HTMLButtonElement>(null),
        summary: useRef<HTMLButtonElement>(null),
        mindmap: useRef<HTMLButtonElement>(null),
    };

    useEffect(() => {
        const calculateStyle = () => {
            const activeTabRef = tabRefs[activeTab];
            if (activeTabRef.current) {
                const { offsetLeft, clientWidth } = activeTabRef.current;
                setIndicatorStyle({
                    left: `${offsetLeft}px`,
                    width: `${clientWidth}px`,
                });
            }
        };

        calculateStyle(); // Initial calculation

        const resizeObserver = new ResizeObserver(calculateStyle);
        if (tabsContainerRef.current) {
            resizeObserver.observe(tabsContainerRef.current);
        }

        return () => {
            if (tabsContainerRef.current) {
                resizeObserver.unobserve(tabsContainerRef.current);
            }
        };
    }, [activeTab]);
    
    const getButtonClass = (tab: AnalysisTab) => cn(
        "flex-1 z-10 transition-colors",
        activeTab === tab ? "hover:bg-transparent" : "text-muted-foreground"
    );

    return (
        <div ref={tabsContainerRef} className="relative flex items-center p-1 bg-muted rounded-lg shrink-0">
            <div
                className="absolute h-[calc(100%-8px)] top-[4px] bg-background rounded-md shadow-sm transition-all duration-300 ease-in-out pointer-events-none"
                style={indicatorStyle}
            />
            <Button ref={tabRefs.chat} variant="ghost" className={getButtonClass('chat')} onClick={() => onTabChange('chat')}><MessageSquare className="mr-2"/>Chat</Button>
            <Button ref={tabRefs.summary} variant="ghost" className={getButtonClass('summary')} onClick={() => onTabChange('summary')}><Book className="mr-2"/>Summary</Button>
            <Button ref={tabRefs.mindmap} variant="ghost" className={getButtonClass('mindmap')} onClick={() => onTabChange('mindmap')}><Share2 className="mr-2"/>Mind Map</Button>
        </div>
    );
};

// --- Layout Components ---
const DesktopLayout: FC<{ source: Source }> = ({ source }) => {
    const [activeTab, setActiveTab] = useState<AnalysisTab>('chat');
    
    return (
        <main className="flex-1 overflow-hidden">
            <div className="flex h-full">
                <div 
                    className="h-full transition-all duration-300 ease-in-out" 
                    style={{ flex: `0 0 ${activeTab === 'mindmap' ? '30%' : '45%'}` }}
                >
                    <DocumentPreview source={source} />
                </div>
                <div 
                    className="h-full transition-all duration-300 ease-in-out flex-1"
                >
                    <AnalysisTools source={source} activeTab={activeTab} onTabChange={setActiveTab} />
                </div>
            </div>
        </main>
    );
};

const MobileLayout: FC<{ source: Source }> = ({ source }) => {
    const [activeTab, setActiveTab] = useState<AnalysisTab>('chat');
    return (
        <main className="flex-1 overflow-y-auto">
            <div className="container max-w-5xl mx-auto p-4 sm:py-8 space-y-6">
                <Card>
                    <CardHeader className="flex flex-row items-center gap-4 p-4">
                        <SourceIcon format={source.fileInfo.format} className="h-8 w-8 text-muted-foreground shrink-0"/>
                        <div>
                            <CardTitle className="leading-tight text-base">{source.fileInfo.filename}</CardTitle>
                            <CardDescription className="text-xs">{source.fileInfo.format.toUpperCase()} Document - {formatBytes(source.fileInfo.size)}</CardDescription>
                        </div>
                    </CardHeader>
                </Card>
                <TabSelector activeTab={activeTab} onTabChange={setActiveTab} />
                <div className="min-h-[400px]">
                    {activeTab === 'chat' && <ChatView source={source} />}
                    {activeTab === 'summary' && <SummaryView source={source} />}
                    {activeTab === 'mindmap' && <MindmapView source={source} />}
                </div>
            </div>
        </main>
    )
};


// --- Main Page Component ---
export const DocumentPage: FC = () => {
    const { collectionId } = useParams<{ collectionId: string, sourceId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const source = location.state?.source as Source | undefined;
    const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

    useEffect(() => {
        const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    if (!source) {
        useEffect(() => {
            navigate(`/collections/${collectionId}`);
        }, [navigate, collectionId]);
        return <div className="flex h-screen w-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    }
    
    return (
        <div className="h-[100dvh] w-full flex flex-col">
            <header className="flex items-center h-16 px-4 border-b shrink-0 z-10">
                <div className="flex-1">
                    <Button variant="ghost" onClick={() => navigate(`/collections/${collectionId}`)} className="flex items-center">
                        <ArrowLeft className="h-4 w-4 sm:mr-2" /> 
                        <span className="hidden sm:inline">Back to Collection</span>
                    </Button>
                </div>
                <div className="flex-1 text-center min-w-0">
                    <h1 className="text-lg font-semibold truncate" title={source.fileInfo.filename}>{source.fileInfo.filename}</h1>
                </div>
                <div className="flex-1 flex justify-end">
                    <ThemeToggle />
                </div>
            </header>
            {isDesktop ? <DesktopLayout source={source} /> : <MobileLayout source={source} />}
        </div>
    );
};


// --- Desktop View Components ---

const DocumentPreview: FC<{ source: Source }> = ({ source }) => {
    const { collectionId, sourceId } = useParams<{ collectionId: string; sourceId: string }>();
    const embedUrl = source.fileInfo.format === 'youtube' ? getYoutubeEmbedUrl(source.fileInfo.location) : null;
    
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const [isLoadingFile, setIsLoadingFile] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);

    const isPreviewable = ['pdf'].includes(source.fileInfo.format);

    useEffect(() => {
        let objectUrl: string | null = null;

        const fetchFile = async () => {
            if (embedUrl || !isPreviewable) return;

            setIsLoadingFile(true);
            setFileError(null);
            setFileUrl(null);

            try {
                const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/sources/${sourceId}/file`);
                if (!response.ok) {
                    throw new Error(`Failed to load document preview (status: ${response.status})`);
                }
                const blob = await response.blob();
                objectUrl = URL.createObjectURL(blob);
                setFileUrl(objectUrl);
            } catch (err) {
                setFileError(err instanceof Error ? err.message : 'Could not load file.');
            } finally {
                setIsLoadingFile(false);
            }
        };

        fetchFile();

        return () => {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [collectionId, sourceId, embedUrl, isPreviewable]);
    
    const renderPreviewContent = () => {
        if (embedUrl) {
            return <iframe className="w-full h-full rounded-md" src={embedUrl} title="YouTube video player" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>;
        }
        if (isLoadingFile) {
            return <div className="flex flex-col items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /><p className="mt-2 text-sm text-muted-foreground">Loading preview...</p></div>;
        }
        if (fileError) {
             return <div className="flex flex-col items-center justify-center h-full text-center p-4"><AlertTriangle className="h-8 w-8 text-destructive mb-2" /><p className="font-semibold">Preview Error</p><p className="text-xs text-muted-foreground">{fileError}</p></div>;
        }
        if (fileUrl) {
            return <iframe src={fileUrl} className="w-full h-full rounded-md border-0" title={source.fileInfo.filename} />;
        }
        // Fallback for non-previewable types
        return (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <FileText className="h-16 w-16 mb-4" />
                <p className="font-semibold">Document Preview</p>
                <p className="text-sm">Preview for this file type is not available.</p>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col gap-4 p-4 overflow-hidden">
            <Card>
                <CardHeader className="flex flex-row items-center gap-4 p-4">
                    <SourceIcon format={source.fileInfo.format} className="h-8 w-8 text-muted-foreground shrink-0"/>
                    <div>
                        <CardTitle className="leading-tight text-base">{source.fileInfo.filename}</CardTitle>
                        <CardDescription className="text-xs">{source.fileInfo.format.toUpperCase()} Document - {formatBytes(source.fileInfo.size)}</CardDescription>
                    </div>
                </CardHeader>
            </Card>
            <Card className="flex-1 bg-muted/20 overflow-hidden">
                {renderPreviewContent()}
            </Card>
        </div>
    );
};

interface AnalysisToolsProps {
    source: Source;
    activeTab: AnalysisTab;
    onTabChange: (tab: AnalysisTab) => void;
}
const AnalysisTools: FC<AnalysisToolsProps> = ({ source, activeTab, onTabChange }) => {
    return (
        <div className="h-full flex flex-col gap-4 p-4">
            <TabSelector activeTab={activeTab} onTabChange={onTabChange} />
            <div className="flex-1 min-h-0">
                {activeTab === 'chat' && <ChatView source={source} isDesktop={true} />}
                {activeTab === 'summary' && <SummaryView source={source} isDesktop={true} />}
                {activeTab === 'mindmap' && <MindmapView source={source} isDesktop={true} />}
            </div>
        </div>
    );
};


// --- Tab Content Components ---

const ChatView: FC<{ source: Source, isDesktop?: boolean }> = ({ source, isDesktop = false }) => {
    const { collectionId, sourceId } = useParams<{ collectionId: string, sourceId: string }>();
    const [messages, setMessages] = useState<ChatMessageData[]>([]);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);

    useEffect(() => {
        const newSessionId = crypto.randomUUID();
        setSession(newSessionId);
        setSessionId(newSessionId);
    }, []);

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const handleSendMessage = useCallback(async () => {
        if (input.trim() === '' || !collectionId || !sourceId || isSending || !sessionId) return;
        setIsSending(true);
        const userMessage: ChatMessageData = { role: 'user', content: input, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        try {
            const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/sources/${sourceId}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: input, session_id: sessionId }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Failed to get a response.");
            }
            
            const assistantMessage: ChatMessageData = await response.json();
            
            setMessages(prev => [...prev, assistantMessage]);
            
        } catch (err) {
            const errorMessage: ChatMessageData = { role: 'assistant', content: `Sorry, an error occurred: ${err instanceof Error ? err.message : ''}`, timestamp: new Date().toISOString() };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsSending(false);
        }
    }, [collectionId, sourceId, input, isSending, sessionId]);

    return (
        <Card className={cn("flex flex-col", isDesktop ? "h-full" : "h-[65vh]")}>
            <CardContent className="flex-1 p-4 overflow-y-auto">
                <div className="space-y-4">
                    {messages.length > 0 ? messages.map((msg, index) => (
                        <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                            {msg.role === 'assistant' && <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 text-xs font-bold">AI</div>}
                            <div className={`p-3 rounded-lg max-w-[85%] ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}><p className="text-sm leading-relaxed">{msg.content}</p></div>
                        </div>
                    )) : (
                        <div className="text-center h-full flex flex-col justify-center items-center text-muted-foreground">
                            <MessageSquare className="h-10 w-10 mb-2"/>
                            <p className="font-medium">Chat with "{source.fileInfo.filename}"</p>
                            <p className="text-sm">Ask a question to get started.</p>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>
            </CardContent>
            <CardFooter className="p-4 border-t">
                <div className="relative w-full">
                    <Input placeholder={isSending ? "Thinking..." : "Ask about this document..."} className="pr-12" value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} disabled={isSending} />
                    <Button type="submit" size="icon" className="absolute top-1/2 right-2 -translate-y-1/2 h-7 w-7" onClick={handleSendMessage} disabled={isSending || !input.trim()}>
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4" />}
                    </Button>
                </div>
            </CardFooter>
        </Card>
    );
};

const SummaryView: FC<{ source: Source, isDesktop?: boolean }> = ({ source, isDesktop = false }) => {
    const { collectionId, sourceId } = useParams<{ collectionId: string, sourceId: string }>();
    const [summary, setSummary] = useState<DocumentAnalysisOut | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSummary = useCallback(async (regenerate = false) => {
        setIsLoading(true);
        setError(null);
        try {
            const url = `${API_BASE_URL}/collections/${collectionId}/sources/${sourceId}/analysis/summary?regenerate=${regenerate}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error((await response.json()).detail || 'Failed to load summary.');
            const data = await response.json();
            if (data.type !== 'summary') throw new Error('Invalid data type received.');
            setSummary(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    }, [collectionId, sourceId]);

    useEffect(() => {
        if (source.fileInfo.format === 'youtube') {
            setIsLoading(false);
        } else {
            fetchSummary();
        }
    }, [fetchSummary, source]);
    
    if (source.fileInfo.format === 'youtube') {
        return (
            <Card className={cn("flex flex-col", isDesktop ? "h-full" : "min-h-[400px]")}>
                <CardHeader>
                    <CardTitle>Summaries Not Available</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col items-center justify-center text-center">
                    <AlertTriangle className="h-8 w-8 text-muted-foreground mb-4" />
                    <p className="font-semibold">Summaries for YouTube videos are not supported yet.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn("flex flex-col", isDesktop ? "h-full" : "min-h-[400px]")}>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Document Summary</CardTitle>
                    <CardDescription>An AI-generated summary of the document content.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => fetchSummary(true)} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Regenerate
                </Button>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
                {isLoading && <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>}
                {error && <p className="text-destructive text-center py-10">{error}</p>}
                {summary && !isLoading && (
                    <div className="prose dark:prose-invert max-w-none">
                        <p>{(summary.data as SummaryData).text}</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

const MindmapView: FC<{ source: Source, isDesktop?: boolean }> = (props) => {
    return <MindMapComponent {...props} />;
};

const MindMapComponent: FC<{ source: Source; isDesktop?: boolean }> = ({ isDesktop = false }) => {
    const { collectionId, sourceId } = useParams<{ collectionId: string, sourceId: string }>();
    const [mindMap, setMindMap] = useState<DocumentAnalysisOut | null>(null);
    const [layout, setLayout] = useState<{ nodes: LayoutNode[]; links: LayoutLink[] }>({ nodes: [], links: [] });
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [viewBox, setViewBox] = useState('0 0 1000 1000');
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRectRef = useRef<DOMRect | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [containerSize, setContainerSize] = useState({ width: 1000, height: 1000 });
    
    const apiBaseUrl = `${API_BASE_URL}/collections/${collectionId}/sources/${sourceId}/analysis/mindmap`;

    const getTextWidth = useCallback((text: string, font: string): number => {
        if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
        const context = canvasRef.current.getContext("2d");
        if (context) { context.font = font; return context.measureText(text).width; }
        return text.length * 8;
    }, []);

    const calculateLayout = useCallback((rootNode: MindMapNode & { id: string }, containerWidth: number): { nodes: LayoutNode[]; links: LayoutLink[] } => {
        const nodes: LayoutNode[] = []; const links: LayoutLink[] = []; let yCounter = 0;
        function buildHierarchy(nodeData: MindMapNode, depth = 0, parent?: LayoutNode): LayoutNode {
            const isExpanded = expandedNodes.has(nodeData.id!);
            const textWidth = getTextWidth(nodeData.topic, '500 16px sans-serif');
            const nodeWidth = Math.max(MIN_NODE_WIDTH, textWidth + NODE_HORIZONTAL_PADDING);
            const layoutNode: LayoutNode = { id: nodeData.id!, name: nodeData.topic, x: 0, y: 0, depth, width: nodeWidth, height: NODE_HEIGHT, parent, sourceData: nodeData, children: [], };
            if (isExpanded && nodeData.children) layoutNode.children = (nodeData.children as (MindMapNode & {id: string})[]).map(child => buildHierarchy(child, depth + 1, layoutNode));
            if (layoutNode.children.length > 0) layoutNode.y = layoutNode.children.reduce((sum, child) => sum + child.y, 0) / layoutNode.children.length;
            else { layoutNode.y = yCounter; yCounter += NODE_HEIGHT + VERTICAL_SPACING; }
            return layoutNode;
        }
        function positionNodes(node: LayoutNode, yOffset: number, parentX = 0, parentWidth = 0) {
            node.x = node.parent ? parentX + (parentWidth / 2 + HORIZONTAL_SPACING + node.width / 2) : (-containerWidth / 2) + (node.width / 2) + 50;
            node.y += yOffset;
            nodes.push(node);
            if (node.parent) {
                const sx = node.parent.x + node.parent.width / 2 + CHEVRON_OFFSET, sy = node.parent.y, tx = node.x - node.width / 2, ty = node.y;
                links.push({ id: `${node.parent.id}-${node.id}`, source: node.parent, target: node, d: `M ${sx} ${sy} C ${sx + (HORIZONTAL_SPACING/1.5)} ${sy}, ${tx - (HORIZONTAL_SPACING/1.5)} ${ty}, ${tx} ${ty}` });
            }
            node.children.forEach(child => positionNodes(child, yOffset, node.x, node.width));
        }
        const hierarchy = buildHierarchy(rootNode);
        positionNodes(hierarchy, -hierarchy.y);
        return { nodes, links };
    }, [expandedNodes, getTextWidth]);
    
    const setInitialExpandedState = (mapData: DocumentAnalysisOut) => {
        const mindMapData = mapData.data as MindMapData;
        if (mindMapData?.roots?.[0]) {
            const rootWithId = addIds(mindMapData.roots[0]);
            setExpandedNodes(new Set([rootWithId.id]));
        } else {
            setExpandedNodes(new Set());
        }
    };
    
    const fetchMindMap = useCallback(async (regenerate = false) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`${apiBaseUrl}?regenerate=${regenerate}`);
            if (response.status === 404) { setMindMap(null); return; }
            if (!response.ok) throw new Error((await response.json()).detail || 'Failed to load mind map.');
            const data = await response.json();
            if(data.type !== 'mindMap') throw new Error('Invalid data type received.');
            setMindMap(data);
            setInitialExpandedState(data);
        } catch (err) { setError(err instanceof Error ? err.message : 'An unknown error occurred.'); } finally { setIsLoading(false); }
    }, [apiBaseUrl]);

    useEffect(() => { fetchMindMap(); }, [fetchMindMap]);

    useEffect(() => {
        const mindMapData = mindMap?.data as MindMapData;
        if (mindMapData?.roots?.[0]) {
            const rootWithId = addIds(mindMapData.roots[0]);
            const { nodes, links } = calculateLayout(rootWithId, containerSize.width);
            setLayout({ nodes, links });
        } else {
            setLayout({ nodes: [], links: [] });
        }
    }, [mindMap, expandedNodes, calculateLayout, containerSize]);

    useEffect(() => {
        const resizeObserver = new ResizeObserver(entries => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                setContainerSize({ width, height });
                setViewBox(`${-width / 2} ${-height / 2} ${width} ${height}`);
            }
        });
        const container = containerRef.current;
        if (container) resizeObserver.observe(container);
        return () => { if(container) resizeObserver.unobserve(container) };
    }, []);
    
    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        if (!svgRef.current) return;
        const [vx, vy, vw, vh] = viewBox.split(' ').map(parseFloat);
        const scale = e.deltaY > 0 ? 1.1 : 1 / 1.1;
        let newW = Math.max(MIN_ZOOM_WIDTH, Math.min(MAX_ZOOM_WIDTH, vw * scale));
        const newH = vh * (newW / vw);
        const svgRect = svgRef.current.getBoundingClientRect();
        const mouseX = e.clientX - svgRect.left;
        const mouseY = e.clientY - svgRect.top;
        const svgX = vx + (mouseX / svgRect.width) * vw;
        const svgY = vy + (mouseY / svgRect.height) * vh;
        const newX = svgX - (mouseX / svgRect.width) * newW;
        const newY = svgY - (mouseY / svgRect.height) * newH;
        setViewBox(`${newX} ${newY} ${newW} ${newH}`);
    };

    const handleButtonZoom = (direction: 'in' | 'out') => {
        if (!svgRef.current) return;
        const [vx, vy, vw, vh] = viewBox.split(' ').map(parseFloat);
        const scale = direction === 'out' ? 1.25 : 1 / 1.25;
        let newW = Math.max(MIN_ZOOM_WIDTH, Math.min(MAX_ZOOM_WIDTH, vw * scale));
        const newH = vh * (newW / vw);
        setViewBox(`${vx + (vw - newW) / 2} ${vy + (vh - newH) / 2} ${newW} ${newH}`);
    };

    const handleInteractionStart = (clientX: number, clientY: number) => {
        setIsDragging(true);
        setDragStart({ x: clientX, y: clientY });
        if (svgRef.current) svgRectRef.current = svgRef.current.getBoundingClientRect();
    };

    const handleInteractionMove = (clientX: number, clientY: number) => {
        if (!isDragging || !svgRectRef.current) return;
        const [x, y, w, h] = viewBox.split(' ').map(parseFloat);
        const dx = (clientX - dragStart.x) * (w / svgRectRef.current.width);
        const dy = (clientY - dragStart.y) * (h / svgRectRef.current.height);
        setViewBox(`${x - dx} ${y - dy} ${w} ${h}`);
        setDragStart({ x: clientX, y: clientY });
    };
    
    const handleInteractionEnd = () => { setIsDragging(false); svgRectRef.current = null; };
    const toggleNode = (nodeId: string) => setExpandedNodes(prev => { const newSet = new Set(prev); newSet.has(nodeId) ? newSet.delete(nodeId) : newSet.add(nodeId); return newSet; });
    const handleDelete = async () => {
        if (!mindMap) return;
        setIsLoading(true);
        try {
            const response = await fetch(apiBaseUrl, { method: 'DELETE' });
            if (!response.ok && response.status !== 204) throw new Error((await response.json()).detail || 'Failed to delete mind map.');
            setMindMap(null);
        } catch (err) { setError(err instanceof Error ? err.message : 'An unknown error occurred.'); } finally { setIsLoading(false); setIsDeleteConfirmOpen(false); }
    };
    
    return (
        <Card ref={containerRef} className={cn(
            "relative flex flex-col",
            !isFullscreen && (isDesktop ? "h-full" : "h-[65vh]"),
            isFullscreen && 'fixed inset-2 z-50 shadow-2xl bg-background',
            isDragging ? 'select-none' : ''
        )}>
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2 p-2">
                <Button variant="outline" size="sm" onClick={() => fetchMindMap(true)} disabled={isLoading}><RefreshCw className="mr-2 h-4 w-4" />Regenerate</Button>
                <Button variant="destructive" size="sm" onClick={() => setIsDeleteConfirmOpen(true)} disabled={isLoading || !mindMap}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setIsFullscreen(!isFullscreen)}>
                    {isFullscreen ? <Shrink className="h-5 w-5" /> : <Expand className="h-5 w-5" />}
                    <span className="sr-only">{isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}</span>
                </Button>
            </div>

            {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-20"><Loader2 className="h-8 w-8 animate-spin" /></div>}
            {!isLoading && !error && !mindMap && (
                <div className="absolute inset-0 flex items-center justify-center z-20"><p className="text-muted-foreground">No mind map generated yet.</p></div>
            )}
            {error && <div className="absolute inset-0 flex items-center justify-center text-destructive">{error}</div>}

            <svg ref={svgRef} className={cn("w-full h-full flex-1 touch-none", !mindMap && "opacity-0", isDragging ? 'cursor-grabbing' : 'cursor-grab')} viewBox={viewBox}
                onWheel={handleWheel}
                onMouseDown={(e) => handleInteractionStart(e.clientX, e.clientY)}
                onMouseMove={(e) => handleInteractionMove(e.clientX, e.clientY)}
                onMouseUp={handleInteractionEnd} onMouseLeave={handleInteractionEnd}
                onTouchStart={(e) => { e.preventDefault(); if (e.touches.length === 1) handleInteractionStart(e.touches[0].clientX, e.touches[0].clientY); }}
                onTouchMove={(e) => { e.preventDefault(); if (e.touches.length === 1) handleInteractionMove(e.touches[0].clientX, e.touches[0].clientY); }}
                onTouchEnd={(e) => { e.preventDefault(); handleInteractionEnd(); }}>
                <g>
                    {layout.links.map(link => <path key={link.id} d={link.d} className="mindmap-link" fill="none" stroke={`hsl(var(--mindmap-color-${link.source.depth % 5}))`} strokeOpacity={0.8} strokeWidth={1.5} />)}
                    {layout.nodes.map(node => <CustomNode key={node.id} node={node} onToggle={toggleNode} isExpanded={expandedNodes.has(node.id)} />)}
                </g>
            </svg>
            
            <div className="absolute bottom-4 right-4 flex items-center gap-2 z-10">
                <Button variant="outline" size="icon" onClick={() => handleButtonZoom('in')}><Plus /></Button>
                <Button variant="outline" size="icon" onClick={() => handleButtonZoom('out')}><Minus /></Button>
            </div>

            <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the mind map. You can regenerate a new one.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} disabled={isLoading} className="bg-destructive hover:bg-destructive/90">{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
};

const addIds = (node: MindMapNode, prefix = 'root'): MindMapNode & { id: string } => {
    const id = `${prefix}-${node.topic.replace(/[^a-zA-Z0-9]/g, '-')}`;
    return { ...node, id, children: node.children?.map((child, i) => addIds(child, `${id}-${i}`)) || [], };
};

const CustomNode: FC<{ node: LayoutNode; onToggle: (nodeId: string) => void; isExpanded: boolean }> = ({ node, onToggle, isExpanded }) => {
    const hasChildren = node.sourceData.children && node.sourceData.children.length > 0;
    const handleToggle = (e: React.MouseEvent | React.TouchEvent) => { e.stopPropagation(); onToggle(node.id); };
    return (
        <g transform={`translate(${node.x}, ${node.y})`} className="mindmap-node">
            <rect width={node.width} height={node.height} x={-node.width / 2} y={-node.height / 2} rx="12" className={cn('mindmap-node-rect', `level-${node.depth % 5}`)} />
            <foreignObject x={-node.width / 2} y={-node.height / 2} width={node.width} height={node.height}>
                <div className={cn('w-full h-full flex items-center justify-center px-4 text-center text-base font-medium whitespace-nowrap', `mindmap-node-text-level-${node.depth % 5}`)}>{node.name}</div>
            </foreignObject>
            {hasChildren && (
                <g transform={`translate(${node.width / 2 + CHEVRON_OFFSET}, 0)`} onMouseDown={(e) => e.stopPropagation()} onClick={handleToggle} onTouchStart={handleToggle} className="cursor-pointer">
                    <circle r="10" className={cn('mindmap-node-rect', `level-${node.depth % 5}`)} />
                    <ChevronRight className={cn('mindmap-indicator-arrow text-white transition-transform', isExpanded && 'rotate-180')} x="-8" y="-8" width="16" height="16" strokeWidth={2.5} />
                </g>
            )}
        </g>
    );
};
