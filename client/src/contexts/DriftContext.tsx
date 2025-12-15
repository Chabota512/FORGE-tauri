import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useUnresolvedDriftEvents, type ScheduleDriftEvent } from "@/lib/api";
import { RescheduleModal } from "@/components/RescheduleModal";
import { useLocation } from "wouter";

interface DriftContextType {
  currentDriftEvent: ScheduleDriftEvent | null;
  showRescheduleModal: (event: ScheduleDriftEvent) => void;
  dismissDrift: () => void;
  hasPendingDrift: boolean;
}

const DriftContext = createContext<DriftContextType | null>(null);

export function useDrift() {
  const context = useContext(DriftContext);
  if (!context) {
    throw new Error("useDrift must be used within a DriftProvider");
  }
  return context;
}

interface DriftProviderProps {
  children: ReactNode;
}

export function DriftProvider({ children }: DriftProviderProps) {
  const [, setLocation] = useLocation();
  const today = new Date().toISOString().split("T")[0];
  const { data: unresolvedEvents } = useUnresolvedDriftEvents(today);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [currentEvent, setCurrentEvent] = useState<ScheduleDriftEvent | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!unresolvedEvents || unresolvedEvents.length === 0) return;
    
    const newEvent = unresolvedEvents.find(
      (e) => !dismissedIds.has(e.id) && !e.resolved
    );
    
    if (newEvent && !modalOpen && !currentEvent) {
      setTimeout(() => {
        setCurrentEvent(newEvent);
        setModalOpen(true);
      }, 1000);
    }
  }, [unresolvedEvents, dismissedIds, modalOpen, currentEvent]);

  const showRescheduleModal = (event: ScheduleDriftEvent) => {
    setCurrentEvent(event);
    setModalOpen(true);
  };

  const dismissDrift = () => {
    if (currentEvent) {
      setDismissedIds((prev) => {
        const newSet = new Set(Array.from(prev));
        newSet.add(currentEvent.id);
        return newSet;
      });
    }
    setCurrentEvent(null);
    setModalOpen(false);
  };

  const handleManualEdit = () => {
    setLocation("/schedule-builder");
  };

  const handleModalClose = (open: boolean) => {
    if (!open) {
      setCurrentEvent(null);
    }
    setModalOpen(open);
  };

  const hasPendingDrift = (unresolvedEvents?.filter(
    (e) => !dismissedIds.has(e.id) && !e.resolved
  ).length || 0) > 0;

  return (
    <DriftContext.Provider
      value={{
        currentDriftEvent: currentEvent,
        showRescheduleModal,
        dismissDrift,
        hasPendingDrift,
      }}
    >
      {children}
      {currentEvent && (
        <RescheduleModal
          open={modalOpen}
          onOpenChange={handleModalClose}
          driftEvent={currentEvent}
          onManualEdit={handleManualEdit}
        />
      )}
    </DriftContext.Provider>
  );
}
