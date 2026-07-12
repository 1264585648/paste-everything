(() => {
  'use strict';

  const button = document.getElementById('fullscreenToggle');
  if (!button) return;

  button.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      button.title = '当前浏览器不支持全屏切换';
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const active = Boolean(document.fullscreenElement);
    document.documentElement.classList.toggle('is-fullscreen', active);
    button.textContent = active ? '⤡' : '⤢';
    button.title = active ? '退出全屏工作区' : '进入全屏工作区';
    button.setAttribute('aria-label', button.title);
  });
})();
