import { useEffect, useState, useCallback } from 'react';
import type { FC } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { API_BASE_URL } from '@/config';

// --- Type Definitions ---
interface MCQ { type: 'mcq'; question: string; options: string[]; correctAnswer: string; }
interface TrueFalseQuestion { type: 'true_false'; question: string; correctAnswer: boolean; }
interface ShortAnswerQuestion { type: 'short_answer'; question: string; idealAnswer: string; }
type AnyQuizQuestion = MCQ | TrueFalseQuestion | ShortAnswerQuestion;
interface QuizSet { type: 'quiz'; questions: AnyQuizQuestion[]; }
interface QuizReinforcementItem { id: string; data: QuizSet; difficulty: string; createdAt: string; }

export const QuizPage: FC = () => {
    const { collectionId, reinforcementId } = useParams<{ collectionId: string; reinforcementId: string }>();
    const navigate = useNavigate();
    const [quiz, setQuiz] = useState<QuizReinforcementItem | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [userAnswers, setUserAnswers] = useState<{[key: number]: string | boolean}>({});
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [score, setScore] = useState(0);

    useEffect(() => {
        if (!collectionId || !reinforcementId) return;
        const fetchQuiz = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/reinforcements/${reinforcementId}`);
                if (!response.ok) throw new Error((await response.json()).detail || 'Failed to load quiz.');
                setQuiz(await response.json());
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchQuiz();
    }, [collectionId, reinforcementId]);

    const handleAnswerChange = useCallback((qIndex: number, answer: string | boolean) => setUserAnswers(prev => ({ ...prev, [qIndex]: answer })), []);

    const handleSubmit = useCallback(() => {
        if (!quiz) return;
        let correctCount = 0;
        quiz.data.questions.forEach((q, index) => {
            if (q.type === 'mcq' || q.type === 'true_false') {
                if (userAnswers[index] === q.correctAnswer) correctCount++;
            }
        });
        setScore(correctCount);
        setIsSubmitted(true);
    }, [quiz, userAnswers]);

    const resetQuiz = useCallback(() => {
        setUserAnswers({});
        setScore(0);
        setIsSubmitted(false);
    }, []);

    if (isLoading) { return <div className="flex h-screen w-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>; }
    if (error) { return <div className="flex h-screen w-screen items-center justify-center text-center p-8"><div><AlertTriangle className="mx-auto h-12 w-12 mb-4 text-destructive" /><h2 className="text-xl font-semibold mb-2">Error Loading Quiz</h2><p className="text-muted-foreground">{error}</p><Button asChild className="mt-6"><Link to={`/collections/${collectionId}`}>Go Back</Link></Button></div></div>; }
    if (!quiz || !quiz.data || !quiz.data.questions || quiz.data.questions.length === 0) { 
        return (
            <div className="flex h-screen w-screen items-center justify-center text-center p-8"><div><AlertTriangle className="mx-auto h-12 w-12 mb-4 text-muted-foreground" /><h2 className="text-xl font-semibold mb-2">Quiz Not Found</h2><p className="text-muted-foreground">This quiz could not be loaded or is empty.</p><Button asChild className="mt-6"><Link to={`/collections/${collectionId}`}>Go Back</Link></Button></div></div>
        );
    }

    const autoGradedQuestions = quiz.data.questions.filter(q => q.type !== 'short_answer');
    
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
                    <h1 className="text-lg font-semibold capitalize">{quiz.difficulty} Quiz</h1>
                </div>
                <div className="flex-1" />
            </header>
            <main className="flex-1 overflow-y-auto bg-muted/40">
                <div className="container max-w-4xl mx-auto p-4 sm:py-8">
                    {isSubmitted && (
                        <Card className="mb-8">
                            <CardHeader><CardTitle className="text-2xl text-center">Quiz Results</CardTitle></CardHeader>
                            <CardContent className="text-center space-y-4">
                                <p className="text-lg">Auto-graded score:</p>
                                <p className="text-4xl font-bold">{score} / {autoGradedQuestions.length}</p>
                                <Progress value={(score / autoGradedQuestions.length) * 100} className="w-full" />
                            </CardContent>
                            <CardFooter className="flex justify-center"><Button onClick={resetQuiz}>Try Again</Button></CardFooter>
                        </Card>
                    )}

                    <div className="space-y-6">
                        {quiz.data.questions.map((q, index) => (
                            <Card key={index}>
                                <CardHeader><CardTitle>Question {index + 1}</CardTitle><p className="pt-2">{q.question}</p></CardHeader>
                                <CardContent>
                                    {q.type === 'mcq' && <MCQComponent question={q} index={index} userAnswer={userAnswers[index] as string} onAnswer={handleAnswerChange} isSubmitted={isSubmitted} />}
                                    {q.type === 'true_false' && <TrueFalseComponent question={q} index={index} userAnswer={userAnswers[index] as boolean} onAnswer={handleAnswerChange} isSubmitted={isSubmitted} />}
                                    {q.type === 'short_answer' && <ShortAnswerComponent question={q} index={index} userAnswer={userAnswers[index] as string} onAnswer={handleAnswerChange} isSubmitted={isSubmitted} />}
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {!isSubmitted && <div className="mt-8 flex justify-center"><Button size="lg" onClick={handleSubmit}>Submit Answers</Button></div>}
                </div>
            </main>
        </div>
    );
};

// --- Sub-components for Quiz Questions ---
const MCQComponent: FC<{question: MCQ, index: number, userAnswer: string, onAnswer: (i: number, a: string) => void, isSubmitted: boolean}> = ({question, index, userAnswer, onAnswer, isSubmitted}) => (
    <RadioGroup value={userAnswer} onValueChange={(val) => onAnswer(index, val)} disabled={isSubmitted}>
        {question.options.map((option, optIndex) => {
            const isCorrect = option === question.correctAnswer;
            const isSelected = userAnswer === option;
            return <div key={optIndex} className="flex items-center space-x-2"><RadioGroupItem value={option} id={`q${index}-opt${optIndex}`} /><Label htmlFor={`q${index}-opt${optIndex}`} className="flex-1">{option}</Label>{isSubmitted && isSelected && !isCorrect && <XCircle className="h-5 w-5 text-destructive" />}{isSubmitted && isCorrect && <CheckCircle className="h-5 w-5 text-green-500" />}</div>
        })}
    </RadioGroup>
);

const TrueFalseComponent: FC<{question: TrueFalseQuestion, index: number, userAnswer: boolean, onAnswer: (i: number, a: boolean) => void, isSubmitted: boolean}> = ({question, index, userAnswer, onAnswer, isSubmitted}) => (
    <RadioGroup value={userAnswer?.toString()} onValueChange={(val) => onAnswer(index, val === 'true')} disabled={isSubmitted}>
        {[true, false].map((option, optIndex) => {
            const isCorrect = option === question.correctAnswer;
            const isSelected = userAnswer === option;
            return <div key={optIndex} className="flex items-center space-x-2"><RadioGroupItem value={option.toString()} id={`q${index}-opt${optIndex}`} /><Label htmlFor={`q${index}-opt${optIndex}`} className="capitalize">{option.toString()}</Label>{isSubmitted && isSelected && !isCorrect && <XCircle className="h-5 w-5 text-destructive" />}{isSubmitted && isCorrect && <CheckCircle className="h-5 w-5 text-green-500" />}</div>
        })}
    </RadioGroup>
);

const ShortAnswerComponent: FC<{question: ShortAnswerQuestion, index: number, userAnswer: string, onAnswer: (i: number, a: string) => void, isSubmitted: boolean}> = ({question, index, userAnswer, onAnswer, isSubmitted}) => (
    <div className="space-y-4">
        <Textarea placeholder="Your answer..." value={userAnswer || ''} onChange={(e) => onAnswer(index, e.target.value)} disabled={isSubmitted} />
        {isSubmitted && (
            <div className="p-4 bg-blue-500/10 border-l-4 border-blue-500 rounded-r-md">
                <h4 className="font-semibold text-blue-800 dark:text-blue-300">Ideal Answer</h4>
                <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">{question.idealAnswer}</p>
            </div>
        )}
    </div>
);
