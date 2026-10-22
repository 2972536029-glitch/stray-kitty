// 只封装浏览器 Canvas 2D 绘制，不引入游戏引擎或业务规则。
export class CanvasPainter {
  constructor(private context: CanvasRenderingContext2D) {}
  clear() {this.context.clearRect(0, 0, this.context.canvas.width, this.context.canvas.height);}
  fillStyle(color: number, alpha = 1) {
    this.context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    this.context.globalAlpha = alpha;
    return this;
  }
  fillRect(x: number, y: number, width: number, height: number) {this.context.fillRect(x, y, width, height);}
  fillCircle(x: number, y: number, radius: number) {
    this.context.beginPath();this.context.arc(x, y, radius, 0, Math.PI * 2);this.context.fill();
  }
}
