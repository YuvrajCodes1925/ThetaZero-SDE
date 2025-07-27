import { useEffect, useState, useCallback } from 'react';
import type { FC } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/config';

// --- Type Definitions ---
interface Flashcard {
    front: string;
    back: string;
}
interface FlashcardSet {
    flashcards: Flashcard[];
}
interface FlashcardReinforcementItem {
    id: string;
    data: FlashcardSet;
    difficulty: string;
    createdAt: string;
}

export const FlashcardPage: FC = () => {
    const { collectionId, reinforcementId } = useParams<{ collectionId: string; reinforcementId: string }>();
    const navigate = useNavigate();
    const [flashcardSet, setFlashcardSet] = useState<FlashcardReinforcementItem | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);

    useEffect(() => {
        if (!collectionId || !reinforcementId) return;
        const fetchFlashcardSet = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/reinforcements/${reinforcementId}`);
                if (!response.ok) throw new Error((await response.json()).detail || 'Failed to load flashcard set.');
                setFlashcardSet(await response.json());
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchFlashcardSet();
    }, [collectionId, reinforcementId]);

    const handleNext = useCallback(() => {
        setIsFlipped(false);
        setCurrentIndex(prev => Math.min(prev + 1, (flashcardSet?.data.flashcards.length || 0) - 1));
    }, [flashcardSet]);

    const handlePrev = useCallback(() => {
        setIsFlipped(false);
        setCurrentIndex(prev => Math.max(prev - 1, 0));
    }, []);

    const flipCard = useCallback(() => {
        setIsFlipped(f => !f);
    }, []);
    
    if (isLoading) { return <div className="flex h-screen w-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>; }
    if (error) { return <div className="flex h-screen w-screen items-center justify-center text-center p-8"><div><AlertTriangle className="mx-auto h-12 w-12 mb-4 text-destructive" /><h2 className="text-xl font-semibold mb-2">Error Loading Flashcards</h2><p className="text-muted-foreground">{error}</p><Button asChild className="mt-6"><Link to={`/collections/${collectionId}`}>Go Back</Link></Button></div></div>; }
    if (!flashcardSet || !flashcardSet.data || !flashcardSet.data.flashcards || flashcardSet.data.flashcards.length === 0) {
        return (
            <div className="flex h-screen w-screen items-center justify-center text-center p-8"><div><AlertTriangle className="mx-auto h-12 w-12 mb-4 text-muted-foreground" /><h2 className="text-xl font-semibold mb-2">Flashcard Set Not Found</h2><p className="text-muted-foreground">This flashcard set could not be loaded or is empty.</p><Button asChild className="mt-6"><Link to={`/collections/${collectionId}`}>Go Back</Link></Button></div></div>
        );
    }

    const currentCard = flashcardSet.data.flashcards[currentIndex];
    const totalCards = flashcardSet.data.flashcards.length;

    return (
        <div className="h-[100dvh] w-full flex flex-col">
            <header className="flex items-center h-16 px-4 border-b shrink-0">
                <div className="flex-1">
                    <Button variant="ghost" onClick={() => navigate(-1)} className="flex items-center">
                        <ArrowLeft className="h-4 w-4 sm:mr-2" /> 
                        <span className="hidden sm:inline">Back to Collection</span>
                    </Button>
                </div>
                <div className="flex-1 text-center">
                    <h1 className="text-lg font-semibold capitalize">{flashcardSet.difficulty} Flashcards</h1>
                </div>
                <div className="flex-1 text-right">
                    <p className="text-sm text-muted-foreground">Card {currentIndex + 1} of {totalCards}</p>
                </div>
            </header>
            <main className="flex-1 flex flex-col items-center justify-center bg-muted/40 p-4 sm:p-6">
                <div className="w-full max-w-2xl h-[45vh] sm:h-96 [perspective:1000px]">
                    <Card
                        className={cn("w-full h-full relative transition-transform duration-700 [transform-style:preserve-3d]", isFlipped && "[transform:rotateY(180deg)]")}
                        onClick={flipCard}
                        role="button"
                        aria-pressed={isFlipped}
                        tabIndex={0}
                        onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && flipCard()}
                    >
                        <CardContent className="absolute w-full h-full [backface-visibility:hidden] flex items-center justify-center p-6">
                            <p className="text-xl sm:text-2xl text-center">{currentCard.front}</p>
                        </CardContent>
                        <CardContent className="absolute w-full h-full [backface-visibility:hidden] [transform:rotateY(180deg)] flex items-center justify-center p-6 bg-secondary">
                             <p className="text-lg sm:text-xl text-center">{currentCard.back}</p>
                        </CardContent>
                    </Card>
                </div>
                <div className="flex items-center gap-4 mt-8">
                    <Button variant="outline" onClick={handlePrev} disabled={currentIndex === 0}>Previous</Button>
                    <Button onClick={flipCard}><RefreshCw className="mr-2 h-4 w-4" />Flip Card</Button>
                    <Button variant="outline" onClick={handleNext} disabled={currentIndex === totalCards - 1}>Next</Button>
                </div>
            </main>
        </div>
    );
};
