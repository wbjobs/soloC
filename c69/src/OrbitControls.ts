import { CameraState } from './types';

export class OrbitControls {
  private isDragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(
    private element: HTMLElement,
    private camera: CameraState,
    private onChange: () => void
  ) {
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.element.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.element.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.element.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.element.addEventListener('mouseleave', this.onMouseUp.bind(this));
    this.element.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
  }

  private onMouseDown(e: MouseEvent) {
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  private onMouseMove(e: MouseEvent) {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.lastX;
    const deltaY = e.clientY - this.lastY;

    this.camera.theta -= deltaX * 0.005;
    this.camera.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.camera.phi - deltaY * 0.005));

    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.onChange();
  }

  private onMouseUp() {
    this.isDragging = false;
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    this.camera.radius = Math.max(5, Math.min(200, this.camera.radius + e.deltaY * 0.1));
    this.onChange();
  }

  getCameraPosition() {
    return {
      x: this.camera.target.x + this.camera.radius * Math.sin(this.camera.phi) * Math.sin(this.camera.theta),
      y: this.camera.target.y + this.camera.radius * Math.cos(this.camera.phi),
      z: this.camera.target.z + this.camera.radius * Math.sin(this.camera.phi) * Math.cos(this.camera.theta)
    };
  }
}
