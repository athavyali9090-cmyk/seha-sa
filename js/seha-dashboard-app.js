/**
 * Seha Sick Leave Management Engine & Dashboard
 * Built to match the exact Seha visual design system and user requirements.
 */

(function () {
  'use strict';

  // State & Permanent Storage Keys
  const SEHA_STORAGE_KEY = 'seha_clean_leaves_v6';
  const SEHA_DELETED_KEY = 'seha_clean_deleted_leaves_v6';

  // Completely clean any old random/seeded keys so user starts with a 100% clean database
  try {
    [
      'seha_manual_leaves_v5',
      'seha_user_deleted_leaves_v5',
      'seha_manual_leaves_v4',
      'seha_manual_leaves_v3',
      'seha_user_custom_leaves_v3',
      'seha_user_deleted_leaves_v3',
      'seha_permanent_sick_leaves_v2',
      'seha_deleted_sick_leaves_v2',
      'seha_custom_sick_leaves',
      'seha_permanent_leaves_db_v2',
      'seha_deleted_leaves_ids_v2'
    ].forEach(k => localStorage.removeItem(k));
  } catch (e) {}

  let leavesData = [];
  let currentEditingLeave = null;
  let isModalOpen = false;
  let isDeleteModalOpen = false;
  let leaveToDelete = null;
  let searchQuery = '';

  // Local Storage Helpers for Permanent Retention
  function getLocalLeaves() {
    try {
      const raw = localStorage.getItem(SEHA_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function setLocalLeaves(leaves) {
    try {
      localStorage.setItem(SEHA_STORAGE_KEY, JSON.stringify(leaves));
    } catch (e) {
      console.warn("Error saving to local storage:", e);
    }
  }

  function getDeletedCodes() {
    try {
      const raw = localStorage.getItem(SEHA_DELETED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function addDeletedCode(codeOrId) {
    try {
      if (!codeOrId) return;
      const list = getDeletedCodes();
      const str = String(codeOrId).toLowerCase().trim();
      if (!list.includes(str)) {
        list.push(str);
        localStorage.setItem(SEHA_DELETED_KEY, JSON.stringify(list));
      }
    } catch (e) {
      console.warn("Error recording deleted code:", e);
    }
  }

  // Generate unique Leave Code: GSL + 12 digits
  function generateLeaveCode() {
    const digits = Math.floor(100000000000 + Math.random() * 900000000000);
    return `GSL${digits}`;
  }

  // Get Today formatted as YYYY-MM-DD
  function getTodayString() {
    return new Date().toISOString().split('T')[0];
  }

  // Calculate days between two dates inclusive
  function calculateDays(fromStr, toStr) {
    if (!fromStr || !toStr) return 1;
    const parts1 = fromStr.split('-').map(Number);
    const parts2 = toStr.split('-').map(Number);
    if (parts1.length < 3 || parts2.length < 3 || isNaN(parts1[0]) || isNaN(parts2[0])) return 1;
    const d1 = Date.UTC(parts1[0], parts1[1] - 1, parts1[2]);
    const d2 = Date.UTC(parts2[0], parts2[1] - 1, parts2[2]);
    const diff = d2 - d1;
    if (diff < 0) return 1;
    return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)) + 1);
  }

  // Check login state
  function isLoggedIn() {
    return localStorage.getItem('seha_logged_in') === 'true';
  }

  function setLoggedIn(val) {
    if (val) {
      localStorage.setItem('seha_logged_in', 'true');
      localStorage.setItem('JWTUserToken', 'seha_token_77889900');
      document.cookie = "JWTUserToken=seha_token_77889900;path=/;max-age=86400";
    } else {
      localStorage.removeItem('seha_logged_in');
      localStorage.removeItem('JWTUserToken');
      document.cookie = "JWTUserToken=;path=/;max-age=0";
    }
  }

  // Fetch leaves from central server database
  async function fetchLeaves() {
    try {
      const res = await fetch('/api/sick-leaves');
      if (res.ok) {
        const json = await res.json();
        leavesData = Array.isArray(json.data) ? json.data : [];
        setLocalLeaves(leavesData);
        renderDashboard();
        return;
      }
    } catch (err) {
      console.warn('Error fetching leaves from server, falling back to local:', err);
    }
    leavesData = getLocalLeaves();
    renderDashboard();
  }

  // Save or update leave IMMEDIATELY from first click ("من أول مرة")
  async function saveLeave(leaveObj, isEdit) {
    const codeKey = String(leaveObj.NormalizedServiceCode || '').toLowerCase().trim();
    const idKey = String(leaveObj.id || '').toLowerCase().trim();

    // 1. Remove from deleted codes if being re-added/edited
    try {
      const delList = getDeletedCodes().filter(c => c !== codeKey && c !== idKey);
      localStorage.setItem(SEHA_DELETED_KEY, JSON.stringify(delList));
    } catch (e) {}

    // 2. Update memory state immediately
    const existingIdx = leavesData.findIndex(l => 
      (codeKey && String(l.NormalizedServiceCode || '').toLowerCase().trim() === codeKey) ||
      (idKey && String(l.id || '').toLowerCase().trim() === idKey)
    );

    if (existingIdx >= 0) {
      leavesData[existingIdx] = { ...leavesData[existingIdx], ...leaveObj, UpdatedAt: new Date().toISOString() };
    } else {
      leavesData.unshift(leaveObj);
    }

    // 3. Save to local storage immediately
    setLocalLeaves(leavesData);

    // 4. Update UI & close modal immediately without delay
    closeModal();
    renderDashboard();
    showToast(isEdit ? 'تم تحديث الإجازة وحفظها بنجاح' : 'تمت إضافة الإجازة وحفظها في قاعدة البيانات');

    // 5. Send to server in background
    try {
      const url = isEdit 
        ? `/api/sick-leaves/${encodeURIComponent(leaveObj.id || leaveObj.NormalizedServiceCode)}` 
        : '/api/sick-leaves';
      const method = isEdit ? 'PUT' : 'POST';
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leaveObj)
      });
    } catch (e) {
      console.warn("Background server save warning:", e);
    }
  }

  // Delete leave IMMEDIATELY from first click ("من أول مرة")
  async function deleteLeave(id) {
    const targetKey = String(id || '').toLowerCase().trim();

    // 1. Track deleted code so it never comes back
    addDeletedCode(targetKey);
    if (leaveToDelete) {
      if (leaveToDelete.NormalizedServiceCode) addDeletedCode(leaveToDelete.NormalizedServiceCode);
      if (leaveToDelete.id) addDeletedCode(leaveToDelete.id);
    }

    // 2. Remove from memory state immediately
    leavesData = leavesData.filter(l => 
      String(l.id || '').toLowerCase().trim() !== targetKey &&
      String(l.NormalizedServiceCode || '').toLowerCase().trim() !== targetKey
    );

    // 3. Save to local storage immediately
    setLocalLeaves(leavesData);

    // 4. Update UI & close modal immediately
    closeDeleteModal();
    renderDashboard();
    showToast('تم حذف الإجازة من قاعدة البيانات بنجاح');

    // 5. Send to server in background
    try {
      await fetch(`/api/sick-leaves/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
    } catch (e) {
      console.warn("Background server delete warning:", e);
    }
  }

  // Toast notification
  function showToast(msg) {
    const existing = document.getElementById('seha-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'seha-toast';
    toast.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>${msg}</span>
      </div>
    `;
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #0f172a;
      color: #ffffff;
      padding: 12px 24px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 700;
      box-shadow: 0 10px 25px rgba(0,0,0,0.25);
      z-index: 999999;
      direction: rtl;
      display: flex;
      align-items: center;
      transition: opacity 0.3s;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Filter leaves
  function getFilteredLeaves() {
    if (!searchQuery.trim()) return leavesData;
    const q = searchQuery.trim().toLowerCase();
    return leavesData.filter(l => {
      const id = String(l.PatientId || '').toLowerCase();
      const code = String(l.NormalizedServiceCode || '').toLowerCase();
      const name = String(l.PatientName || '').toLowerCase();
      const hospital = String(l.Hospital || l.OrganizationName || '').toLowerCase();
      return id.includes(q) || code.includes(q) || name.includes(q) || hospital.includes(q);
    });
  }

  // Count active / expired
  function getMetrics() {
    const total = leavesData.length;
    let active = 0;
    let expired = 0;
    const today = new Date().toISOString().split('T')[0];

    leavesData.forEach(l => {
      if (l.Status && (l.Status.includes('سارية') || l.Status.includes('نشطة'))) {
        active++;
      } else if (l.To && l.To < today) {
        expired++;
      } else if (l.Status && l.Status.includes('منتهية')) {
        expired++;
      } else {
        active++;
      }
    });

    return { total, active, expired };
  }

  // Render Dashboard Root
  function renderDashboard() {
    const isHashDashboard = window.location.hash.startsWith('#/Dashboard');
    let container = document.getElementById('seha-admin-dashboard-container');

    if (!isHashDashboard) {
      if (container) container.style.display = 'none';
      return;
    }

    if (!isLoggedIn()) {
      // If user tries to open #/Dashboard without being logged in, redirect to login
      if (container) container.style.display = 'none';
      window.location.hash = '#/account/login';
      return;
    }

    if (!container) {
      if (!document.body) return;
      container = document.createElement('div');
      container.id = 'seha-admin-dashboard-container';
      document.body.appendChild(container);
    }
    container.style.display = 'block';

    const metrics = getMetrics();
    const filtered = getFilteredLeaves();

    container.innerHTML = `
      <style>
        #seha-admin-dashboard-container {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #f4f7fb;
          z-index: 99999;
          overflow-y: auto;
          direction: rtl;
          font-family: 'Cairo', sans-serif !important;
          color: #1e293b;
        }
        .seha-header-bar {
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 50;
        }
        .seha-logo-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .seha-logo-img {
          height: 38px;
        }
        .seha-user-badge {
          background: #f1f5f9;
          padding: 6px 14px;
          border-radius: 9999px;
          font-size: 13px;
          font-weight: 700;
          color: #334155;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .seha-btn-logout {
          background: #fee2e2;
          color: #ef4444;
          border: none;
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: background 0.2s;
        }
        .seha-btn-settings {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #1e293b;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          transition: all 0.2s;
        }
        .seha-btn-settings:hover {
          background: #f8fafc;
          border-color: #306DB5;
          color: #306DB5;
        }
        .seha-btn-logout:hover {
          background: #fecaca;
        }
        .seha-content-wrapper {
          max-width: 1140px;
          margin: 0 auto;
          padding: 24px 16px 80px;
        }
        .seha-top-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 16px;
        }
        .seha-page-title-box h1 {
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
          margin: 0 0 4px;
        }
        .seha-page-title-box p {
          font-size: 13px;
          color: #64748b;
          margin: 0;
        }
        .seha-btn-add {
          background: #306DB5;
          color: #ffffff;
          border: none;
          padding: 10px 20px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 12px rgba(48,109,181,0.25);
          transition: all 0.2s;
        }
        .seha-btn-add:hover {
          background: #255792;
          transform: translateY(-1px);
        }
        .seha-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        @media(max-width: 768px) {
          .seha-stats-grid { grid-template-columns: 1fr; }
        }
        .seha-stat-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 18px 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.02);
        }
        .seha-stat-icon-circle {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .seha-stat-info {
          flex: 1;
        }
        .seha-stat-title {
          font-size: 13px;
          font-weight: 600;
          color: #64748b;
          margin-bottom: 4px;
        }
        .seha-stat-number {
          font-size: 26px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1.1;
          margin-bottom: 4px;
        }
        .seha-stat-badge {
          font-size: 11px;
          font-weight: 700;
          display: inline-block;
          border-radius: 6px;
          padding: 2px 8px;
        }
        .seha-table-container {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.02);
          overflow: hidden;
        }
        .seha-table-header-box {
          padding: 20px 24px;
          border-bottom: 1px solid #f1f5f9;
        }
        .seha-table-header-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 17px;
          font-weight: 800;
          color: #1e293b;
          margin-bottom: 4px;
        }
        .seha-table-header-sub {
          font-size: 13px;
          color: #64748b;
        }
        .seha-search-bar {
          padding: 16px 24px;
          background: #fafbfd;
          border-bottom: 1px solid #f1f5f9;
          position: relative;
        }
        .seha-search-input {
          width: 100%;
          padding: 10px 42px 10px 14px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          font-size: 14px;
          background: #ffffff;
          outline: none;
          transition: border-color 0.2s;
        }
        .seha-search-input:focus {
          border-color: #306DB5;
          box-shadow: 0 0 0 3px rgba(48,109,181,0.12);
        }
        .seha-search-icon {
          position: absolute;
          right: 36px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          pointer-events: none;
        }
        .seha-table {
          width: 100%;
          border-collapse: collapse;
          text-align: right;
        }
        .seha-table th {
          background: #f8fafc;
          padding: 14px 20px;
          font-size: 13px;
          font-weight: 700;
          color: #475569;
          border-bottom: 1px solid #e2e8f0;
        }
        .seha-table td {
          padding: 16px 20px;
          font-size: 14px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
        }
        .seha-table tr:hover {
          background: #f8fafc;
        }
        .seha-pill-active {
          background: #e6f7ed;
          color: #16a34a;
          padding: 4px 12px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .seha-pill-expired {
          background: #f1f5f9;
          color: #64748b;
          padding: 4px 12px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .seha-action-btn {
          background: none;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 6px 10px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          font-size: 13px;
          font-weight: 600;
          color: #475569;
          transition: all 0.2s;
        }
        .seha-action-btn:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }
        .seha-action-btn-del {
          color: #ef4444;
          border-color: #fee2e2;
        }
        .seha-action-btn-del:hover {
          background: #fee2e2;
          border-color: #fca5a5;
        }
        .seha-action-btn-inquiry {
          color: #306DB5;
          border-color: #dbeafe;
        }
        .seha-action-btn-inquiry:hover {
          background: #eff6ff;
        }
      </style>

      <div class="seha-header-bar">
        <div class="seha-logo-group">
          <img src="/assets/seha_logo-m9JsokyV.svg" class="seha-logo-img" alt="صحة" onerror="this.src='/images/logo.png'" style="height:48px;width:auto;object-fit:contain;">
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <button id="btn-open-users-modal" class="seha-btn-settings" title="تغيير كلمة المرور وإضافة مستخدم">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            <span>إدارة الحسابات وكلمة المرور</span>
          </button>
          <span class="seha-user-badge">المسؤول: ${localStorage.getItem('seha_username') || '77899900'}</span>
          <button id="btn-seha-logout" class="seha-btn-logout">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>

      <div class="seha-content-wrapper">
        <div class="seha-top-row">
          <div class="seha-page-title-box">
            <h1>لوحة تحكم الإجازات المرضية</h1>
            <p>إدارة وتحديث سجلات الإجازات المعتمدة في منصة صحة وقاعدة البيانات</p>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <a href="/seha-project-full.zip" download="seha-project-full.zip" style="background:#059669;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px;font-weight:700;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(5,150,105,0.25);transition:all 0.2s;" onmouseover="this.style.background='#047857'" onmouseout="this.style.background='#059669'">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <span>تحميل المشروع ZIP</span>
            </a>
            <button id="btn-open-add-modal" class="seha-btn-add">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>+ إضافة إجازة جديدة</span>
            </button>
          </div>
        </div>

        <div class="seha-stats-grid">
          <!-- Total Leaves Card -->
          <div class="seha-stat-card">
            <div class="seha-stat-icon-circle" style="background:#e0f2fe;color:#0284c7;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            </div>
            <div class="seha-stat-info">
              <div class="seha-stat-title">إجمالي الإجازات</div>
              <div class="seha-stat-number">${metrics.total}</div>
              <span class="seha-stat-badge" style="background:#f1f5f9;color:#64748b;">تقرير مسجل</span>
            </div>
          </div>

          <!-- Active Leaves Card -->
          <div class="seha-stat-card">
            <div class="seha-stat-icon-circle" style="background:#dcfce7;color:#16a34a;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
            </div>
            <div class="seha-stat-info">
              <div class="seha-stat-title">الإجازات النشطة / السارية</div>
              <div class="seha-stat-number" style="color:#16a34a;">${metrics.active}</div>
              <span class="seha-stat-badge" style="background:#dcfce7;color:#15803d;">سارية حالياً</span>
            </div>
          </div>

          <!-- Expired Leaves Card -->
          <div class="seha-stat-card">
            <div class="seha-stat-icon-circle" style="background:#fee2e2;color:#ef4444;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
            </div>
            <div class="seha-stat-info">
              <div class="seha-stat-title">الإجازات المنتهية</div>
              <div class="seha-stat-number" style="color:#ef4444;">${metrics.expired}</div>
              <span class="seha-stat-badge" style="background:#fee2e2;color:#b91c1c;">تجاوزت التاريخ</span>
            </div>
          </div>
        </div>

        <!-- Database Records Container -->
        <div class="seha-table-container">
          <div class="seha-table-header-box">
            <div class="seha-table-header-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#306DB5" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
              <span>سجلات الإجازات بقاعدة البيانات</span>
            </div>
            <div class="seha-table-header-sub">البحث والتعديل المباشر في قاعدة البيانات الموحدة</div>
          </div>

          <!-- Search Bar -->
          <div class="seha-search-bar">
            <svg class="seha-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" id="seha-search-input" class="seha-search-input" placeholder="ابحث برقم الهوية، رمز الإجازة، أو اسم المريض..." value="${searchQuery}">
          </div>

          <!-- Table View -->
          <div style="overflow-x:auto;">
            <table class="seha-table">
              <thead>
                <tr>
                  <th>المنشأة الطبية والمستفيد</th>
                  <th>عدد الأيام</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="4" style="text-align:center;padding:48px 16px;color:#64748b;">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5" style="margin-bottom:12px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                      <div style="font-weight:700;font-size:15px;color:#334155;">لم يتم العثور على أي إجازات مطابقة</div>
                      <div style="font-size:13px;margin-top:4px;">اضغط على "+ إضافة إجازة جديدة" لإدخال تقرير طبي جديد</div>
                    </td>
                  </tr>
                ` : filtered.map(leave => {
                  const isActive = leave.Status && (leave.Status.includes('سارية') || leave.Status.includes('نشطة'));
                  const hospital = leave.Hospital || leave.OrganizationName || 'مستشفى الملك فهد العام';
                  const patient = leave.PatientName || 'غير محدد';
                  const id = leave.PatientId || '—';
                  const code = leave.NormalizedServiceCode || '—';
                  const fromDate = leave.From || '—';
                  const toDate = leave.To || '—';
                  const duration = leave.Duration || 1;

                  return `
                    <tr>
                      <td>
                        <div style="font-weight:800;color:#0f172a;font-size:14.5px;margin-bottom:4px;">${hospital}</div>
                        <div style="display:flex;gap:12px;font-size:12.5px;color:#64748b;flex-wrap:wrap;">
                          <span><strong style="color:#334155;">المريض:</strong> ${patient}</span>
                          <span><strong style="color:#334155;">الهوية:</strong> ${id}</span>
                          <span><strong style="color:#306DB5;">الرمز:</strong> <code style="font-family:monospace;font-weight:700;color:#306DB5;">${code}</code></span>
                          <span><strong style="color:#334155;">الفترة:</strong> ${fromDate} إلى ${toDate}</span>
                        </div>
                      </td>
                      <td>
                        <span style="font-weight:700;color:#0f172a;">${duration} يوم</span>
                      </td>
                      <td>
                        <span class="${isActive ? 'seha-pill-active' : 'seha-pill-expired'}">
                          ${isActive ? '● سارية (نشطة)' : 'منتهية'}
                        </span>
                      </td>
                      <td>
                        <div style="display:flex;gap:6px;align-items:center;">
                          <button class="seha-action-btn btn-edit-leave" data-id="${leave.id || leave.NormalizedServiceCode}" title="تعديل">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                            <span>تعديل</span>
                          </button>
                          <button class="seha-action-btn seha-action-btn-del btn-delete-leave" data-id="${leave.id || leave.NormalizedServiceCode}" title="حذف">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            <span>حذف</span>
                          </button>

                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    attachDashboardEvents();
  }

  // Attach event handlers
  function attachDashboardEvents() {
    // Logout
    const logoutBtn = document.getElementById('btn-seha-logout');
    if (logoutBtn) {
      logoutBtn.onclick = (e) => {
        if (e) e.preventDefault();
        setLoggedIn(false);
        const container = document.getElementById('seha-admin-dashboard-container');
        if (container) container.style.display = 'none';
        showToast('تم تسجيل الخروج بنجاح');
        window.location.hash = '#/inquiries/slenquiry';
        if (window.location.hash !== '#/inquiries/slenquiry') {
          window.location.href = '/#/inquiries/slenquiry';
        }
      };
    }

    // Open Users Modal
    const usersBtn = document.getElementById('btn-open-users-modal');
    if (usersBtn) {
      usersBtn.onclick = () => {
        openUsersModal();
      };
    }

    // Open Add Modal
    const addBtn = document.getElementById('btn-open-add-modal');
    if (addBtn) {
      addBtn.onclick = () => {
        openModal(null);
      };
    }

    // Search Input
    const searchInp = document.getElementById('seha-search-input');
    if (searchInp) {
      searchInp.oninput = (e) => {
        searchQuery = e.target.value;
        renderDashboard();
        const nextInp = document.getElementById('seha-search-input');
        if (nextInp) {
          nextInp.focus();
          nextInp.setSelectionRange(nextInp.value.length, nextInp.value.length);
        }
      };
    }

    // Edit Buttons
    document.querySelectorAll('.btn-edit-leave').forEach(btn => {
      btn.onclick = (e) => {
        if (e) e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const leave = leavesData.find(l => 
          String(l.id).toLowerCase() === String(id).toLowerCase() || 
          String(l.NormalizedServiceCode).toLowerCase() === String(id).toLowerCase()
        );
        if (leave) {
          openModal(leave);
        }
      };
    });

    // Delete Buttons
    document.querySelectorAll('.btn-delete-leave').forEach(btn => {
      btn.onclick = (e) => {
        if (e) e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const leave = leavesData.find(l => 
          String(l.id).toLowerCase() === String(id).toLowerCase() || 
          String(l.NormalizedServiceCode).toLowerCase() === String(id).toLowerCase()
        );
        if (leave) {
          openDeleteModal(leave);
        }
      };
    });
  }

  // Open Modal (Add / Edit) matching IMG-20260828-WA0000.jpg, IMG-20260828-WA0001.jpg, IMG-20260828-WA0002.jpg
  function openModal(leaveToEdit) {
    currentEditingLeave = leaveToEdit;
    isModalOpen = true;

    let modalEl = document.getElementById('seha-leave-modal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'seha-leave-modal';
      document.body.appendChild(modalEl);
    }
    modalEl.style.display = 'flex';

    const isEdit = !!leaveToEdit;
    const today = getTodayString();

    const initialCode = isEdit ? (leaveToEdit.NormalizedServiceCode || '') : '';
    const initialPatientName = isEdit ? (leaveToEdit.PatientName || '') : '';
    const initialPatientId = isEdit ? (leaveToEdit.PatientId || '') : '';
    const initialFrom = isEdit ? (leaveToEdit.From || today) : today;
    const initialTo = isEdit ? (leaveToEdit.To || today) : today;
    const initialSickLeaveDate = isEdit ? (leaveToEdit.SickLeaveDate || today) : today;
    const initialDuration = isEdit ? (leaveToEdit.Duration || 1) : calculateDays(initialFrom, initialTo);
    const initialHospital = isEdit ? (leaveToEdit.Hospital || leaveToEdit.OrganizationName || '') : '';
    const initialDoctor = isEdit ? (leaveToEdit.DoctorName || leaveToEdit['Doctor NAME'] || '') : '';
    const initialJob = isEdit ? (leaveToEdit.JobTitle || '') : '';
    const initialStatus = isEdit ? (leaveToEdit.Status || 'نشطة / سارية') : 'نشطة / سارية';
    const initialNotes = isEdit ? (leaveToEdit.Notes || '') : '';

    modalEl.innerHTML = `
      <style>
        #seha-leave-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          z-index: 100000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          direction: rtl;
          font-family: 'Cairo', sans-serif !important;
        }
        .seha-modal-card {
          background: #ffffff;
          border-radius: 16px;
          width: 100%;
          max-width: 760px;
          max-height: 92vh;
          overflow-y: auto;
          box-shadow: 0 20px 40px rgba(0,0,0,0.2);
          display: flex;
          flex-direction: column;
        }
        .seha-modal-header {
          padding: 20px 24px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: sticky;
          top: 0;
          background: #ffffff;
          z-index: 10;
        }
        .seha-modal-header h2 {
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
          margin: 0 0 4px;
        }
        .seha-modal-header p {
          font-size: 12.5px;
          color: #64748b;
          margin: 0;
        }
        .seha-modal-body {
          padding: 24px;
          flex: 1;
        }
        .seha-form-section {
          margin-bottom: 24px;
          background: #f8fafc;
          padding: 16px 18px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }
        .seha-form-section-title {
          font-size: 14px;
          font-weight: 800;
          color: #1e3a8a;
          margin-bottom: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .seha-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        @media(max-width: 600px) {
          .seha-form-grid { grid-template-columns: 1fr; }
        }
        .seha-field-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .seha-field-label {
          font-size: 12.5px;
          font-weight: 700;
          color: #334155;
        }
        .seha-input, .seha-select, .seha-textarea {
          padding: 10px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 14px;
          color: #0f172a;
          outline: none;
          background: #ffffff;
          font-family: inherit;
        }
        .seha-input:focus, .seha-select:focus, .seha-textarea:focus {
          border-color: #306DB5;
          box-shadow: 0 0 0 3px rgba(48,109,181,0.15);
        }
        .seha-modal-footer {
          padding: 16px 24px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          position: sticky;
          bottom: 0;
          background: #ffffff;
          z-index: 10;
        }
        .seha-btn-submit {
          background: #306DB5;
          color: white;
          border: none;
          padding: 11px 24px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: background 0.2s;
        }
        .seha-btn-submit:hover {
          background: #255792;
        }
        .seha-btn-cancel {
          background: #ffffff;
          color: #64748b;
          border: 1px solid #cbd5e1;
          padding: 11px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }
        .seha-btn-cancel:hover {
          background: #f1f5f9;
        }
      </style>

      <div class="seha-modal-card">
        <div class="seha-modal-header">
          <div>
            <h2>${isEdit ? 'تعديل التقرير الطبي' : 'إضافة تقرير طبي جديد'}</h2>
            <p>يرجى ملء الحقول لتحديث قاعدة بيانات الإجازات فوراً.</p>
          </div>
          <button id="btn-close-modal-top" class="seha-btn-cancel" style="padding:6px 12px;font-size:13px;">
            ← العودة للوحة الإدارة
          </button>
        </div>

        <div class="seha-modal-body">
          <form id="seha-leave-form">
            <!-- Section 1: Basic Info -->
            <div class="seha-form-section">
              <div class="seha-form-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                <span>القسم 1: بيانات المستفيد الأساسية</span>
              </div>
              <div class="seha-form-grid">
                <div class="seha-field-group" style="grid-column: 1 / -1;">
                  <label class="seha-field-label">الاسم الكامل للمستفيد (عربي) *</label>
                  <input type="text" id="inp-patient-name" class="seha-input" placeholder="أدخل اسم المستفيد / المريض" value="${initialPatientName}" required>
                </div>
                <div class="seha-field-group">
                  <label class="seha-field-label">رقم الهوية الوطنية أو الإقامة *</label>
                  <input type="text" id="inp-patient-id" class="seha-input" placeholder="أدخل رقم الهوية أو الإقامة (10 أرقام)" value="${initialPatientId}" required maxlength="10">
                </div>
                <div class="seha-field-group">
                  <label class="seha-field-label">رمز الخدمة / الإجازة (Leave ID) * <span style="color:#64748b;font-size:11px;">(يدوياً)</span></label>
                  <div style="display:flex;gap:6px;">
                    <input type="text" id="inp-leave-code" class="seha-input" style="font-family:monospace;font-weight:700;color:#306DB5;flex:1;" placeholder="أدخل رمز الخدمة يدوياً مثل: GSL123456" value="${initialCode}" required>
                    <button type="button" id="btn-regenerate-code" class="seha-action-btn" title="توليد كود تلقائي اختياري">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Section 2: Dates and Duration -->
            <div class="seha-form-section">
              <div class="seha-form-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                <span>القسم 2: تواريخ ومدة الإجازة</span>
              </div>
              <div class="seha-form-grid">
                <div class="seha-field-group">
                  <label class="seha-field-label">تاريخ البداية / الدخول *</label>
                  <input type="date" id="inp-from-date" class="seha-input" value="${initialFrom}" required>
                </div>
                <div class="seha-field-group">
                  <label class="seha-field-label">تاريخ النهاية / الخروج *</label>
                  <input type="date" id="inp-to-date" class="seha-input" value="${initialTo}" required>
                </div>
                <div class="seha-field-group">
                  <label class="seha-field-label">تاريخ إصدار التقرير *</label>
                  <input type="date" id="inp-issue-date" class="seha-input" value="${initialSickLeaveDate}" required>
                </div>
                <div class="seha-field-group">
                  <label class="seha-field-label">عدد أيام الإجازة * <span style="font-weight:normal;color:#0284c7;font-size:11.5px;">(يُحسب تلقائياً ويمكن تعديله)</span></label>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <input type="number" id="inp-duration" class="seha-input" value="${initialDuration}" min="1" max="365" style="width:100px;font-weight:700;color:#1e3a8a;" required>
                    <span style="font-size:13px;color:#64748b;">يوم</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Section 3: Facility and Doctor -->
            <div class="seha-form-section">
              <div class="seha-form-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"></path><path d="M5 21V7l8-4v18"></path><path d="M19 21V11l-6-3"></path></svg>
                <span>القسم 3: بيانات المنشأة الطبية والممارس</span>
              </div>
              <div class="seha-form-grid">
                <div class="seha-field-group" style="grid-column: 1 / -1;">
                  <label class="seha-field-label">المنشأة الطبية المصدرة *</label>
                  <input type="text" id="inp-hospital" class="seha-input" placeholder="أدخل اسم المنشأة الطبية / المستشفى" value="${initialHospital}" required>
                </div>
                <div class="seha-field-group">
                  <label class="seha-field-label">اسم الطبيب المعالج *</label>
                  <input type="text" id="inp-doctor-name" class="seha-input" placeholder="أدخل اسم الطبيب المعالج" value="${initialDoctor}" required>
                </div>
                <div class="seha-field-group">
                  <label class="seha-field-label">التخصص الطبي والعيادة *</label>
                  <input type="text" id="inp-job-title" class="seha-input" placeholder="أدخل التخصص الطبي أو المسمى الوظيفي" value="${initialJob}" required>
                </div>
              </div>
            </div>

            <!-- Section 4: Status & Notes -->
            <div class="seha-form-section">
              <div class="seha-form-section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line></svg>
                <span>القسم 4: حالة التقرير والملاحظات</span>
              </div>
              <div class="seha-form-grid">
                <div class="seha-field-group" style="grid-column: 1 / -1;">
                  <label class="seha-field-label">حالة التقرير *</label>
                  <select id="inp-status" class="seha-select" required>
                    <option value="نشطة / سارية" ${initialStatus.includes('سارية') || initialStatus.includes('نشطة') ? 'selected' : ''}>نشطة / سارية</option>
                    <option value="منتهية" ${initialStatus.includes('منتهية') ? 'selected' : ''}>منتهية</option>
                  </select>
                </div>
                <div class="seha-field-group" style="grid-column: 1 / -1;">
                  <label class="seha-field-label">ملاحظات تشخيصية اختيارية</label>
                  <textarea id="inp-notes" class="seha-textarea" rows="2" placeholder="ملاحظات تشخيصية اختيارية حول إجازة المريض...">${initialNotes}</textarea>
                </div>
              </div>
            </div>
          </form>
        </div>

        <div class="seha-modal-footer">
          <button type="button" id="btn-cancel-modal" class="seha-btn-cancel">إلغاء التراجع</button>
          <button type="submit" form="seha-leave-form" class="seha-btn-submit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span>${isEdit ? 'حفظ التعديلات في قاعدة البيانات' : 'حفظ وإضافة التقرير لقاعدة البيانات'}</span>
          </button>
        </div>
      </div>
    `;

    // Modal Events
    document.getElementById('btn-close-modal-top').onclick = closeModal;
    document.getElementById('btn-cancel-modal').onclick = closeModal;

    // Regenerate code button
    document.getElementById('btn-regenerate-code').onclick = () => {
      document.getElementById('inp-leave-code').value = generateLeaveCode();
    };

    // Auto calculate duration on date change
    const fromInp = document.getElementById('inp-from-date');
    const toInp = document.getElementById('inp-to-date');
    const durInp = document.getElementById('inp-duration');

    const updateDur = () => {
      if (fromInp && toInp && durInp && fromInp.value && toInp.value) {
        if (toInp.value < fromInp.value) {
          toInp.value = fromInp.value;
        }
        toInp.min = fromInp.value;
        const days = calculateDays(fromInp.value, toInp.value);
        durInp.value = days;
      }
    };

    const updateToDateFromDur = () => {
      if (fromInp && toInp && durInp && fromInp.value) {
        const days = parseInt(durInp.value, 10);
        if (!isNaN(days) && days >= 1) {
          const parts = fromInp.value.split('-').map(Number);
          const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
          d.setUTCDate(d.getUTCDate() + (days - 1));
          const y = d.getUTCFullYear();
          const m = String(d.getUTCMonth() + 1).padStart(2, '0');
          const day = String(d.getUTCDate()).padStart(2, '0');
          toInp.value = `${y}-${m}-${day}`;
        }
      }
    };

    ['input', 'change', 'blur', 'keyup'].forEach(evt => {
      fromInp.addEventListener(evt, updateDur);
      toInp.addEventListener(evt, updateDur);
      durInp.addEventListener(evt, updateToDateFromDur);
    });

    // Run immediately when opening modal
    updateDur();

    // Form submit
    const form = document.getElementById('seha-leave-form');
    form.onsubmit = (e) => {
      e.preventDefault();

      const patientName = document.getElementById('inp-patient-name').value.trim();
      const patientId = document.getElementById('inp-patient-id').value.trim();
      const leaveCode = document.getElementById('inp-leave-code').value.trim();
      const fromDate = document.getElementById('inp-from-date').value;
      const toDate = document.getElementById('inp-to-date').value;
      const issueDate = document.getElementById('inp-issue-date').value;
      const duration = parseInt(document.getElementById('inp-duration').value, 10) || 1;
      const hospital = document.getElementById('inp-hospital').value.trim();
      const doctor = document.getElementById('inp-doctor-name').value.trim();
      const job = document.getElementById('inp-job-title').value.trim();
      const status = document.getElementById('inp-status').value;
      const notes = document.getElementById('inp-notes').value.trim();

      if (!patientName || !patientId || !leaveCode) {
        alert('يرجى تعبئة كافة الحقول المطلوبة');
        return;
      }

      const leavePayload = {
        id: isEdit ? (currentEditingLeave.id || currentEditingLeave.NormalizedServiceCode) : String(Date.now()),
        PatientId: patientId,
        NormalizedServiceCode: leaveCode,
        PatientName: patientName,
        SickLeaveDate: issueDate,
        From: fromDate,
        To: toDate,
        Duration: duration,
        Hospital: hospital,
        OrganizationName: hospital,
        DoctorName: doctor,
        "Doctor NAME": doctor,
        JobTitle: job,
        Status: status,
        Notes: notes
      };

      saveLeave(leavePayload, isEdit);
    };
  }

  function closeModal() {
    isModalOpen = false;
    currentEditingLeave = null;
    const modalEl = document.getElementById('seha-leave-modal');
    if (modalEl) modalEl.style.display = 'none';
  }

  // Delete Confirmation Modal
  function openDeleteModal(leave) {
    leaveToDelete = leave;
    isDeleteModalOpen = true;

    let delEl = document.getElementById('seha-delete-modal');
    if (!delEl) {
      delEl = document.createElement('div');
      delEl.id = 'seha-delete-modal';
      document.body.appendChild(delEl);
    }
    delEl.style.display = 'flex';

    delEl.innerHTML = `
      <style>
        #seha-delete-modal {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          z-index: 100001;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          direction: rtl;
          font-family: 'Cairo', sans-serif !important;
        }
        .seha-del-card {
          background: white;
          border-radius: 14px;
          max-width: 440px;
          width: 100%;
          padding: 24px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.2);
          text-align: center;
        }
      </style>
      <div class="seha-del-card">
        <div style="width:50px;height:50px;background:#fee2e2;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#ef4444;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
        </div>
        <h3 style="font-size:18px;font-weight:800;color:#0f172a;margin:0 0 8px;">تأكيد حذف الإجازة</h3>
        <p style="font-size:13.5px;color:#64748b;margin:0 0 20px;">هل أنت متأكد من حذف إجازة المريض <strong>${leave.PatientName || leave.PatientId}</strong> برمز الخدمة <code>${leave.NormalizedServiceCode}</code> من قاعدة البيانات نهائياً؟</p>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button id="btn-cancel-del" class="seha-btn-cancel" style="flex:1;">إلغاء</button>
          <button id="btn-confirm-del" class="seha-btn-submit" style="background:#ef4444;flex:1;justify-content:center;">نعم، حذف الإجازة</button>
        </div>
      </div>
    `;

    document.getElementById('btn-cancel-del').onclick = closeDeleteModal;
    document.getElementById('btn-confirm-del').onclick = () => {
      if (leaveToDelete) {
        deleteLeave(leaveToDelete.id || leaveToDelete.NormalizedServiceCode);
      }
    };
  }


  // User Management Modal
  let isUsersModalOpen = false;

  async function openUsersModal() {
    isUsersModalOpen = true;
    let modalEl = document.getElementById("seha-users-modal");
    if (!modalEl) {
      modalEl = document.createElement("div");
      modalEl.id = "seha-users-modal";
      document.body.appendChild(modalEl);
    }
    modalEl.style.display = "flex";

    // Load users from server
    let usersList = [];
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const d = await res.json();
        usersList = d.data || [];
      }
    } catch (e) {
      console.error(e);
    }

    const currentUsername = localStorage.getItem("seha_username") || "77899900";

    modalEl.innerHTML = `
      <style>
        #seha-users-modal {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          z-index: 100002;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          direction: rtl;
          font-family: "Cairo", sans-serif !important;
        }
        .seha-users-card {
          background: #ffffff;
          border-radius: 16px;
          max-width: 620px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          display: flex;
          flex-direction: column;
        }
        .seha-users-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 24px;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
          border-radius: 16px 16px 0 0;
        }
        .seha-users-title {
          font-size: 17px;
          font-weight: 800;
          color: #0f172a;
          display: flex;
          align-items: center;
          gap: 9px;
        }
        .seha-users-body {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .seha-section-box {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 18px;
          background: #fafbfd;
        }
        .seha-section-title {
          font-size: 14.5px;
          font-weight: 800;
          color: #1e3a8a;
          margin-bottom: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .seha-user-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          margin-bottom: 8px;
          font-size: 13.5px;
        }
      </style>

      <div class="seha-users-card">
        <div class="seha-users-header">
          <div class="seha-users-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#306DB5" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            <span>إدارة الحسابات وكلمة المرور</span>
          </div>
          <button id="btn-close-users-modal" class="seha-btn-cancel" style="padding:6px 12px;font-size:12px;">إغلاق ✕</button>
        </div>

        <div class="seha-users-body">
          <!-- Section 1: Change Current User Credentials -->
          <div class="seha-section-box">
            <div class="seha-section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              <span>تغيير رقم الهوية / كلمة المرور للحساب الحالي (${currentUsername})</span>
            </div>
            <form id="form-update-current-user">
              <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:12px;">
                <div class="seha-field-group">
                  <label class="seha-field-label">رقم الهوية الجديد (أو إبقاء الحالي)</label>
                  <input type="text" id="inp-cur-new-username" class="seha-input" value="${currentUsername}" required>
                </div>
                <div class="seha-field-group">
                  <label class="seha-field-label">كلمة المرور الجديدة</label>
                  <input type="text" id="inp-cur-new-password" class="seha-input" placeholder="أدخل كلمة المرور الجديدة" required>
                </div>
              </div>
              <button type="submit" class="seha-btn-submit" style="font-size:13px;padding:9px 18px;">
                <span>حفظ بيانات الحساب</span>
              </button>
            </form>
          </div>

          <!-- Section 2: Add New User -->
          <div class="seha-section-box">
            <div class="seha-section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
              <span>إضافة مستخدم جديد للنظام بكلمة مرور خاصة</span>
            </div>
            <form id="form-add-new-user">
              <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:12px;">
                <div class="seha-field-group">
                  <label class="seha-field-label">رقم الهوية / اسم المستخدم</label>
                  <input type="text" id="inp-new-user-id" class="seha-input" placeholder="مثال: 1020304050" required>
                </div>
                <div class="seha-field-group">
                  <label class="seha-field-label">اسم المسؤول / الموظف</label>
                  <input type="text" id="inp-new-user-name" class="seha-input" placeholder="مثال: د. أحمد المطيري" required>
                </div>
                <div class="seha-field-group">
                  <label class="seha-field-label">كلمة المرور</label>
                  <input type="text" id="inp-new-user-password" class="seha-input" placeholder="كلمة المرور للدخول" required>
                </div>
              </div>
              <button type="submit" class="seha-btn-submit" style="background:#0284c7;font-size:13px;padding:9px 18px;">
                <span>+ إضافة المستخدم المصرح له</span>
              </button>
            </form>
          </div>

          <!-- Section 3: Existing Users List -->
          <div class="seha-section-box">
            <div class="seha-section-title" style="color:#334155;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
              <span>المستخدمون المصرح لهم بتسجيل الدخول (${usersList.length})</span>
            </div>
            <div>
              ${usersList.map(u => `
                <div class="seha-user-row">
                  <div>
                    <strong style="color:#0f172a;">${u.name || "مسؤول"}</strong>
                    <span style="color:#64748b;margin:0 8px;">|</span>
                    <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;color:#1e40af;">رقم الهوية: ${u.username}</code>
                    <span style="color:#64748b;margin:0 8px;">|</span>
                    <span style="color:#475569;font-size:12px;">كلمة المرور: ••••••••</span>
                  </div>
                  <div>
                    ${usersList.length > 1 ? `
                      <button class="seha-action-btn seha-action-btn-del btn-delete-user" data-username="${u.username}" style="padding:4px 10px;font-size:12px;">
                        حذف
                      </button>
                    ` : `<span style="font-size:11px;color:#94a3b8;">المسؤول الرئيسي</span>`}
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    `;

    // Close button
    document.getElementById("btn-close-users-modal").onclick = closeUsersModal;

    // Update current user
    document.getElementById("form-update-current-user").onsubmit = async (e) => {
      e.preventDefault();
      const newU = document.getElementById("inp-cur-new-username").value.trim();
      const newP = document.getElementById("inp-cur-new-password").value.trim();
      if (!newU || !newP) return;

      try {
        const res = await fetch(`/api/users/${encodeURIComponent(currentUsername)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newUsername: newU, newPassword: newP })
        });
        const data = await res.json();
        if (res.ok) {
          localStorage.setItem("seha_username", newU);
          showToast("تم تحديث بيانات الحساب بنجاح");
          openUsersModal();
          renderDashboard();
        } else {
          alert(data.message || "فشل التحديث");
        }
      } catch (err) {
        alert("خطأ في الاتصال");
      }
    };

    // Add new user
    document.getElementById("form-add-new-user").onsubmit = async (e) => {
      e.preventDefault();
      const uId = document.getElementById("inp-new-user-id").value.trim();
      const uName = document.getElementById("inp-new-user-name").value.trim();
      const uPass = document.getElementById("inp-new-user-password").value.trim();
      if (!uId || !uPass) return;

      try {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: uId, name: uName, password: uPass })
        });
        const data = await res.json();
        if (res.ok) {
          showToast("تمت إضافة المستخدم الجديد بنجاح");
          openUsersModal();
        } else {
          alert(data.message || "فشل إضافة المستخدم");
        }
      } catch (err) {
        alert("خطأ في الاتصال");
      }
    };

    // Delete user buttons
    document.querySelectorAll(".btn-delete-user").forEach(btn => {
      btn.onclick = async () => {
        const un = btn.getAttribute("data-username");
        if (!confirm(`هل أنت متأكد من حذف المستخدم ${un}؟`)) return;
        try {
          const res = await fetch(`/api/users/${encodeURIComponent(un)}`, { method: "DELETE" });
          if (res.ok) {
            showToast("تم حذف المستخدم");
            openUsersModal();
          } else {
            const data = await res.json();
            alert(data.message || "فشل حذف المستخدم");
          }
        } catch (e) {
          alert("خطأ في الاتصال");
        }
      };
    });
  }

  function closeUsersModal() {
    isUsersModalOpen = false;
    const modalEl = document.getElementById("seha-users-modal");
    if (modalEl) modalEl.style.display = "none";
  }

  function closeDeleteModal() {
    isDeleteModalOpen = false;
    leaveToDelete = null;
    const delEl = document.getElementById('seha-delete-modal');
    if (delEl) delEl.style.display = 'none';
  }

  // Intercept Hash changes to detect #/Dashboard or #/account/login
  function handleLocationChange() {
    const hash = window.location.hash || '';
    if (hash === '#/slenquiry' || hash === '#/inquiry') {
      window.location.hash = '#/inquiries/slenquiry';
      return;
    }
    if (hash.startsWith('#/Dashboard')) {
      if (!isLoggedIn()) {
        window.location.hash = '#/inquiries/slenquiry';
      } else {
        renderDashboard();
      }
    } else {
      const container = document.getElementById('seha-admin-dashboard-container');
      if (container) {
        container.style.display = 'none';
      }
    }
  }

  window.addEventListener('hashchange', handleLocationChange);
  window.addEventListener('popstate', handleLocationChange);

  // Hook into document to support fast-login clicks
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      fetchLeaves();
      handleLocationChange();
    });
  } else {
    fetchLeaves();
    handleLocationChange();
  }

  // Expose global controller for seamless integration
  window.SehaAdmin = {
    fetchLeaves,
    openModal,
    setLoggedIn,
    isLoggedIn,
    renderDashboard
  };

})();
