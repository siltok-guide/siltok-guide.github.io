const start = document.getElementById('start');
const status = document.getElementById('status');
const progress = document.getElementById('progress');
let selected;

async function loadInstaller() {
  try {
    const system = new URLSearchParams(location.search).get('system');
    if (!['windows', 'macos'].includes(system)) throw Error('请选择 Windows 或 macOS 版本。');
    const response = await fetch('downloads/manifest.json?v=2026110901');
    if (!response.ok) throw Error('无法读取安装包信息，请刷新本页重试。');
    const manifest = await response.json();
    const entry = Object.entries(manifest).find(([name]) => name.endsWith(system === 'windows' ? '.exe' : '.dmg'));
    if (!entry) throw Error('暂未找到此系统的安装包，请返回安装指南。');
    selected = {name: entry[0], ...entry[1]};
    if (!selected.chunks?.length || selected.chunkSha256?.length !== selected.chunks.length) throw Error('安装包信息不完整，请联系运营人员。');
    document.getElementById('name').textContent = selected.name + ' · ' + selected.mb + ' MB';
    document.getElementById('hash').textContent = 'SHA-256：' + selected.sha256;
    start.disabled = false;
  } catch (error) {
    status.textContent = error.message;
  }
}

async function verifyChunk(bytes, expected) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  if (actual !== expected) throw Error('文件校验失败，请重新下载。');
}

start.addEventListener('click', async () => {
  start.disabled = true;
  progress.value = 0;
  const parts = [];
  let writable = null;
  let received = 0;
  try {
    if ('showSaveFilePicker' in window) {
      status.textContent = '请选择安装包的保存位置，然后开始下载。';
      const handle = await window.showSaveFilePicker({suggestedName: selected.name});
      writable = await handle.createWritable();
    }
    status.textContent = '正在下载安装包，请保持本页打开… 0%';
    for (let i = 0; i < selected.chunks.length; i++) {
      const response = await fetch(selected.chunks[i]);
      if (!response.ok) throw Error('下载失败，请检查网络后重试。');
      const bytes = await response.arrayBuffer();
      await verifyChunk(bytes, selected.chunkSha256[i]);
      received += bytes.byteLength;
      if (writable) await writable.write(bytes);
      else parts.push(bytes);
      progress.value = received / selected.bytes * 100;
      status.textContent = '正在下载安装包，请保持本页打开… ' + Math.round(progress.value) + '%';
    }
    if (received !== selected.bytes) throw Error('安装包长度不完整，请重新下载。');
    if (writable) {
      await writable.close();
      writable = null;
    } else {
      const blob = new Blob(parts, {type: 'application/octet-stream'});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = selected.name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    status.textContent = '文件校验通过，已交给浏览器保存。请打开安装包进行安装。';
    start.textContent = '重新下载';
  } catch (error) {
    if (writable) await writable.abort().catch(() => {});
    status.textContent = error.name === 'AbortError' ? '已取消保存，可点击按钮重新下载。' : error.message;
    start.textContent = '重新下载';
    progress.value = 0;
  } finally {
    start.disabled = false;
  }
});

loadInstaller();
