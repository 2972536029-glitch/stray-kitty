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
  image(source: CanvasImageSource, x: number, y: number, width: number, height: number) {
    this.context.save();this.context.globalAlpha = 1;
    this.context.drawImage(source, x, y, width, height);this.context.restore();
  }
  rgba(color: number, alpha: number) {
    const hex = color.toString(16).padStart(6, '0');
    return `rgba(${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)},${alpha})`;
  }
  // 径向光晕：中心 innerAlpha 过渡到边缘 outerAlpha，用于灯泡、鬼火等发光体。
  glow(x: number, y: number, radius: number, color: number, innerAlpha = .55, outerAlpha = 0) {
    const gradient = this.context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, this.rgba(color, innerAlpha));
    gradient.addColorStop(1, this.rgba(color, outerAlpha));
    this.context.save();
    this.context.globalAlpha = 1;
    this.context.fillStyle = gradient;
    this.context.beginPath();
    this.context.arc(x, y, radius, 0, Math.PI * 2);
    this.context.fill();
    this.context.restore();
  }
  cat(x: number, y: number, breed: CatBreed, size = 64) {
    this.context.save();
    this.context.globalAlpha = 1;
    this.context.translate(Math.round(x - size / 2), Math.round(y - size * .8));
    this.context.scale(size / 64, size / 64);
    drawPixelCat(this.context, breed);
    this.context.restore();
  }
}
