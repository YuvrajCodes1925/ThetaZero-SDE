import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { FC } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, RefreshCw, Trash2, ArrowLeft, Plus, Minus, ChevronRight, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from '@/components/ThemeToggle';
import { API_BASE_URL } from '@/config';

// --- Type Definitions ---
interface MindMapNode {
    id?: string;
    topic: string;
    children: MindMapNode[];
}

interface MindMapData {
    roots: MindMapNode[];
}

interface ReinforcementItem {
    id: string;
    data: MindMapData;
    createdAt: string;
}

type LayoutNode = {
    id: string;
    name: string;
    children: LayoutNode[];
    x: number;
    y: number;
    depth: number;
    width: number;
    height: number;
    sourceData: MindMapNode;
    parent?: LayoutNode;
};

type LayoutLink = {
    id: string;
    source: LayoutNode;
    target: LayoutNode;
    d: string;
};

// --- Constants ---
const NODE_HEIGHT = 50;
const HORIZONTAL_SPACING = 60;
const VERTICAL_SPACING = 20;
const NODE_HORIZONTAL_PADDING = 40;
const MIN_NODE_WIDTH = 120;
const CHEVRON_OFFSET = 16;
const MIN_ZOOM_WIDTH = 200;
const MAX_ZOOM_WIDTH = 8000;


// --- Helper Functions ---
const addIds = (node: MindMapNode, prefix = 'root'): MindMapNode & { id: string } => {
    const id = `${prefix}-${node.topic.replace(/[^a-zA-Z0-9]/g, '-')}`;
    return {
        ...node,
        id,
        children: node.children?.map((child, i) => addIds(child, `${id}-${i}`)) || [],
    };
};


const CustomNode: FC<{ node: LayoutNode; onToggle: (nodeId: string) => void; isExpanded: boolean }> = ({ node, onToggle, isExpanded }) => {
    const hasChildren = node.sourceData.children && node.sourceData.children.length > 0;

    const chevronTransform = `translate(${node.width / 2 + CHEVRON_OFFSET}, 0)`;

    const handleToggle = (e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
        onToggle(node.id);
    };

    return (
        <g
            transform={`translate(${node.x}, ${node.y})`}
            className="mindmap-node"
        >
            <rect
                width={node.width}
                height={node.height}
                x={-node.width / 2}
                y={-node.height / 2}
                rx="12"
                className={cn(
                    'mindmap-node-rect',
                    `level-${node.depth % 5}`
                )}
            />
            <foreignObject x={-node.width / 2} y={-node.height / 2} width={node.width} height={node.height}>
                <div
                    className={cn(
                        'w-full h-full flex items-center justify-center px-4 text-center text-base font-medium whitespace-nowrap',
                        `mindmap-node-text-level-${node.depth % 5}`
                    )}
                >
                    {node.name}
                </div>
            </foreignObject>
            {hasChildren && (
                 <g
                    transform={chevronTransform}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={handleToggle}
                    onTouchStart={handleToggle}
                    className="cursor-pointer"
                >
                    <circle r="10" className={cn('mindmap-node-rect', `level-${node.depth % 5}`)} />
                    <ChevronRight
                        className={cn(
                            'mindmap-indicator-arrow text-white transition-transform',
                            isExpanded && 'rotate-180'
                        )}
                        x="-8"
                        y="-8"
                        width="16"
                        height="16"
                        strokeWidth={2.5}
                    />
                </g>
            )}
        </g>
    );
};


