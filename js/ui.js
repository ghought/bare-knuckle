import { audio } from './audio.js';

const $ = id => document.getElementById(id);

class UI {
  screen(html, handlers = {}) {
    const el = $('screen');
    el.innerHTML = html;
    this._bind(el, handlers);
    return el;
  }
  clear() { $('screen').innerHTML = ''; }

  _bind(root, handlers) {
    root.querySelectorAll('[data-a]').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        if (b.disabled || b.classList.contains('disabled')) return;
        audio.ui();
        const h = handlers[b.dataset.a];
        if (h) h(b.dataset.v, b);
      });
    });
  }

  modal(html, handlers = {}, { noClose = false } = {}) {
    this.closeModal();
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.id = 'modal';
    wrap.innerHTML = `<div class="modal panel">${html}</div>`;
    if (!noClose) wrap.addEventListener('click', e => { if (e.target === wrap) this.closeModal(); });
    document.getElementById('ui').appendChild(wrap);
    this._bind(wrap, handlers);
    return wrap;
  }
  closeModal() { const m = $('modal'); if (m) m.remove(); }
  hasModal() { return !!$('modal'); }

  toast(msg, good = false, ms = 2600) {
    const t = document.createElement('div');
    t.className = 't' + (good ? ' good' : '');
    t.innerHTML = msg;
    $('toast').appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  fade(on) {
    $('fade').classList.toggle('on', on);
    return new Promise(r => setTimeout(r, 480));
  }

  async transition(fn) {
    await this.fade(true);
    await fn();
    await new Promise(r => setTimeout(r, 120));
    await this.fade(false);
  }

  // Dialogue: lines = [{who, text, shot, choices:[{t, fx, then:[]}]}]
  dialogue(lines, onLine) {
    return new Promise(resolve => {
      const box = $('dialogue');
      const sp = box.querySelector('.dlg-speaker'), tx = box.querySelector('.dlg-text'), ch = box.querySelector('.dlg-choices'), nx = box.querySelector('.dlg-next');
      box.classList.remove('hidden');
      let queue = lines.slice(), typing = null, full = '', waitingChoice = false;
      const results = [];
      const finish = () => { box.classList.add('hidden'); window.removeEventListener('keydown', key); box.removeEventListener('click', click); resolve(results); };
      const next = () => {
        if (waitingChoice) return;
        if (typing) { clearInterval(typing); typing = null; tx.innerHTML = full; showChoices(); return; }
        const line = queue.shift();
        if (!line) return finish();
        if (line.run) { line.run(); return next(); }
        onLine && onLine(line);
        const narr = !line.who;
        sp.textContent = narr ? (line.place || '') : line.who;
        sp.classList.toggle('narr', narr);
        tx.classList.toggle('narr', narr);
        ch.innerHTML = '';
        full = line.text;
        let i = 0;
        tx.innerHTML = '';
        this._cur = line;
        typing = setInterval(() => {
          i += 2;
          tx.innerHTML = full.slice(0, i);
          if (i >= full.length) { clearInterval(typing); typing = null; showChoices(); }
        }, 16);
        nx.style.visibility = line.choices ? 'hidden' : 'visible';
      };
      const showChoices = () => {
        const line = this._cur;
        if (!line || !line.choices) return;
        waitingChoice = true;
        ch.innerHTML = line.choices.map((c, i) => `<button class="pill" data-i="${i}">${c.t}</button>`).join('');
        ch.querySelectorAll('button').forEach(b => b.addEventListener('click', e => {
          e.stopPropagation();
          audio.ui();
          const c = line.choices[+b.dataset.i];
          results.push(c.id || c.t);
          if (c.fx) c.fx();
          if (c.then) queue = c.then.concat(queue);
          waitingChoice = false; ch.innerHTML = '';
          next();
        }));
      };
      const key = e => { if ((e.code === 'Space' || e.code === 'Enter') && !waitingChoice) { e.preventDefault(); next(); } };
      const click = () => next();
      window.addEventListener('keydown', key);
      box.addEventListener('click', click);
      next();
    });
  }
}
export const ui = new UI();
