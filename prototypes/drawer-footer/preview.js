const stage = document.querySelector('.stage');
const menu = document.querySelector('.prototype-menu');
const toggle = document.querySelector('.prototype-toggle');
const action = document.querySelector('.sync-action');
const feedback = document.querySelector('.feedback');
const labels = { synced: '已同步', pending: '有更改待同步', offline: '离线', conflict: '有冲突待处理' };
let state = 'synced';
let locked = false;
let timer;

toggle.addEventListener('click', () => {
  menu.hidden = !menu.hidden;
  toggle.setAttribute('aria-expanded', String(!menu.hidden));
});
document.querySelector('#preview-state').addEventListener('change', event => {
  state = event.target.value;
  stage.dataset.state = state;
  document.querySelector('#sync-state').textContent = labels[state];
  document.querySelector('#sync-time').textContent = state === 'pending' ? '最近同步：今天 09:42 · 待传 3 项' : '最近同步：今天 09:42';
  feedback.textContent = '';
});
document.querySelector('#preview-theme').addEventListener('change', event => { document.body.dataset.theme = event.target.value; });
action.addEventListener('click', () => {
  if (locked) return;
  if (state === 'conflict' || state === 'offline') {
    feedback.textContent = state === 'conflict' ? '请先在设置中处理冲突' : '离线时保留本机数据';
    return;
  }
  locked = true;
  action.disabled = true;
  action.classList.add('is-working');
  action.setAttribute('aria-label', '正在同步并检查更新');
  feedback.textContent = '演示：正在同步并检查更新';
  timer = setTimeout(() => {
    locked = false;
    action.disabled = false;
    action.classList.remove('is-working');
    action.setAttribute('aria-label', '同步并检查更新');
    feedback.textContent = '演示完成，未操作真实数据';
  }, 900);
});
document.querySelector('.settings').addEventListener('click', () => { feedback.textContent = '正式版可在此管理云同步和设备'; });
window.addEventListener('pagehide', () => clearTimeout(timer));
