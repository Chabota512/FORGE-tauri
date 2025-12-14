import { Mission } from "@/lib/api";
import { MissionCard } from "./MissionCard";

interface CourseColumnProps {
  courseName: string;
  missions: Mission[];
}

export function CourseColumn({ courseName, missions }: CourseColumnProps) {
  const displayName = (courseName || "").replace(/_/g, " ");
  const courseCode = (courseName || "").split("_")[0];

  return (
    <div data-testid={`column-${courseCode}`} className="flex flex-col space-y-4 w-full break-inside-avoid">
      <div className="flex items-center justify-between border-b border-border pb-2 mb-2">
        <h2 className="text-sm font-mono font-bold text-foreground uppercase tracking-wider">
          <span className="text-primary mr-2">[{courseCode}]</span>
          {displayName.split(" ").slice(1).join(" ")}
        </h2>
        <span className="text-xs text-muted-foreground font-mono" data-testid={`status-${courseCode}`}>
          {missions.filter(m => m.status === "complete").length}/{missions.length}
        </span>
      </div>

      <div className="space-y-4">
        {missions.map((mission) => (
          <MissionCard 
            key={mission.id} 
            mission={mission} 
          />
        ))}
        
        {missions.length === 0 && (
          <div className="p-8 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center text-muted-foreground">
            <p className="text-sm font-mono">NO ACTIVE MISSIONS</p>
          </div>
        )}
      </div>
    </div>
  );
}
