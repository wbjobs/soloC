export interface Artifact {
  id: string;
  name: string;
  era: string;
  description: string;
  modelUrl: string;
  position: { x: number; y: number; z: number };
  scale: number;
  audioUrl: string;
}
