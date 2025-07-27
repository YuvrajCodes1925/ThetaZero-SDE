import { useEffect, useState, useCallback } from 'react';
import type { FC } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { API_BASE_URL } from '@/config';

// --- Type Definitions ---
interface MCQ {
    question: string;
    options: string[];
    correctAnswer: string;
}
interface MCQSet {
    mcqs: MCQ[];
}
interface MCQReinforcementItem {
    id: string;
    data: MCQSet;
    difficulty: string;
    createdAt: string;
}

export const MCQPage: FC = () => {
    const { collectionId, reinforcementId } = useParams<{ collectionId: string; reinforcementId: string }>();
    const navigate = useNavigate();
    const [mcqSet, setMcqSet] = useState<MCQReinforcementItem | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const [userAnswers, setUserAnswers] = useState<{[key: number]: string}>({});
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [score, setScore] = useState(0);

    useEffect(() => {
        if (!collectionId || !reinforcementId) return;
        const fetchMCQSet = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/reinforcements/${reinforcementId}`);
                if (!response.ok) throw new Error((await response.json()).detail || 'Failed to load MCQ set.');
                setMcqSet(await response.json());
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchMCQSet();
    }, [collectionId, reinforcementId]);

    const handleAnswerChange = useCallback((questionIndex: number, answer: string) => {
        setUserAnswers(prev => ({ ...prev, [questionIndex]: answer }));
    }, []);

    const handleSubmit = useCallback(() => {
        if (!mcqSet) return;
        let correctCount = 0;
        mcqSet.data.mcqs.forEach((mcq, index) => {
            if (userAnswers[index] === mcq.correctAnswer) {
                correctCount++;
            }
        });
        setScore(correctCount);
        setIsSubmitted(true);
    }, [mcqSet, userAnswers]);

    const resetQuiz = useCallback(() => {
        setUserAnswers({});
        setScore(0);
        setIsSubmitted(false);
    }, []);

    if (isLoading) { return <div className="flex h-screen w-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>; }
    if (error) { return <div className="flex h-screen w-screen items-center justify-center text-center p-8"><div><AlertTriangle className="mx-auto h-12 w-12 mb-4 text-destructive" /><h2 className="text-xl font-semibold mb-2">Error Loading Quiz</h2><p className="text-muted-foreground">{error}</p><Button asChild className="mt-6"><Link to={`/collections/${collectionId}`}>Go Back</Link></Button></div></div>; }
    if (!mcqSet || !mcqSet.data || !mcqSet.data.mcqs || mcqSet.data.mcqs.length === 0) {
        return (
            <div className="flex h-screen w-screen items-center justify-center text-center p-8"><div><AlertTriangle className="mx-auto h-12 w-12 mb-4 text-muted-foreground" /><h2 className="text-xl font-semibold mb-2">MCQ Set Not Found</h2><p className="text-muted-foreground">This MCQ set could not be loaded or is empty.</p><Button asChild className="mt-6"><Link to={`/collections/${collectionId}`}>Go Back</Link></Button></div></div>
        );
    }

    const totalQuestions = mcqSet.data.mcqs.length;
    
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
                    <h1 className="text-lg font-semibold capitalize">{mcqSet.difficulty} MCQ Quiz</h1>
                </div>
                <div className="flex-1" />
            </header>
            <main className="flex-1 overflow-y-auto bg-muted/40">
                <div className="container max-w-4xl mx-auto p-4 sm:py-8">
                    {isSubmitted ? (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-2xl text-center">Quiz Results</CardTitle>
                            </CardHeader>
                            <CardContent className="text-center space-y-4">
                                <p className="text-4xl font-bold">{score} / {totalQuestions}</p>
                                <Progress value={(score / totalQuestions) * 100} className="w-full" />
                                <p className="text-lg text-muted-foreground">You scored {((score / totalQuestions) * 100).toFixed(0)}%</p>
                            </CardContent>
                            <CardFooter className="flex justify-center">
                                <Button onClick={resetQuiz}>Try Again</Button>
                            </CardFooter>
                        </Card>
                    ) : null}

                    <div className="space-y-6 mt-6">
                        {mcqSet.data.mcqs.map((mcq, index) => (
                            <Card key={index}>
                                <CardHeader>
                                    <CardTitle>Question {index + 1}</CardTitle>
                                    <p className="pt-2">{mcq.question}</p>
                                </CardHeader>
                                <CardContent>
                                    <RadioGroup value={userAnswers[index]} onValueChange={(value) => handleAnswerChange(index, value)} disabled={isSubmitted}>
                                        {mcq.options.map((option, optIndex) => {
                                            const isCorrect = option === mcq.correctAnswer;
                                            const isSelected = userAnswers[index] === option;
                                            return (
                                                <div key={optIndex} className="flex items-center space-x-2">
                                                    <RadioGroupItem value={option} id={`q${index}-opt${optIndex}`} />
                                                    <Label htmlFor={`q${index}-opt${optIndex}`} className="flex-1">{option}</Label>
                                                    {isSubmitted && isSelected && !isCorrect && <XCircle className="h-5 w-5 text-destructive" />}
                                                    {isSubmitted && isCorrect && <CheckCircle className="h-5 w-5 text-green-500" />}
                                                </div>
                                            )
                                        })}
                                    </RadioGroup>
                                </CardContent>
                                {isSubmitted && userAnswers[index] !== mcq.correctAnswer && (
                                    <CardFooter className="bg-green-500/10 border-t pt-4">
                                        <p className="text-sm text-green-700 dark:text-green-400"><strong>Correct Answer:</strong> {mcq.correctAnswer}</p>
                                    </CardFooter>
                                )}
                            </Card>
                        ))}
                    </div>

                    {!isSubmitted && (
                         <div className="mt-8 flex justify-center">
                            <Button size="lg" onClick={handleSubmit} disabled={Object.keys(userAnswers).length !== totalQuestions}>Submit Answers</Button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};
