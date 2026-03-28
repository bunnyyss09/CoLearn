import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Register from "./pages/Register";
import CodeEditor from "./pages/CodeEditor";
import LearningRoom from "./pages/LearningRoom";
import ChooseModule from "./pages/ChooseModule";
import Dashboard from "./pages/Dashboard";
import ProtectedRouter from "./middleWare/ProtectedRouter";
import ScrollProgress from "./components/ScrollProgress";
import PageTransition from "./components/animations/PageTransition";

const App = () => {
  const location = useLocation();

  return (
    <>
      <ScrollProgress />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          {/* Dashboard - shows user profile or room details */}
          <Route
            path="/dashboard"
            element={
              <PageTransition>
                <ProtectedRouter>
                  <Dashboard />
                </ProtectedRouter>
              </PageTransition>
            }
          />
          <Route
            path="/dashboard/:roomId"
            element={
              <PageTransition>
                <ProtectedRouter>
                  <Dashboard />
                </ProtectedRouter>
              </PageTransition>
            }
          />

          {/* The protected route for your existing code editor component */}
          <Route
            path="/code/:roomId"
            element={
              <PageTransition>
                <ProtectedRouter>
                  <CodeEditor />
                </ProtectedRouter>
              </PageTransition>
            }
          />
          <Route
            path="/learn/:roomId/choose"
            element={
              <PageTransition>
                <ProtectedRouter>
                  <ChooseModule />
                </ProtectedRouter>
              </PageTransition>
            }
          />
          <Route
            path="/learn/:roomId"
            element={
              <PageTransition>
                <ProtectedRouter>
                  <LearningRoom />
                </ProtectedRouter>
              </PageTransition>
            }
          />

          {/* Catch-all for room IDs - must be AFTER specific routes */}
          <Route
            path="/:roomId"
            element={
              <PageTransition>
                <Register />
              </PageTransition>
            }
          />
          <Route
            path="/"
            element={
              <PageTransition>
                <Register />
              </PageTransition>
            }
          />
        </Routes>
      </AnimatePresence>
    </>
  );
};

export default App;
