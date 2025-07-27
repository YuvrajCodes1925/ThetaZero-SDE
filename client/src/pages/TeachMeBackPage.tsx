import { useEffect, useState, useCallback } from 'react';
import type { FC } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, RefreshCw, XCircle, Lightbulb } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from "@/components/ui/slider";
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { API_BASE_URL } from '@/config';

// --- Type Definitions ---
interface TeachMeBackEvaluation {
    feedback: string;
    accuracy_score: number;
    missed_points: string[];
    incorrect_points: string[];
}
interface TeachMeBackData {
    type: "teachMeBack";
    question: string;
    context: string;
    user_answer?: string;
    evaluation?: TeachMeBackEvaluation;
}
interface TeachMeBackItem {
    _id: string;
    data: TeachMeBackData;
    difficulty: string;
    createdAt: string;
}

const difficultyLabels = ["Easy", "Medium", "Hard"];

// --- Main Page Component ---
export const TeachMeBackPage: FC = () => {
    const { collectionId } = useParams<{ collectionId: string }>();
    const navigate = useNavigate();
    const [item, setItem] = useState<TeachMeBackItem | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [userAnswer, setUserAnswer] = useState("");
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [difficulty, setDifficulty] = useState<[number]>([1]);
    const [viewState, setViewState] = useState<'loading' | 'generate' | 'question' | 'evaluated'>('loading');

    const fetchExistingQuestion = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/teachmeback`);
            if (response.status === 404) {
                setViewState('generate');
                setItem(null);
            } else if (!response.ok) {
                throw new Error((await response.json()).detail || 'Failed to load question.');
            } else {
                const data = await response.json();
                setItem(data);
                if (data.data.evaluation) {
                    setViewState('evaluated');
                    setUserAnswer(data.data.user_answer || "");
                } else {
                    setViewState('question');
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    }, [collectionId]);

    useEffect(() => {
        fetchExistingQuestion();
    }, [fetchExistingQuestion]);

    const handleGenerateQuestion = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        const difficultyValue = difficultyLabels[difficulty[0]].toLowerCase();
        try {
            const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/teachmeback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ difficulty: difficultyValue }),
            });
            if (!response.ok) throw new Error((await response.json()).detail || 'Failed to generate question.');
            const newItem = await response.json();
            setItem(newItem);
            setUserAnswer("");
            setViewState('question');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            setViewState('generate'); // Go back to generate screen on error
        } finally {
            setIsLoading(false);
        }
    }, [collectionId, difficulty]);

    const handleEvaluate = useCallback(async () => {
        if (!userAnswer.trim() || !collectionId) return;
        setIsEvaluating(true);
        try {
            const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/teachmeback/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answer: userAnswer }),
            });
            const evaluationResult = await response.json();
            if (!response.ok) throw new Error(evaluationResult.detail || 'Failed to evaluate answer.');
            setItem(prev => prev ? { ...prev, data: { ...prev.data, user_answer: userAnswer, evaluation: evaluationResult } } : null);
            setViewState('evaluated');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred during evaluation.');
        } finally {
            setIsEvaluating(false);
        }
    }, [collectionId, userAnswer]);

    const renderContent = () => {
        if (viewState === 'loading') {
            return <div className="flex-1 flex flex-col items-center justify-center gap-4 h-full"><Loader2 className="h-8 w-8 animate-spin" /><p className="text-muted-foreground">Checking for existing question...</p></div>;
        }
        if (error) {
            return <div className="text-destructive text-center p-4 bg-destructive/10 rounded-md">{error}</div>;
        }
        if (viewState === 'generate') {
            return (
                <Card className="max-w-2xl mx-auto">
                    <CardHeader>
                        <CardTitle>Generate a "Teach Me Back" Question</CardTitle>
                        <CardDescription>Select a difficulty and a new question will be generated based on your sources.</CardDescription>
                    </CardHeader>
                    <CardContent className="py-6 space-y-6">
                        <div className="space-y-2">
                            <Label>Difficulty</Label>
                            <p className="text-center font-medium text-lg">{difficultyLabels[difficulty[0]]}</p>
                            <Slider defaultValue={difficulty} onValueChange={(value) => setDifficulty(value as [number])} max={2} step={1} />
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={handleGenerateQuestion} disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lightbulb className="mr-2 h-4 w-4" />}
                            Generate Question
                        </Button>
                    </CardFooter>
                </Card>
            );
        }
        if (!item) return null;

        const { question, evaluation } = item.data;

        return (
            <div className="space-y-8">
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb /> Question</CardTitle></CardHeader>
                    <CardContent><p className="text-lg">{question}</p></CardContent>
                </Card>

                <div className="space-y-2">
                    <Label htmlFor="answer-area">Your Explanation</Label>
                    <Textarea
                        id="answer-area"
                        placeholder="Explain the concept back in your own words..."
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        rows={8}
                        disabled={isEvaluating || !!evaluation}
                    />
                </div>

                {!evaluation && (
                    <div className="flex justify-center">
                        <Button onClick={handleEvaluate} disabled={isEvaluating || userAnswer.length < 10} size="lg">
                            {isEvaluating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Evaluate My Answer
                        </Button>
                    </div>
                )}

                {evaluation && (
                    <Card className="bg-muted/20">
                        <CardHeader><CardTitle>Evaluation</CardTitle></CardHeader>
                        <CardContent className="space-y-6">
                            <div className="text-center">
                                <p className="text-sm text-muted-foreground">Accuracy Score</p>
                                <p className="text-5xl font-bold">{Math.round(evaluation.accuracy_score * 100)}%</p>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <h4 className="font-semibold mb-2">Feedback:</h4>
                                    <p>{evaluation.feedback}</p>
                                </div>
                                {evaluation.missed_points.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold mb-2 flex items-center gap-2 text-amber-600"><XCircle /> Points to Include</h4>
                                        <ul className="list-disc pl-5 space-y-1">{evaluation.missed_points.map((point, i) => <li key={i}>{point}</li>)}</ul>
                                    </div>
                                )}
                                {evaluation.incorrect_points.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold mb-2 flex items-center gap-2 text-destructive"><XCircle /> Points to Correct</h4>
                                        <ul className="list-disc pl-5 space-y-1">{evaluation.incorrect_points.map((point, i) => <li key={i}>{point}</li>)}</ul>
                                    </div>
                                )}
                            </div>
                            <Separator className="my-6" />
                            <div className="p-4 border rounded-lg space-y-4">
                                <h3 className="font-semibold text-center">Generate New Question</h3>
                                <div className="space-y-2">
                                    <Label>Difficulty</Label>
                                    <p className="text-center font-medium">{difficultyLabels[difficulty[0]]}</p>
                                    <Slider defaultValue={difficulty} onValueChange={(value) => setDifficulty(value as [number])} max={2} step={1} />
                                </div>
                                <Button className="w-full" onClick={() => handleGenerateQuestion()} disabled={isLoading}>
                                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                    Generate New
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        );
    };

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
                    <h1 className="text-lg font-semibold">Teach Me Back</h1>
                </div>
                <div className="flex-1" />
            </header>
            <main className="flex-1 overflow-y-auto bg-muted/40">
                <div className="container max-w-4xl mx-auto p-4 sm:py-8">
                    {renderContent()}
                </div>
            </main>
        </div>
    );
};
