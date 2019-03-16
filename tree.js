'use strict';

{
  const Emitter = typeof window.Emitter === 'undefined' ? class Emitter {
    constructor() {
      this.events = {};
    }
    on(name, callback) {
      this.events[name] = this.events[name] || [];
      this.events[name].push(callback);
    }
    once(name, callback) {
      callback.once = true;
      this.on(name, callback);
    }
    emit(name, ...data) {
      (this.events[name] || []).forEach(c => {
        c(...data);
        if (c.once) {
          const index = this.events[name].indexOf(c);
          this.events[name].splice(index, 1);
        }
      });
    }
  } : window.Emitter;

  class SimpleTree extends Emitter {
    constructor(parent) {
      super();
      // do not toggle with click
      parent.addEventListener('click', e => {
        // e.clientX to prevent stopping Enter key
        // e.detail to prevent dbl-click
        // e.offsetX to allow plus and minus clicking
        if (e && e.clientX && e.detail === 1 && e.offsetX >= 0) {
          return e.preventDefault();
        }
        if (e.target.dataset.type === SimpleTree.FILE) {
          this.emit('action', e.target);
        }
      });
      parent.classList.add('simple-tree');
      this.parent = parent.appendChild(document.createElement('details'));
      this.parent.appendChild(document.createElement('summary'));
      this.parent.open = true;
      // use this function to alter a node before being passed to this.file or this.folder
      this.interrupt = node => node;
    }
    append(element, parent, before, callback = () => {}) {
      if (before) {
        parent.insertBefore(element, before);
      }
      else {
        parent.appendChild(element);
      }
      callback();
      return element;
    }
    file(node, parent = this.parent, before) {
      parent = parent.closest('details');
      node = this.interrupt(node);
      const a = this.append(Object.assign(document.createElement('a'), {
        textContent: node.name,
        href: '#'
      }), parent, before);
      this.emit('created', a, node);
      a.dataset.type = SimpleTree.FILE;
      return a;
    }
    folder(node, parent = this.parent, before) {
      parent = parent.closest('details');
      node = this.interrupt(node);
      const details = document.createElement('details');
      const summary = Object.assign(document.createElement('summary'), {
        textContent: node.name
      });
      details.appendChild(summary);
      this.append(details, parent, before, () => {
        details.open = node.open;
        details.dataset.type = SimpleTree.FOLDER;
      });
      this.emit('created', summary, node);
      return summary;
    }
    open(details) {
      details.open = true;
    }
    hierarchy(element = this.active()) {
      if (this.parent.contains(element)) {
        const list = [];
        while (element !== this.parent) {
          list.push(element);
          element = element.parentElement;
        }
        return list.filter(e => e.dataset.type);
      }
      else {
        return [];
      }
    }
    siblings(element = this.parent.querySelector('a, detail')) {
      if (this.parent.contains(element)) {
        if (element.dataset.type === undefined) {
          element = element.parentElement;
        }
        return [...element.parentElement.children].filter(e => {
          return e.dataset.type === SimpleTree.FILE || e.dataset.type === SimpleTree.FOLDER;
        }).map(e => {
          if (e.dataset.type === SimpleTree.FILE) {
            return e;
          }
          else {
            return e.querySelector('summary');
          }
        });
      }
      else {
        return [];
      }
    }
    children(details) {
      const e = details.querySelector('a, details');
      if (e) {
        return this.siblings(e);
      }
      else {
        return [];
      }
    }
  }
  SimpleTree.FILE = 'file';
  SimpleTree.FOLDER = 'folder';

  class AsyncTree extends SimpleTree {
    constructor(parent, options) {
      super(parent, options);
      // do not allow toggling when folder is loading
      parent.addEventListener('click', e => {
        const details = e.target.parentElement;
        if (details.open && details.dataset.loaded === 'false') {
          e.preventDefault();
        }
      });
      parent.classList.add('async-tree');
    }
    // add open event for folder creation
    folder(...args) {
      const summary = super.folder(...args);
      const details = summary.closest('details');
      details.addEventListener('toggle', () => {
        this.emit(details.dataset.loaded === 'false' && details.open ? 'fetch' : 'open', summary);
      });
      summary.resolve = () => {
        details.dataset.loaded = true;
        this.emit('open', summary);
      };
      return summary;
    }
    asyncFolder(node, parent, before) {
      const summary = this.folder(node, parent, before);
      const details = summary.closest('details');
      details.dataset.loaded = false;

      if (node.open) {
        this.open(details);
      }

      return summary;
    }
    unloadFolder(details) {
      details.open = false;
      const focused = this.active();
      if (focused && this.parent.contains(focused)) {
        details.querySelector('summary').focus();
      }
      [...details.children].slice(1).forEach(e => e.remove());
      details.dataset.loaded = false;
    }
    browse(validate, es = this.siblings()) {
      for (const e of es) {
        if (validate(e)) {
          this.select(e);
          if (e.dataset.type === SimpleTree.FILE) {
            return this.emit('browse', e);
          }
          const parent = e.closest('details');
          if (parent.open) {
            return this.browse(validate, this.children(parent));
          }
          else {
            this.once('open', () => this.browse(validate, this.children(parent)));
            this.open(parent);
            return;
          }
        }
      }
      this.emit('browse');
    }
  }

  class SelectTree extends AsyncTree {
    constructor(parent, options = {}) {
      super(parent, options);
      parent.addEventListener('focusin', e => {
        const {target} = e;
        if (target.classList.contains('selected')) {
          return;
        }
        [...this.parent.querySelectorAll('.selected')].forEach(e => e.classList.remove('selected'));
        target.classList.add('selected');
        this.emit('select', target);
      });
      this.on('created', (element, node) => {
        if (node.selected) {
          this.select(element);
        }
      });
      parent.classList.add('select-tree');
      // navigate
      if (options.navigate) {
        this.parent.addEventListener('keydown', e => {
          const {code} = e;
          if (code === 'ArrowUp' || code === 'ArrowDown') {
            this.navigate(code === 'ArrowUp' ? 'backward' : 'forward');
            e.preventDefault();
          }
        });
      }
    }
    select(element) {
      const summary = element.querySelector('summary');
      if (summary) {
        summary.focus();
      }
      else {
        element.focus();
      }
    }
    active() {
      return this.parent.querySelector('.selected');
    }
    navigate(direction = 'forward') {
      const e = this.active();
      if (e) {
        const list = [...this.parent.querySelectorAll('a, summary')];
        const index = list.indexOf(e);
        const candidates = direction === 'forward' ? list.slice(index + 1) : list.slice(0, index).reverse();
        for (const m of candidates) {
          if (m.getBoundingClientRect().height) {
            return this.select(m);
          }
        }
      }
    }
  }

  class JSONTree extends SelectTree {
    json(array, parent) {
      array.forEach(item => {
        if (item.type === SimpleTree.FOLDER) {
          const folder = this[item.asynced ? 'asyncFolder' : 'folder'](item, parent);
          if (item.children) {
            this.json(item.children, folder);
          }
        }
        else {
          this.file(item, parent);
        }
      });
    }
  }

  window.Tree = JSONTree;
}
