import { useState, useEffect, useCallback } from "react";
import type { ShareHistoryItem, ConnectionHistoryItem } from "@/types/history";
import {
  Project,
  loadProjects,
  saveProjects,
  generateProjectId,
  getRandomProjectColor,
} from "@/types/projects";

interface UseProjectsReturn {
  // Projects list
  projects: Project[];

  // CRUD operations
  createProject: (name: string, color?: string) => Project;
  updateProject: (id: string, updates: Partial<Omit<Project, "id">>) => void;
  deleteProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;

  // Share/connection association
  addShareToProject: (projectId: string, shareId: string) => void;
  removeShareFromProject: (projectId: string, shareId: string) => void;
  addConnectionToProject: (projectId: string, connectionId: string) => void;
  removeConnectionFromProject: (projectId: string, connectionId: string) => void;

  // Queries
  getProjectById: (id: string) => Project | undefined;
  getProjectForShare: (shareId: string) => Project | undefined;
  getProjectForConnection: (connectionId: string) => Project | undefined;
  getSharesInProject: (projectId: string, shares: ShareHistoryItem[]) => ShareHistoryItem[];
  getConnectionsInProject: (projectId: string, connections: ConnectionHistoryItem[]) => ConnectionHistoryItem[];

  // Stats
  totalProjects: number;
}

export function useProjects(
  shares: ShareHistoryItem[],
  connections: ConnectionHistoryItem[]
): UseProjectsReturn {
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());

  // Save to localStorage whenever projects changes
  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  // Auto-cleanup: Remove share/connection IDs that no longer exist
  useEffect(() => {
    const validShareIds = new Set(shares.map((s) => s.id));
    const validConnectionIds = new Set(connections.map((c) => c.id));

    setProjects((prev) => {
      let changed = false;
      const updated = prev.map((project) => {
        const filteredShareIds = project.shareIds.filter((id) =>
          validShareIds.has(id)
        );
        const filteredConnectionIds = project.connectionIds.filter((id) =>
          validConnectionIds.has(id)
        );

        if (
          filteredShareIds.length !== project.shareIds.length ||
          filteredConnectionIds.length !== project.connectionIds.length
        ) {
          changed = true;
          return {
            ...project,
            shareIds: filteredShareIds,
            connectionIds: filteredConnectionIds,
          };
        }
        return project;
      });

      return changed ? updated : prev;
    });
  }, [shares, connections]);

  // Create a new project
  const createProject = useCallback((name: string, color?: string): Project => {
    const newProject: Project = {
      id: generateProjectId(),
      name,
      shareIds: [],
      connectionIds: [],
      createdAt: Date.now(),
      color: color || getRandomProjectColor(),
    };

    setProjects((prev) => [newProject, ...prev]);
    return newProject;
  }, []);

  // Update a project
  const updateProject = useCallback(
    (id: string, updates: Partial<Omit<Project, "id">>) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
    },
    []
  );

  // Delete a project
  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Rename a project
  const renameProject = useCallback((id: string, name: string) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p))
    );
  }, []);

  // Add a share to a project
  const addShareToProject = useCallback((projectId: string, shareId: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id === projectId && !p.shareIds.includes(shareId)) {
          return { ...p, shareIds: [...p.shareIds, shareId] };
        }
        return p;
      })
    );
  }, []);

  // Remove a share from a project
  const removeShareFromProject = useCallback(
    (projectId: string, shareId: string) => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id === projectId) {
            return { ...p, shareIds: p.shareIds.filter((id) => id !== shareId) };
          }
          return p;
        })
      );
    },
    []
  );

  // Add a connection to a project
  const addConnectionToProject = useCallback(
    (projectId: string, connectionId: string) => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id === projectId && !p.connectionIds.includes(connectionId)) {
            return { ...p, connectionIds: [...p.connectionIds, connectionId] };
          }
          return p;
        })
      );
    },
    []
  );

  // Remove a connection from a project
  const removeConnectionFromProject = useCallback(
    (projectId: string, connectionId: string) => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id === projectId) {
            return {
              ...p,
              connectionIds: p.connectionIds.filter((id) => id !== connectionId),
            };
          }
          return p;
        })
      );
    },
    []
  );

  // Get project by ID
  const getProjectById = useCallback(
    (id: string) => projects.find((p) => p.id === id),
    [projects]
  );

  // Get project containing a specific share
  const getProjectForShare = useCallback(
    (shareId: string) =>
      projects.find((p) => p.shareIds.includes(shareId)),
    [projects]
  );

  // Get project containing a specific connection
  const getProjectForConnection = useCallback(
    (connectionId: string) =>
      projects.find((p) => p.connectionIds.includes(connectionId)),
    [projects]
  );

  // Get all shares in a project
  const getSharesInProject = useCallback(
    (projectId: string, allShares: ShareHistoryItem[]) => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) return [];
      return allShares.filter((s) => project.shareIds.includes(s.id));
    },
    [projects]
  );

  // Get all connections in a project
  const getConnectionsInProject = useCallback(
    (projectId: string, allConnections: ConnectionHistoryItem[]) => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) return [];
      return allConnections.filter((c) =>
        project.connectionIds.includes(c.id)
      );
    },
    [projects]
  );

  return {
    projects,
    createProject,
    updateProject,
    deleteProject,
    renameProject,
    addShareToProject,
    removeShareFromProject,
    addConnectionToProject,
    removeConnectionFromProject,
    getProjectById,
    getProjectForShare,
    getProjectForConnection,
    getSharesInProject,
    getConnectionsInProject,
    totalProjects: projects.length,
  };
}
