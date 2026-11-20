// Keyboard + mouse state with short input buffering for punches.
class Input {
  constructor() {
    this.held = new Set();
    this.presses = new Map();
    const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); };
    window.addEventListener('keydown', e => {
      if (typing()) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.presses.set(e.code, performance.now());
      this.held.add(e.code);
    });
    window.addEventListener('keyup', e => { this.held.delete(e.code); });
    window.addEventListener('blur', () => this.held.clear());
    const cv = document.getElementById('c');
    cv.addEventListener('mousedown', e => { const c = 'Mouse' + e.button; this.held.add(c); this.presses.set(c, performance.now()); });
    window.addEventListener('mouseup', e => this.held.delete('Mouse' + e.button));
    cv.addEventListener('contextmenu', e => e.preventDefault());
  }
  down(code) { return this.held.has(code); }
  pressed(code, buffer = 0.15) {
    const t = this.presses.get(code);
    return t !== undefined && performance.now() - t < buffer * 1000;
  }
  consume(code) { this.presses.delete(code); }
  clear() { this.presses.clear(); }
}
export const input = new Input();
