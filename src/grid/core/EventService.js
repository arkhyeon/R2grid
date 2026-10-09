// api.addEventListener / removeEventListener / addGlobalListener 동작 재현
export class EventService {
  constructor() {
    this.listeners = new Map();
    this.globalListeners = new Set();
  }

  addEventListener(type, listener) {
    if (typeof listener !== 'function') return;
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  addGlobalListener(listener) {
    this.globalListeners.add(listener);
  }

  removeGlobalListener(listener) {
    this.globalListeners.delete(listener);
  }

  hasListeners(type) {
    return !!this.listeners.get(type)?.size || this.globalListeners.size > 0;
  }

  dispatch(event) {
    const set = this.listeners.get(event.type);
    if (set && set.size) {
      for (const l of [...set]) l(event);
    }
    if (this.globalListeners.size) {
      for (const l of [...this.globalListeners]) l(event.type, event);
    }
  }

  clear() {
    this.listeners.clear();
    this.globalListeners.clear();
  }
}
