import {drawPixelCat, type CatBreed} from './pixelCat';
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
  cat(x: number, y: number, breed: CatBreed, size = 64) {
    this.context.save();
    this.context.globalAlpha = 1;
    this.context.translate(Math.round(x - size / 2), Math.round(y - size * .8));
    this.context.scale(size / 32, size / 32);
    drawPixelCat(this.context, breed);
    this.context.restore();
  }
}
