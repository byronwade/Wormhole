// Wormhole Projects Types
// Organize shares and connections into project groups

export interface Project {
  id: string;
  name: string;
  shareIds: string[]; // IDs of shares belonging to this project
  connectionIds: string[]; // IDs of connections belonging to this project
  createdAt: number; // Unix timestamp
  color?: string; // Optional color for visual distinction
}

export const PROJECTS_STORAGE_KEY = "wormhole_projects";

// Predefined project colors
export const PROJECT_COLORS = [
  "#355E3B", // Wormhole Hunter Green
  "#3B82F6", // Blue
  "#10B981", // Green
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#EC4899", // Pink
  "#06B6D4", // Cyan
  "#4A7C59", // Hunter Green Light
];

// Generate unique ID for project
export function generateProjectId(): string {
  return `proj-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Load projects from localStorage
export function loadProjects(): Project[] {
  try {
    const stored = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!stored) {
      return [];
    }
    return JSON.parse(stored) as Project[];
  } catch (e) {
    console.error("Failed to load projects:", e);
    return [];
  }
}

// Save projects to localStorage
export function saveProjects(projects: Project[]): void {
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error("Failed to save projects:", e);
  }
}

// Get a random project color
export function getRandomProjectColor(): string {
  return PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
}
