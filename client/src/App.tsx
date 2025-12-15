import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { DriftProvider } from "@/contexts/DriftContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Dashboard from "@/pages/Dashboard";
import Home from "@/pages/Home";
import MissionsPage from "@/pages/Missions";
import SettingsPage from "@/pages/Settings";
import IngestPage from "@/pages/Ingest";
import KnowledgePage from "@/pages/Knowledge";
import PortfolioPage from "@/pages/Portfolio";
import TimetablePage from "@/pages/Timetable";
import ScheduleBuilderPage from "@/pages/ScheduleBuilder";
import SchedulesPage from "@/pages/Schedules";
import EditSchedulePage from "@/pages/EditSchedule";
import StatisticsPage from "@/pages/Statistics";
import LibraryPage from "@/pages/Library";
import CourseBuilderPage from "@/pages/CourseBuilder";
import CompletedMissionsPage from "@/pages/CompletedMissions";
import LandingPage from "@/pages/Landing";
import LoginPage from "@/pages/Login";
import SignupPage from "@/pages/Signup";
import ChatBuilderPage from "@/pages/ChatBuilder";
import NotFound from "@/pages/not-found";

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  if (!isAuthenticated) {
    return <Redirect to="/landing" />;
  }
  
  return <Component />;
}

function PublicOnlyRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  if (isAuthenticated) {
    return <Redirect to="/" />;
  }
  
  return <Component />;
}

function RootRedirect() {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  if (isAuthenticated) {
    return <Redirect to="/dashboard" />;
  }
  
  return <Redirect to="/landing" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/landing">
        <PublicOnlyRoute component={LandingPage} />
      </Route>
      <Route path="/login">
        <PublicOnlyRoute component={LoginPage} />
      </Route>
      <Route path="/signup">
        <PublicOnlyRoute component={SignupPage} />
      </Route>
      <Route path="/home">
        <ProtectedRoute component={Home} />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route path="/missions">
        <ProtectedRoute component={MissionsPage} />
      </Route>
      <Route path="/settings">
        <ProtectedRoute component={SettingsPage} />
      </Route>
      <Route path="/ingest">
        <ProtectedRoute component={IngestPage} />
      </Route>
      <Route path="/knowledge">
        <ProtectedRoute component={KnowledgePage} />
      </Route>
      <Route path="/portfolio">
        <ProtectedRoute component={PortfolioPage} />
      </Route>
      <Route path="/timetable">
        <ProtectedRoute component={TimetablePage} />
      </Route>
      <Route path="/schedule-builder">
        <ProtectedRoute component={ScheduleBuilderPage} />
      </Route>
      <Route path="/schedules">
        <ProtectedRoute component={SchedulesPage} />
      </Route>
      <Route path="/edit-schedule/:date">
        <ProtectedRoute component={EditSchedulePage} />
      </Route>
      <Route path="/statistics">
        <ProtectedRoute component={StatisticsPage} />
      </Route>
      <Route path="/library">
        <ProtectedRoute component={LibraryPage} />
      </Route>
      <Route path="/course-builder">
        <ProtectedRoute component={CourseBuilderPage} />
      </Route>
      <Route path="/completed">
        <ProtectedRoute component={CompletedMissionsPage} />
      </Route>
      <Route path="/chat-builder">
        <ProtectedRoute component={ChatBuilderPage} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DriftProvider>
          <Router />
          <Toaster />
        </DriftProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
