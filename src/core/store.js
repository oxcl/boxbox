import { ext } from './ext.js';
import { DEFAULT_STATE } from './model.js';

const KEY = 'box';

/** Single JSON document in storage.local with an in-memory copy and change listeners. */
export class Store {
  constructor() { this.state = DEFAULT_STATE(); this.listeners = new Set(); this.ready = null; this._chain = Promise.resolve(); }

  load() {
    if (!this.ready) this.ready = (async () => {
      const got = await ext.storage.local.get(KEY);
      const saved = got[KEY];
      const d = DEFAULT_STATE();
      this.state = saved ? { ...d, ...saved, settings: { ...d.settings, ...saved.settings }, user: { ...d.user, ...saved.user } } : d;
      return this.state;
    })();
    return this.ready;
  }

  get() { return this.state; }

  /** Serialised read-modify-write. The mutator may mutate the draft in place or return a replacement. */
  update(mutator) {
    const run = async () => {
      await this.load();
      const draft = this.state;
      const ret = await mutator(draft);
      if (ret && ret !== draft) this.state = ret;
      await ext.storage.local.set({ [KEY]: this.state });
      for (const l of this.listeners) { try { l(this.state); } catch (e) { console.error(e); } }
      return this.state;
    };
    const p = this._chain.catch(() => {}).then(run);
    this._chain = p.catch(() => {});
    return p;
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}
