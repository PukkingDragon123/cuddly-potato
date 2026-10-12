import { screenShell } from './common.js';
export function mount(el, ctx) { const s = screenShell(el, { render: () => null }); return { dispose: () => s.dispose(), refresh: () => s.render() }; }
