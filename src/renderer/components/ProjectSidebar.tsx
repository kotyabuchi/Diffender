import type { ProjectRecord, ReviewProgressEvent } from "../../shared/contracts";
import { ProjectItem } from "./ProjectItem";

export function ProjectSidebar({
  projects,
  selectedProjectId,
  progressByProject,
  onSelect,
  onRemove,
}: {
  projects: ProjectRecord[];
  selectedProjectId: string | null;
  progressByProject: Record<string, ReviewProgressEvent>;
  onSelect: (projectId: string) => void;
  onRemove: (project: ProjectRecord) => void;
}) {
  return (
    <aside className="sidebar" aria-label="プロジェクト">
      <div className="sidebar__heading">
        <span>プロジェクト</span>
        <span>{String(projects.length).padStart(2, "0")}</span>
      </div>
      <nav className="project-list">
        {projects.map((project) => (
          <ProjectItem
            key={project.id}
            onRemove={() => onRemove(project)}
            onSelect={() => onSelect(project.id)}
            progress={progressByProject[project.id]}
            project={project}
            selected={project.id === selectedProjectId}
          />
        ))}
      </nav>
    </aside>
  );
}
