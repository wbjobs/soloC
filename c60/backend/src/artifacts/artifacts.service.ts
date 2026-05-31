import { Injectable } from '@nestjs/common';
import { Artifact } from './artifact.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ArtifactsService {
  private readonly artifacts: Artifact[] = [
    {
      id: uuidv4(),
      name: '青铜鼎',
      era: '商代',
      description: '这是一件精美的商代青铜鼎，是古代贵族用于祭祀的重要礼器。鼎身饰有精美的饕餮纹，展现了古代工匠高超的铸造技艺。',
      modelUrl: '/assets/models/bronze_ding.glb',
      position: { x: -3, y: 0, z: -5 },
      scale: 1.5,
      audioUrl: '/assets/audio/bronze_ding.mp3',
    },
    {
      id: uuidv4(),
      name: '青花瓷瓶',
      era: '明代',
      description: '这件青花瓷瓶是明代景德镇窑的代表作品。瓶身绘有缠枝莲纹，青花发色纯正，釉面温润如玉，是中国古代瓷器艺术的巅峰之作。',
      modelUrl: '/assets/models/blue_white_vase.glb',
      position: { x: 3, y: 0, z: -5 },
      scale: 1.2,
      audioUrl: '/assets/audio/blue_white_vase.mp3',
    },
    {
      id: uuidv4(),
      name: '兵马俑',
      era: '秦代',
      description: '秦始皇陵兵马俑是世界八大奇迹之一。这尊兵马俑俑身高大，神态生动，展现了秦代军队的威武气势和古代雕塑艺术的高超水平。',
      modelUrl: '/assets/models/terracotta_warrior.glb',
      position: { x: 0, y: 0, z: -8 },
      scale: 2,
      audioUrl: '/assets/audio/terracotta_warrior.mp3',
    },
  ];

  findAll(): Artifact[] {
    return this.artifacts;
  }

  findOne(id: string): Artifact {
    return this.artifacts.find(artifact => artifact.id === id);
  }
}
