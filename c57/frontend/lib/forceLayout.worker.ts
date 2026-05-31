import * as d3 from 'd3';

interface Node {
  id: string;
  name: string;
  type: string;
  isMain?: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface Link {
  source: string | Node;
  target: string | Node;
}

interface LayoutMessage {
  type: 'layout';
  nodes: Node[];
  links: Link[];
  width: number;
  height: number;
}

interface TickMessage {
  type: 'tick';
  nodes: Node[];
}

interface DoneMessage {
  type: 'done';
  nodes: Node[];
}

const PRECOMPUTE_TICKS = 150;
const ALPHA_MIN = 0.05;
const MAX_VELOCITY_DECAY = 0.45;

let simulation: d3.Simulation<Node, Link> | null = null;
let intervalId: number | null = null;

self.onmessage = (e: MessageEvent<LayoutMessage>) => {
  if (e.data.type === 'layout') {
    const { nodes, links, width, height } = e.data;
    
    if (simulation) {
      simulation.stop();
    }
    if (intervalId) {
      clearInterval(intervalId);
    }

    const nodeData = nodes.map(n => ({ ...n }));

    simulation = d3.forceSimulation<Node>(nodeData)
      .velocityDecay(MAX_VELOCITY_DECAY)
      .alphaDecay(0.02)
      .force('link', d3.forceLink<Node, Link>(links).id(d => d.id).distance(100).iterations(1))
      .force('charge', d3.forceManyBody().strength(-180).theta(0.95))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(28).iterations(1))
      .stop();

    for (let i = 0; i < PRECOMPUTE_TICKS; i++) {
      simulation.tick();
    }

    self.postMessage({ type: 'tick', nodes: nodeData } as TickMessage);

    let tickCount = 0;
    const maxTicks = 300;

    intervalId = self.setInterval(() => {
      if (!simulation) return;

      for (let i = 0; i < 5; i++) {
        simulation.tick();
      }
      tickCount += 5;

      self.postMessage({ type: 'tick', nodes: nodeData } as TickMessage);

      if (simulation.alpha() < ALPHA_MIN || tickCount >= maxTicks) {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        self.postMessage({ type: 'done', nodes: nodeData } as DoneMessage);
      }
    }, 16);
  }
};

export {};
