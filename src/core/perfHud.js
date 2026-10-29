// ?dev=perf overlay: fps, frame interval / JS cost, draw calls, triangles, GPU memory
// counts and the adaptive quality level. Refreshes twice a second (one text write).
export function mountPerfHud(engine) {
  if (document.getElementById('perf-hud')) return;
  const el = document.createElement('pre');
  el.id = 'perf-hud';
  Object.assign(el.style, {
    position: 'fixed', left: '4px', top: '4px', zIndex: '9999', margin: '0', padding: '4px 6px',
    font: '11px/1.25 monospace', color: '#b8ffb0', background: 'rgba(0, 0, 0, 0.62)',
    pointerEvents: 'none', whiteSpace: 'pre', borderRadius: '3px',
  });
  document.body.appendChild(el);
  let lastN = engine.frameNo, lastT = performance.now();
  setInterval(() => {
    const S = engine.stats, r = engine.renderer, now = performance.now();
    const fps = ((engine.frameNo - lastN) * 1000) / Math.max(1, now - lastT);
    lastN = engine.frameNo;
    lastT = now;
    const m = r.info.memory;
    const heap = performance.memory ? ` heap ${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)}MB` : '';
    el.textContent =
      `${fps.toFixed(0)} fps  ${(S.dt * 1000).toFixed(1)}ms (worst ${(S.worst * 1000).toFixed(0)})  js ${S.cpu.toFixed(1)}ms\n` +
      `calls ${S.calls}  tris ${(S.tris / 1000).toFixed(1)}k\n` +
      `geo ${m.geometries}  tex ${m.textures}  prog ${r.info.programs?.length ?? 0}${heap}\n` +
      `${engine.quality} px ${engine.pixelRatio?.toFixed(2)}  gov L${engine.gov.level}${engine.gov.on ? '' : ' off'}  ${engine.width}x${engine.height}`;
    S.worst = 0;
  }, 500);
}