export const MindMapPage: FC = () => {
    const { collectionId } = useParams<{ collectionId: string }>();
    const navigate = useNavigate();
    const [mindMap, setMindMap] = useState<ReinforcementItem | null>(null);
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
    
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [containerSize, setContainerSize] = useState({ width: 1000, height: 1000 });
    
    const getTextWidth = useCallback((text: string, font: string): number => {
        if (!canvasRef.current) {
            canvasRef.current = document.createElement("canvas");
        }
        const context = canvasRef.current.getContext("2d");
        if (context) {
            context.font = font;
            const metrics = context.measureText(text);
            return metrics.width;
        }
        return text.length * 8; // fallback
    }, []);

    const calculateLayout = useCallback((rootNode: MindMapNode & { id: string }, containerWidth: number): { nodes: LayoutNode[]; links: LayoutLink[] } => {
        const nodes: LayoutNode[] = [];
        const links: LayoutLink[] = [];
        let yCounter = 0;

        function buildHierarchy(nodeData: MindMapNode, depth = 0, parent?: LayoutNode): LayoutNode {
            const isExpanded = expandedNodes.has(nodeData.id!);
            const textWidth = getTextWidth(nodeData.topic, '500 16px sans-serif');
            const nodeWidth = Math.max(MIN_NODE_WIDTH, textWidth + NODE_HORIZONTAL_PADDING);

            const layoutNode: LayoutNode = {
                id: nodeData.id!, name: nodeData.topic, x: 0, y: 0, depth, width: nodeWidth, height: NODE_HEIGHT, parent, sourceData: nodeData, children: [],
            };

            if (isExpanded && nodeData.children) {
                layoutNode.children = (nodeData.children as (MindMapNode & {id: string})[]).map(child => buildHierarchy(child, depth + 1, layoutNode));
            }
            
            if (layoutNode.children.length > 0) {
                const childrenYSum = layoutNode.children.reduce((sum, child) => sum + child.y, 0);
                layoutNode.y = childrenYSum / layoutNode.children.length;
            } else {
                layoutNode.y = yCounter;
                yCounter += NODE_HEIGHT + VERTICAL_SPACING;
            }
            
            return layoutNode;
        }

        function positionNodes(node: LayoutNode, yOffset: number, parentX = 0, parentWidth = 0) {
            if (node.parent) {
                node.x = parentX + (parentWidth / 2 + HORIZONTAL_SPACING + node.width / 2);
            } else {
                 node.x = (-containerWidth / 2) + (node.width / 2) + 50;
            }
            
            node.y += yOffset;
            nodes.push(node);

            if (node.parent) {
                const sx = node.parent.x + node.parent.width / 2 + CHEVRON_OFFSET;
                const sy = node.parent.y;
                const tx = node.x - node.width / 2;
                const ty = node.y;
                const c1x = sx + (HORIZONTAL_SPACING / 1.5);
                const c2x = tx - (HORIZONTAL_SPACING / 1.5);
                const d = `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}`;

                links.push({ id: `${node.parent.id}-${node.id}`, source: node.parent, target: node, d });
            }

            node.children.forEach(child => positionNodes(child, yOffset, node.x, node.width));
        }
        
        const hierarchy = buildHierarchy(rootNode);
        const yCorrection = -hierarchy.y;
        positionNodes(hierarchy, yCorrection);

        return { nodes, links };
    }, [expandedNodes, getTextWidth]);
    
    const setInitialExpandedState = (mapData: ReinforcementItem) => {
        if (mapData?.data?.roots?.[0]) {
            const rootWithId = addIds(mapData.data.roots[0]);
            setExpandedNodes(new Set([rootWithId.id]));
        } else {
            setExpandedNodes(new Set());
        }
    };

    const fetchExistingMindMap = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/mindmap`);
             if (response.status === 404) {
                setMindMap(null);
                setExpandedNodes(new Set());
                return;
            }
            if (!response.ok) throw new Error((await response.json()).detail || 'Failed to load mind map.');
            const data = await response.json();
            setMindMap(data);
            setInitialExpandedState(data);
        } catch (err) { setError(err instanceof Error ? err.message : 'An unknown error occurred.'); } finally { setIsLoading(false); }
    }, [collectionId]);


    const regenerateMindMap = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setMindMap(null);
        setLayout({ nodes: [], links: [] });
         try {
            const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/mindmap?regenerate=true`);
            if (!response.ok) throw new Error((await response.json()).detail || 'Failed to regenerate mind map.');
            const data = await response.json();
            setMindMap(data);
            setInitialExpandedState(data);
        } catch (err) { setError(err instanceof Error ? err.message : 'An unknown error occurred.'); } finally { setIsLoading(false); }
    }, [collectionId]);
    
    useEffect(() => { fetchExistingMindMap(); }, [fetchExistingMindMap]);

    useEffect(() => {
        if (mindMap?.data.roots[0]) {
            const rootWithId = addIds(mindMap.data.roots[0]);
            const { nodes, links } = calculateLayout(rootWithId, containerSize.width);
            setLayout({ nodes, links });
        } else {
            setLayout({ nodes: [], links: [] });
        }
    }, [mindMap, expandedNodes, calculateLayout, containerSize]);


    useEffect(() => {
        if (containerRef.current) {
            const { width, height } = containerRef.current.getBoundingClientRect();
            setContainerSize({ width, height });
            setViewBox(`${-width / 2} ${-height / 2} ${width} ${height}`);
        }
    }, []);

    const handleButtonZoom = (direction: 'in' | 'out') => {
        if (!svgRef.current) return;
        const [vx, vy, vw, vh] = viewBox.split(' ').map(parseFloat);
        const scaleFactor = 1.25;
        const scale = direction === 'out' ? scaleFactor : 1 / scaleFactor;

        let newW = vw * scale;
        if (newW < MIN_ZOOM_WIDTH) newW = MIN_ZOOM_WIDTH;
        if (newW > MAX_ZOOM_WIDTH) newW = MAX_ZOOM_WIDTH;
        const newH = vh * (newW / vw);

        const newX = vx + (vw - newW) / 2;
        const newY = vy + (vh - newH) / 2;

        setViewBox(`${newX} ${newY} ${newW} ${newH}`);
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        if (!svgRef.current) return;
        const [vx, vy, vw, vh] = viewBox.split(' ').map(parseFloat);
        const scaleFactor = 1.1;
        const scale = e.deltaY > 0 ? scaleFactor : 1 / scaleFactor;

        let newW = vw * scale;
        if (newW < MIN_ZOOM_WIDTH) newW = MIN_ZOOM_WIDTH;
        if (newW > MAX_ZOOM_WIDTH) newW = MAX_ZOOM_WIDTH;
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

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        if (svgRef.current) {
            svgRectRef.current = svgRef.current.getBoundingClientRect();
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        svgRectRef.current = null;
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !svgRectRef.current) return;
        const [x, y, w, h] = viewBox.split(' ').map(parseFloat);
        const svgRect = svgRectRef.current;
        const dx = (e.clientX - dragStart.x) * (w / svgRect.width);
        const dy = (e.clientY - dragStart.y) * (h / svgRect.height);
        setViewBox(`${x - dx} ${y - dy} ${w} ${h}`);
        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length !== 1) return;
        // We call preventDefault here to stop the page from scrolling, which is the default touch action.
        e.preventDefault();
        setIsDragging(true);
        setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
        if (svgRef.current) {
            svgRectRef.current = svgRef.current.getBoundingClientRect();
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        e.preventDefault();
        setIsDragging(false);
        svgRectRef.current = null;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging || !svgRectRef.current || e.touches.length !== 1) return;
        e.preventDefault();
        const [x, y, w, h] = viewBox.split(' ').map(parseFloat);
        const svgRect = svgRectRef.current;
        const dx = (e.touches[0].clientX - dragStart.x) * (w / svgRect.width);
        const dy = (e.touches[0].clientY - dragStart.y) * (h / svgRect.height);
        setViewBox(`${x - dx} ${y - dy} ${w} ${h}`);
        setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    };

    const toggleNode = (nodeId: string) => {
        setExpandedNodes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(nodeId)) newSet.delete(nodeId);
            else newSet.add(nodeId);
            return newSet;
        });
    };

    const handleDelete = async () => {
        if (!collectionId || !mindMap) return;
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/mindmap`, {
                method: 'DELETE',
            });
            if (!response.ok && response.status !== 204) {
                 throw new Error((await response.json()).detail || 'Failed to delete mind map.');
            }
            await fetchExistingMindMap();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
            setIsDeleteConfirmOpen(false);
        }
    };
    
    return (
        <div className="h-[100dvh] w-full flex flex-col bg-background">
            <header className="relative flex h-16 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm shrink-0 z-10">
                <Button variant="ghost" onClick={() => navigate(-1)} className="flex items-center">
                    <ArrowLeft className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Back</span>
                </Button>
                
                <h1 className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-lg font-semibold whitespace-nowrap">
                    Mind Map
                </h1>
                
                <div className="flex items-center gap-2">
                    <div className="hidden sm:flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => regenerateMindMap()} disabled={isLoading}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Regenerate
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setIsDeleteConfirmOpen(true)} disabled={isLoading || !mindMap}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                        </Button>
                    </div>
                    
                    <div className="sm:hidden">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                    <MoreVertical className="h-5 w-5" />
                                    <span className="sr-only">More actions</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => regenerateMindMap()} disabled={isLoading}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    <span>Regenerate</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => setIsDeleteConfirmOpen(true)}
                                    disabled={isLoading || !mindMap}
                                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    <span>Delete</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <ThemeToggle />
                </div>
            </header>
            <main ref={containerRef} className={cn("flex-1 w-full h-full relative overflow-hidden", isDragging && "select-none")}>
                {isLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/50 z-20">
                        <Loader2 className="h-8 w-8 animate-spin" />
                        <p className="text-muted-foreground">Generating Mind Map...</p>
                    </div>
                )}
                 {!isLoading && !error && !mindMap && (
                    <div className="absolute inset-0 flex items-center justify-center z-20">
                        <Card className="max-w-md text-center">
                            <CardHeader>
                                <CardTitle>Create Your Mind Map</CardTitle>
                                <CardDescription>
                                    There's no mind map for this collection yet. Generate one to get started!
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button onClick={() => regenerateMindMap()} disabled={isLoading}>
                                    {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                    Generate Mind Map
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                )}
                {error && !isLoading && (
                     <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center p-4">
                        <AlertTriangle className="h-10 w-10 text-destructive"/>
                        <p className="font-semibold text-lg">Could not load Mind Map</p>
                        <p className="text-muted-foreground max-w-md">{error}</p>
                    </div>
                )}
                <svg
                    ref={svgRef}
                    className={cn("w-full h-full touch-none", !mindMap && "opacity-0", isDragging ? 'cursor-grabbing' : 'cursor-grab')}
                    viewBox={viewBox}
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                >
                    <g>
                        {layout.links.map(link => (
                            <path
                                key={link.id}
                                d={link.d}
                                className="mindmap-link"
                                fill="none"
                                stroke={`hsl(var(--mindmap-color-${link.source.depth % 5}))`}
                                strokeOpacity={0.8}
                                strokeWidth={1.5}
                            />
                        ))}
                        {layout.nodes.map(node => (
                             <CustomNode
                                key={node.id}
                                node={node}
                                onToggle={toggleNode}
                                isExpanded={expandedNodes.has(node.id)}
                            />
                        ))}
                    </g>
                </svg>
                <div className="absolute bottom-4 right-4 flex items-center gap-2 z-10">
                    <Button variant="outline" size="icon" onClick={() => handleButtonZoom('in')}><Plus /></Button>
                    <Button variant="outline" size="icon" onClick={() => handleButtonZoom('out')}><Minus /></Button>
                </div>
                <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will permanently delete the current mind map. You can regenerate a new one. This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleDelete}
                                disabled={isLoading}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </main>
        </div>
    );
};
