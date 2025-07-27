import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { CollectionPage } from './pages/CollectionPage';
import { MindMapPage } from './pages/MindMapPage';
import { MCQPage } from './pages/MCQPage';
import { QuizPage } from './pages/QuizPage';
import { FlashcardPage } from './pages/FlashcardPage';
import { TeachMeBackPage } from './pages/TeachMeBackPage';
import { DocumentPage } from './pages/DocumentPage';

function App() {
  return (
    <div className="h-[100dvh] overflow-y-auto bg-background font-sans antialiased">
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/collections/:collectionId" element={<CollectionPage />} />
          <Route path="/collections/:collectionId/sources/:sourceId" element={<DocumentPage />} />
          <Route path="/collections/:collectionId/mindmap" element={<MindMapPage />} />
          <Route path="/collections/:collectionId/mcq/:reinforcementId" element={<MCQPage />} />
          <Route path="/collections/:collectionId/quiz/:reinforcementId" element={<QuizPage />} />
          <Route path="/collections/:collectionId/flashcardSet/:reinforcementId" element={<FlashcardPage />} />
          <Route path="/collections/:collectionId/teachmeback" element={<TeachMeBackPage />} />
        </Routes>
      </Router>
    </div>
  );
}

export default App;
