export interface Region {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  startTime: number;
  endTime: number;
  subtitleOffset?: number;
}

export interface VideoInfo {
  width: number;
  height: number;
  duration: number;
  fps: number;
}
