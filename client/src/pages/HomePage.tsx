import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input";
import { LayoutGrid, List, Plus, Loader2, BookOpen, MoreHorizontal, Pencil, Trash2, BrainCircuit, Sun, Moon } from "lucide-react";
import { API_BASE_URL } from '@/config';

// --- Type Definitions ---
interface Collection {
    _id: string;
    name: string;
    updatedAt: string;
}

interface User {
    id: string;
    name: string;
    email: string;
}

type ViewMode = 'grid' | 'list';
type Theme = "dark" | "light";

// --- Helper Functions ---
const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
};

export function HomePage() {
    const [collections, setCollections] = useState<Collection[]>([]);
    const [isLoadingCollections, setIsLoadingCollections] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    
    // User State
    const [user, setUser] = useState<User | null>(null);
    const [isUserLoading, setIsUserLoading] = useState(true);
    
    // Theme State
    const [theme, setTheme] = useState<Theme>(() => {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('theme')) {
          return localStorage.getItem('theme') as Theme;
        }
        if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
          return 'dark';
        }
        return 'light';
    });

    // Dialog states
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
    const [collectionToRename, setCollectionToRename] = useState<Collection | null>(null);
    const [updatedCollectionName, setUpdatedCollectionName] = useState("");
    const [isRenaming, setIsRenaming] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [collectionToDelete, setCollectionToDelete] = useState<Collection | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const navigate = useNavigate();
    
    // --- Effects ---
    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);
    
    useEffect(() => {
        const fetchCollections = async () => {
            setIsLoadingCollections(true);
            setError(null);
            try {
                const response = await fetch(`${API_BASE_URL}/collections`);
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || 'Failed to fetch collections');
                }
                const data = await response.json();
                setCollections(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            } finally {
                setIsLoadingCollections(false);
            }
        };
        fetchCollections();
    }, []);

    useEffect(() => {
        const fetchUser = async () => {
            setIsUserLoading(true);
            try {
                const response = await fetch(`${API_BASE_URL}/user/me`);
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.detail || "Could not retrieve user details.");
                }
                const userData = await response.json();
                setUser(userData);
            } catch (err) {
                console.error("Failed to fetch user:", err);
            } finally {
                setIsUserLoading(false);
            }
        }
        fetchUser();
    }, []);

    // --- Handlers ---
    const handleCollectionClick = useCallback((id: string) => navigate(`/collections/${id}`), [navigate]);
    const toggleTheme = () => setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');

    const handleCreateCollection = useCallback(async () => {
        if (!newCollectionName.trim() || isCreating) return;
        setIsCreating(true);
        try {
            const response = await fetch(`${API_BASE_URL}/collections?name=${encodeURIComponent(newCollectionName)}`, {
                method: 'POST',
            });
            const newCollection = await response.json();
            if (!response.ok) throw new Error(newCollection.detail || "Failed to create collection.");
            setCollections(prev => [newCollection, ...prev]);
            setNewCollectionName("");
            setIsCreateDialogOpen(false);
        } catch (err) { console.error(err); } finally { setIsCreating(false); }
    }, [isCreating, newCollectionName]);
    
    const handleRenameCollection = useCallback(async () => {
        const trimmedName = updatedCollectionName.trim();
        if (!collectionToRename || !trimmedName || trimmedName.length > 100 || isRenaming) return;
        setIsRenaming(true);
        try {
            const response = await fetch(`${API_BASE_URL}/collections/${collectionToRename._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newName: trimmedName }),
            });
            const updatedCollection = await response.json();
            if (!response.ok) throw new Error(updatedCollection.detail || "Failed to rename collection.");
            setCollections(prev => prev.map(c => c._id === updatedCollection._id ? updatedCollection : c));
            setIsRenameDialogOpen(false);
        } catch (err) { console.error(err); } finally { setIsRenaming(false); }
    }, [isRenaming, updatedCollectionName, collectionToRename]);
    
    const handleDeleteCollection = useCallback(async () => {
        if (!collectionToDelete || isDeleting) return;
        setIsDeleting(true);
        try {
            const response = await fetch(`${API_BASE_URL}/collections/${collectionToDelete._id}`, { method: 'DELETE' });
            if (response.status !== 204) {
                 const errorData = await response.json().catch(() => ({ detail: 'Failed to delete collection.' }));
                 throw new Error(errorData.detail);
            }
            setCollections(prev => prev.filter(c => c._id !== collectionToDelete._id));
            setIsDeleteDialogOpen(false);
        } catch (err) { console.error(err); } finally { setIsDeleting(false); }
    }, [isDeleting, collectionToDelete]);

    const openRenameDialog = (collection: Collection) => {
        setCollectionToRename(collection);
        setUpdatedCollectionName(collection.name);
        setIsRenameDialogOpen(true);
    };
    
    const openDeleteDialog = (collection: Collection) => {
        setCollectionToDelete(collection);
        setIsDeleteDialogOpen(true);
    };

    const isNewNameValid = updatedCollectionName.trim().length > 0 && updatedCollectionName.trim().length <= 100;

    const renderCollections = () => {
        if (isLoadingCollections) return <div className="flex justify-center items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
        if (error) return <p className="text-center py-20 text-destructive">Error: {error}</p>;
        if (collections.length === 0) return <div className="text-center py-20 border-2 border-dashed rounded-lg"><h3 className="text-lg font-medium text-muted-foreground">No collections found.</h3><p className="text-sm text-muted-foreground">Create one to get started!</p></div>;

        if (viewMode === 'list') {
            return (
                <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-[1fr_40px] sm:grid-cols-[1fr_150px_40px] items-center gap-4 px-4 py-2 text-sm font-medium text-muted-foreground border-b">
                        <span>Title</span><span className="text-right hidden sm:block">Updated</span><span className="sr-only">Actions</span>
                    </div>
                    {collections.map((collection) => (
                         <Card key={collection._id} className="hover:shadow-lg hover:border-primary/50 transition-all duration-200">
                             <div className="grid grid-cols-[1fr_40px] sm:grid-cols-[1fr_150px_40px] items-center gap-4 p-4">
                                <div className="flex items-center gap-4 min-w-0 cursor-pointer" onClick={() => handleCollectionClick(collection._id)}><BookOpen className="h-5 w-5 text-muted-foreground shrink-0" /><p className="font-medium truncate">{collection.name}</p></div>
                                <div className="text-right text-sm text-muted-foreground cursor-pointer hidden sm:block" onClick={() => handleCollectionClick(collection._id)}>{formatDate(collection.updatedAt)}</div>
                                <div>
                                    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /><span className="sr-only">Actions</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openRenameDialog(collection)}><Pencil className="mr-2 h-4 w-4" /> Rename</DropdownMenuItem><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => openDeleteDialog(collection)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                                </div>
                            </div>
                         </Card>
                    ))}
                </div>
            );
        }
        
        return (
            <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6'>
                {collections.map((collection) => (
                    <Card key={collection._id} className="h-28 hover:shadow-lg hover:border-primary/50 transition-all duration-200">
                        <div className="p-4 h-full flex items-start justify-between gap-2">
                            <div className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer h-full" onClick={() => handleCollectionClick(collection._id)}>
                                <BookOpen className="h-8 w-8 text-muted-foreground shrink-0" />
                                <div className="flex flex-col gap-1 overflow-hidden"><CardTitle className="text-lg font-medium leading-tight line-clamp-2">{collection.name}</CardTitle><p className="text-sm text-muted-foreground">{formatDate(collection.updatedAt)}</p></div>
                            </div>
                            <div className="flex-shrink-0">
                                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /><span className="sr-only">Actions</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openRenameDialog(collection)}><Pencil className="mr-2 h-4 w-4" /> Rename</DropdownMenuItem><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => openDeleteDialog(collection)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        );
    };

    return (
        <div className="min-h-screen flex flex-col">
            <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 md:px-8">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg"><BrainCircuit className="h-6 w-6 text-primary" /></div>
                        <span className="text-xl font-bold tracking-tight hidden sm:inline">DocParser</span>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                                {isUserLoading ? ( <Loader2 className="h-5 w-5 animate-spin"/> ) : (
                                    <div className="flex h-full w-full items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold text-lg">
                                        {user ? user.name.charAt(0).toUpperCase() : '?'}
                                    </div>
                                )}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 mt-2">
                            {user && (
                                <>
                                    <DropdownMenuLabel className="font-normal">
                                        <div className="flex flex-col space-y-1">
                                            <p className="text-sm font-medium leading-none">{user.name}</p>
                                            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                                        </div>
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                </>
                            )}
                            <DropdownMenuItem onClick={toggleTheme}>
                                {theme === 'light' ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
                                <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>

            <main className="flex-1">
                <div className="container mx-auto p-4 sm:p-6 md:p-8">
                    <section className="text-center pt-8 pb-12 sm:pt-12 sm:pb-16">
                        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">What are we learning next?</h1>
                        <p className="mt-3 text-lg text-muted-foreground max-w-2xl mx-auto">Organize your knowledge and supercharge your study sessions.</p>
                    </section>

                    <section>
                        <div className="flex justify-between items-center mb-8">
                            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                                <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Create New Collection</Button></DialogTrigger>
                                <DialogContent><DialogHeader><DialogTitle>Create New Collection</DialogTitle><DialogDescription>Give your new collection a name. You can add documents to it later.</DialogDescription></DialogHeader><div className="py-4"><Input placeholder="e.g., Quantum Physics Notes" value={newCollectionName} onChange={(e) => setNewCollectionName(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleCreateCollection()} /></div><DialogFooter><Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button><Button onClick={handleCreateCollection} disabled={!newCollectionName.trim() || isCreating}>{isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Create</Button></DialogFooter></DialogContent>
                            </Dialog>
                            <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
                                <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('grid')} aria-label="Grid view"><LayoutGrid className="h-4 w-4" /></Button>
                                <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setViewMode('list')} aria-label="List view"><List className="h-4 w-4" /></Button>
                            </div>
                        </div>
                        {renderCollections()}
                    </section>
                </div>
            </main>
            
            <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}><DialogContent><DialogHeader><DialogTitle>Rename Collection</DialogTitle><DialogDescription>Enter a new name for "{collectionToRename?.name}".</DialogDescription></DialogHeader><div className="py-4"><Input placeholder="New collection name" value={updatedCollectionName} onChange={(e) => setUpdatedCollectionName(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && isNewNameValid && handleRenameCollection()} />{!isNewNameValid && updatedCollectionName.length > 0 && <p className="text-sm text-destructive mt-2">Name must be between 1 and 100 characters.</p>}</div><DialogFooter><Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>Cancel</Button><Button onClick={handleRenameCollection} disabled={!isNewNameValid || isRenaming}>{isRenaming && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Save</Button></DialogFooter></DialogContent></Dialog>
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the collection "{collectionToDelete?.name}" and all of its associated data. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteCollection} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">{isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        </div>
    );
}
