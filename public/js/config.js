/**
 * 简阅 - API 配置模块
 *
 * 解决 Vercel 海外服务器无法访问 wenku8.net 的问题：
 *   方案 A：设置自定义 API 地址（指向中国服务器上的完整 API）
 *   方案 B：设置中继代理地址（Vercel 通过中国中继访问 wenku8.net，需配置环境变量）
 *
 * 使用：在书架页面点击 ⚙️ 按钮打开配置面板
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'wxr_api_base';

  /** 获取当前 API 基础地址 */
  function getApiBase() {
    return localStorage.getItem(STORAGE_KEY) || '';
  }

  /** 设置 API 基础地址 */
  function setApiBase(url) {
    if (url && !url.endsWith('/')) url += '/';
    localStorage.setItem(STORAGE_KEY, url || '');
  }

  // ---- 重写 fetch，自动添加 API 基础地址 ----
  var _originalFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input instanceof Request ? input.url : input);

    if (typeof url === 'string' && url.startsWith('/api/')) {
      var base = getApiBase();
      if (base) {
        url = base + url.slice(1); // 去掉开头的 /
        if (typeof input === 'string') {
          input = url;
        } else if (input instanceof Request) {
          input = new Request(url, input);
        }
      }
    }

    return _originalFetch.call(this, input, init);
  };

  // ---- 配置面板 UI ----
  window.ConfigUI = window.ConfigUI || {};

  ConfigUI.open = function () {
    var existing = document.querySelector('.modal-overlay.config-modal');
    if (existing) existing.remove();

    var currentBase = getApiBase();
    var d = document.createElement('div');
    d.className = 'modal-overlay config-modal';
    d.innerHTML =
      '<div class="modal" onclick="event.stopPropagation()">' +
        '<h2>⚙️ 设置</h2>' +
        '<p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">' +
          '如果导入小说失败（海外服务器无法访问 wenku8.net），' +
          '请部署中继服务器到中国云平台并填写地址。' +
        '</p>' +
        '<label for="cfg-api-base" style="font-size:14px;font-weight:600;">API 服务器地址</label>' +
        '<input id="cfg-api-base" type="url" placeholder="例: https://your-server.com" value="' +
          (currentBase ? currentBase.replace(/\/$/, '') : '') +
        '" style="width:100%;margin-top:4px;">' +
        '<p style="font-size:12px;color:var(--text-muted);margin-top:6px;">' +
          '留空则使用当前 Vercel 服务器。<br>' +
          '支持完整 API 服务或中继代理。' +
        '</p>' +
        '<div id="cfg-test-result" style="margin-top:8px;font-size:13px;"></div>' +
        '<div class="modal-actions" style="margin-top:16px;">' +
          '<button class="btn btn-ghost" id="cfg-test">测试连接</button>' +
          '<button class="btn btn-ghost" id="cfg-cancel">取消</button>' +
          '<button class="btn btn-primary" id="cfg-save">保存</button>' +
        '</div>' +
      '</div>';

    d.addEventListener('click', function () { d.remove(); });
    document.body.appendChild(d);

    var input = document.getElementById('cfg-api-base');
    var testResult = document.getElementById('cfg-test-result');
    var testBtn = document.getElementById('cfg-test');
    var saveBtn = document.getElementById('cfg-save');
    var cancelBtn = document.getElementById('cfg-cancel');

    // 测试连接
    testBtn.addEventListener('click', async function () {
      var testBase = input.value.trim().replace(/\/$/, '');
      if (!testBase) {
        testResult.innerHTML = '<span style="color:var(--text-muted)">使用默认 Vercel 服务器，测试中...</span>';
        testBase = window.location.origin;
      } else {
        testResult.innerHTML = '<span style="color:var(--text-muted)">测试 ' + testBase + ' ...</span>';
      }

      try {
        var testUrl = testBase + '/api/novel/3281';
        var resp = await _originalFetch(testUrl, { signal: AbortSignal.timeout(15000) });
        if (resp.ok) {
          var data = await resp.json();
          testResult.innerHTML = '<span style="color:#4CAF50">✅ 连接成功！' + (data.title || '') + '</span>';
        } else {
          var errText = 'HTTP ' + resp.status;
          try { var errData = await resp.json(); errText = errData.error || errText; } catch (e) {}
          testResult.innerHTML = '<span style="color:#f44336">❌ 连接失败: ' + errText + '</span>';
        }
      } catch (err) {
        testResult.innerHTML = '<span style="color:#f44336">❌ 连接失败: ' + err.message + '</span>';
      }
    });

    // 保存
    saveBtn.addEventListener('click', function () {
      var newBase = input.value.trim().replace(/\/$/, '');
      setApiBase(newBase);
      d.remove();
      if (window.App && App.td) {
        // 刷新书架
        var toast = document.getElementById('toast');
        if (toast) {
          toast.textContent = newBase ? '已设置 API: ' + newBase : '已恢复默认 API';
          toast.classList.remove('hidden');
          clearTimeout(toast._t);
          toast._t = setTimeout(function () { toast.classList.add('hidden'); }, 2000);
        }
      }
    });

    // 取消
    cancelBtn.addEventListener('click', function () { d.remove(); });

    setTimeout(function () { input.focus(); }, 100);
  };
})();
