export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER';
}

export interface Space {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  myRole: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER' | null;
}

export interface TreeNode {
  id: string;
  parentId: string | null;
  type: 'FOLDER' | 'DOC';
  title: string;
  path: string;
  sortKey: string;
  document: { id: string } | null;
}

export interface DocPayload {
  node: { id: string; title: string; parentId: string | null; updatedAt: string };
  document: { id: string; content: string; version: number };
  lock: { userId: string; holder: string; expiresAt: string } | null;
}

export interface SearchHit {
  nodeId: string;
  type: 'FOLDER' | 'DOC';
  title: string;
  titleHit: boolean;
  snippet: string | null;
}
