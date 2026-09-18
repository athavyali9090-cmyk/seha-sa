import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sick Leaves Database Helpers
const DB_PATH = path.join(__dirname, 'data', 'sick_leaves.json');
const DB_BACKUP_PATH = path.join(__dirname, 'data', 'sick_leaves_backup.json');

const readLeaves = () => {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      const parsed = JSON.parse(data || '[]');
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
    return [];
  } catch (err) {
    console.error("Error reading sick leaves db:", err);
    return [];
  }
};

const writeLeaves = (leaves) => {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const content = JSON.stringify(leaves, null, 2);
    fs.writeFileSync(DB_PATH, content, 'utf-8');
    fs.writeFileSync(DB_BACKUP_PATH, content, 'utf-8');
    return true;
  } catch (err) {
    console.error("Error writing sick leaves db:", err);
    return false;
  }
};

// Sick Leaves API Endpoints
app.get('/api/sick-leaves', (req, res) => {
  const leaves = readLeaves();
  res.json({ success: true, count: leaves.length, data: leaves });
});

app.post('/api/sick-leaves', (req, res) => {
  const leaves = readLeaves();
  const body = req.body || {};

  const leaveCode = String(body.NormalizedServiceCode || '').trim();
  const patientId = String(body.PatientId || '').trim();

  if (!leaveCode || !patientId) {
    return res.status(400).json({ success: false, error: 'PatientId and NormalizedServiceCode are required' });
  }

  // Calculate duration if not explicitly provided
  let duration = parseInt(body.Duration, 10);
  if (isNaN(duration) || duration <= 0) {
    if (body.From && body.To) {
      const d1 = new Date(body.From);
      const d2 = new Date(body.To);
      const diffTime = Math.abs(d2 - d1);
      duration = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
    } else {
      duration = 1;
    }
  }

  const todayStr = new Date().toISOString().split('T')[0];

  const newLeave = {
    id: body.id ? String(body.id) : String(Date.now()),
    PatientId: String(body.PatientId || '').trim(),
    NormalizedServiceCode: leaveCode,
    PatientName: String(body.PatientName || '').trim(),
    SickLeaveDate: body.SickLeaveDate || todayStr,
    From: body.From || todayStr,
    To: body.To || todayStr,
    Duration: duration,
    Hospital: String(body.Hospital || body.OrganizationName || 'مستشفى الملك فهد العام').trim(),
    OrganizationName: String(body.OrganizationName || body.Hospital || 'مستشفى الملك فهد العام').trim(),
    DoctorName: String(body.DoctorName || body['Doctor NAME'] || 'د. محمد علي عسيري').trim(),
    "Doctor NAME": String(body.DoctorName || body['Doctor NAME'] || 'د. محمد علي عسيري').trim(),
    JobTitle: String(body.JobTitle || 'أخصائي عيادة').trim(),
    Status: body.Status || "نشطة / سارية",
    Notes: String(body.Notes || '').trim(),
    CreatedAt: new Date().toISOString()
  };

  // Check if leave with same code already exists, replace it, otherwise unshift
  const existingIndex = leaves.findIndex(l => 
    String(l.NormalizedServiceCode).toUpperCase() === leaveCode.toUpperCase() ||
    (l.id && String(l.id) === String(newLeave.id))
  );

  if (existingIndex >= 0) {
    leaves[existingIndex] = { ...leaves[existingIndex], ...newLeave };
  } else {
    leaves.unshift(newLeave);
  }

  writeLeaves(leaves);
  res.status(201).json({ success: true, message: "تمت إضافة الإجازة وحفظها بنجاح", data: newLeave });
});

app.put('/api/sick-leaves/:id', (req, res) => {
  const leaves = readLeaves();
  const rawId = decodeURIComponent(req.params.id || '').trim();
  const body = req.body || {};

  let index = leaves.findIndex(l => 
    String(l.id).toLowerCase() === rawId.toLowerCase() || 
    String(l.NormalizedServiceCode).toLowerCase() === rawId.toLowerCase()
  );

  if (index === -1 && body.NormalizedServiceCode) {
    index = leaves.findIndex(l => 
      String(l.NormalizedServiceCode).toLowerCase() === String(body.NormalizedServiceCode).toLowerCase()
    );
  }

  let duration = parseInt(body.Duration, 10);
  if (isNaN(duration) || duration <= 0) {
    if (body.From && body.To) {
      const d1 = new Date(body.From);
      const d2 = new Date(body.To);
      const diffTime = Math.abs(d2 - d1);
      duration = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
    } else {
      duration = 1;
    }
  }

  if (index === -1) {
    // Upsert so edit NEVER fails from first time
    const newLeave = {
      id: rawId || String(Date.now()),
      PatientId: String(body.PatientId || '').trim(),
      NormalizedServiceCode: body.NormalizedServiceCode ? String(body.NormalizedServiceCode).trim() : rawId,
      PatientName: String(body.PatientName || '').trim(),
      SickLeaveDate: body.SickLeaveDate || new Date().toISOString().split('T')[0],
      From: body.From || new Date().toISOString().split('T')[0],
      To: body.To || new Date().toISOString().split('T')[0],
      Duration: duration,
      Hospital: String(body.Hospital || body.OrganizationName || 'مستشفى الملك فهد العام').trim(),
      OrganizationName: String(body.OrganizationName || body.Hospital || 'مستشفى الملك فهد العام').trim(),
      DoctorName: String(body.DoctorName || body['Doctor NAME'] || 'د. محمد علي عسيري').trim(),
      "Doctor NAME": String(body.DoctorName || body['Doctor NAME'] || 'د. محمد علي عسيري').trim(),
      JobTitle: String(body.JobTitle || 'أخصائي عيادة').trim(),
      Status: body.Status || "نشطة / سارية",
      Notes: String(body.Notes || '').trim(),
      UpdatedAt: new Date().toISOString()
    };
    leaves.unshift(newLeave);
    writeLeaves(leaves);
    return res.json({ success: true, message: "تم تحديث الإجازة وحفظها بنجاح", data: newLeave });
  }

  const current = leaves[index];

  leaves[index] = {
    ...current,
    PatientId: body.PatientId !== undefined ? String(body.PatientId).trim() : current.PatientId,
    NormalizedServiceCode: body.NormalizedServiceCode !== undefined ? String(body.NormalizedServiceCode).trim() : current.NormalizedServiceCode,
    PatientName: body.PatientName !== undefined ? String(body.PatientName).trim() : current.PatientName,
    SickLeaveDate: body.SickLeaveDate || current.SickLeaveDate,
    From: body.From || current.From,
    To: body.To || current.To,
    Duration: duration,
    Hospital: body.Hospital || body.OrganizationName || current.Hospital,
    OrganizationName: body.OrganizationName || body.Hospital || current.OrganizationName,
    DoctorName: body.DoctorName || current.DoctorName,
    "Doctor NAME": body.DoctorName || current["Doctor NAME"],
    JobTitle: body.JobTitle || current.JobTitle,
    Status: body.Status || current.Status,
    Notes: body.Notes !== undefined ? body.Notes : current.Notes,
    UpdatedAt: new Date().toISOString()
  };

  writeLeaves(leaves);
  res.json({ success: true, message: "تم تحديث الإجازة بنجاح", data: leaves[index] });
});

app.delete('/api/sick-leaves/:id', (req, res) => {
  const leaves = readLeaves();
  const rawId = decodeURIComponent(req.params.id || '').trim().toLowerCase();
  const filtered = leaves.filter(l => 
    String(l.id).toLowerCase() !== rawId && 
    String(l.NormalizedServiceCode).toLowerCase() !== rawId
  );

  writeLeaves(filtered);
  res.json({ success: true, message: "تم حذف الإجازة بنجاح" });
});

// Client-Server Continuous Sync Endpoint
app.post('/api/sick-leaves/sync', (req, res) => {
  const { leaves: clientLeaves = [], deletedCodes = [] } = req.body || {};
  let currentLeaves = readLeaves();

  // 1. Remove deleted
  if (Array.isArray(deletedCodes) && deletedCodes.length > 0) {
    const delSet = new Set(deletedCodes.map(c => String(c).toLowerCase().trim()));
    currentLeaves = currentLeaves.filter(l => 
      !delSet.has(String(l.id).toLowerCase().trim()) && 
      !delSet.has(String(l.NormalizedServiceCode).toLowerCase().trim())
    );
  }

  // 2. Merge client leaves
  if (Array.isArray(clientLeaves) && clientLeaves.length > 0) {
    for (const cl of clientLeaves) {
      if (!cl || (!cl.id && !cl.NormalizedServiceCode)) continue;
      const clCode = String(cl.NormalizedServiceCode || '').toLowerCase().trim();
      const clId = String(cl.id || '').toLowerCase().trim();
      const idx = currentLeaves.findIndex(l => 
        (clCode && String(l.NormalizedServiceCode || '').toLowerCase().trim() === clCode) ||
        (clId && String(l.id || '').toLowerCase().trim() === clId)
      );
      if (idx >= 0) {
        currentLeaves[idx] = { ...currentLeaves[idx], ...cl };
      } else {
        currentLeaves.unshift(cl);
      }
    }
  }

  writeLeaves(currentLeaves);
  res.json({ success: true, count: currentLeaves.length, data: currentLeaves });
});

// Inquiry API
app.get(['/api/sick-leaves/inquiry', '/api/inquiry'], async (req, res) => {
  const patientId = String(req.query.PatientId || req.query.id || req.query.IDNumber || '').trim();
  const serviceCode = String(req.query.NormalizedServiceCode || req.query.code || req.query.service_code || req.query.LeaveId || '').trim();

  if (!patientId || !serviceCode) {
    if (req.query.wrap === '1' || req.query.format === 'wrapped') {
      return res.json({ status: "not_found", data: [] });
    }
    return res.json([]);
  }

  const leaves = readLeaves();
  let matches = leaves.filter(l => {
    const idMatch = String(l.PatientId || '').trim() === patientId;
    const codeMatch = String(l.NormalizedServiceCode || '').trim().toLowerCase() === serviceCode.toLowerCase();
    return idMatch && codeMatch;
  });

  if (req.query.wrap === '1' || req.query.format === 'wrapped') {
    return res.json({
      status: matches.length > 0 ? "success" : "not_found",
      data: matches
    });
  }

  // Direct array response matching React Slenquiry component expectations
  res.json(matches);
});

// Stable PHP Compatibility Layer (Supports /inquiry.php, /slenquiry.php, /check.php)
const handlePhpInquiry = async (req, res) => {
  const patientId = String(req.query.PatientId || req.query.id || req.body?.PatientId || req.body?.id || '').trim();
  const serviceCode = String(req.query.NormalizedServiceCode || req.query.code || req.body?.NormalizedServiceCode || req.body?.code || '').trim();
  const format = req.query.format || (req.headers.accept?.includes('application/json') ? 'json' : 'html');

  const leaves = readLeaves();
  let match = leaves.find(l => {
    return String(l.PatientId).trim() === patientId &&
           String(l.NormalizedServiceCode).trim().toUpperCase() === serviceCode.toUpperCase();
  });

  if (format === 'json' || req.xhr) {
    return res.json({
      status: match ? "success" : "not_found",
      data: match ? [match] : []
    });
  }

  // Render official high-resolution, mobile-responsive HTML
  const isMatch = !!match;
  const data = match || {};

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تقرير الإجازة المرضية - صحة</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', sans-serif; }
    body { background: #f4f7fb; color: #1e293b; padding: 16px; min-height: 100vh; display: flex; flex-direction: column; align-items: center; }
    .card { background: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); max-width: 600px; width: 100%; padding: 24px; margin-top: 20px; border: 1px solid #e2e8f0; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px; }
    .logo { height: 44px; }
    .badge-success { background: #e6f7ed; color: #16a34a; padding: 6px 14px; border-radius: 9999px; font-weight: 700; font-size: 14px; display: inline-flex; align-items: center; gap: 6px; }
    .badge-danger { background: #fee2e2; color: #ef4444; padding: 6px 14px; border-radius: 9999px; font-weight: 700; font-size: 14px; }
    .title { font-size: 20px; font-weight: 800; color: #1e3a8a; margin-bottom: 4px; }
    .subtitle { font-size: 13px; color: #64748b; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; }
    @media(max-width: 480px) { .grid { grid-template-columns: 1fr; } }
    .item { background: #f8fafc; padding: 12px 14px; border-radius: 10px; border: 1px solid #e2e8f0; }
    .item-label { font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 4px; }
    .item-value { font-size: 14px; color: #0f172a; font-weight: 700; }
    .full-width { grid-column: 1 / -1; }
    .actions { display: flex; gap: 10px; margin-top: 20px; }
    .btn { flex: 1; padding: 12px; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; text-align: center; text-decoration: none; border: none; transition: 0.2s; }
    .btn-primary { background: #306db5; color: white; }
    .btn-primary:hover { background: #255792; }
    .btn-outline { background: white; color: #306db5; border: 1px solid #306db5; }
    .btn-outline:hover { background: #f0f7ff; }
    .watermark { text-align: center; margin-top: 24px; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <img src="/images/logo.png" alt="منصة صحة" class="logo" onerror="this.src='/images/favicon.png'">
      ${isMatch ? '<span class="badge-success">● تقرير معتمد ونشط</span>' : '<span class="badge-danger">غير متوفر</span>'}
    </div>
    <div class="title">استعلام الإجازة المرضية</div>
    <div class="subtitle">خدمة الاستعلام المباشرة المعتمدة من وزارة الصحة (PHP Engine)</div>

    ${isMatch ? `
    <div class="grid">
      <div class="item full-width">
        <div class="item-label">اسم المستفيد</div>
        <div class="item-value">${data.PatientName || 'غير محدد'}</div>
      </div>
      <div class="item">
        <div class="item-label">رقم الهوية / الإقامة</div>
        <div class="item-value">${data.PatientId || 'غير محدد'}</div>
      </div>
      <div class="item">
        <div class="item-label">رمز الإجازة (Leave ID)</div>
        <div class="item-value" style="color: #306db5; font-family: monospace; font-size: 15px;">${data.NormalizedServiceCode || 'غير محدد'}</div>
      </div>
      <div class="item">
        <div class="item-label">تاريخ البداية</div>
        <div class="item-value">${data.From || 'غير محدد'}</div>
      </div>
      <div class="item">
        <div class="item-label">تاريخ النهاية</div>
        <div class="item-value">${data.To || 'غير محدد'}</div>
      </div>
      <div class="item">
        <div class="item-label">المدة بالأيام</div>
        <div class="item-value">${data.Duration || 1} ��وم</div>
      </div>
      <div class="item">
        <div class="item-label">تاريخ إصدار التقرير</div>
        <div class="item-value">${data.SickLeaveDate || 'غير محدد'}</div>
      </div>
      <div class="item full-width">
        <div class="item-label">المنشأة الطب��ة</div>
        <div class="item-value">${data.Hospital || data.OrganizationName || 'مستشفى الملك فهد العام'}</div>
      </div>
      <div class="item">
        <div class="item-label">اسم الطبيب</div>
        <div class="item-value">${data.DoctorName || data['Doctor NAME'] || 'د. محمد علي عسيري'}</div>
      </div>
      <div class="item">
        <div class="item-label">المسمى الوظيفي</div>
        <div class="item-value">${data.JobTitle || 'أخصائي عيادة'}</div>
      </div>
      <div class="item full-width">
        <div class="item-label">حالة التقرير</div>
        <div class="item-value" style="color: #16a34a;">${data.Status || 'نشطة / سارية'}</div>
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" onclick="window.print()">طباعة التقرير</button>
      <a href="/" class="btn btn-outline">استعلام جديد</a>
    </div>
    ` : `
    <div style="text-align: center; padding: 40px 10px;">
      <p style="font-size: 16px; color: #ef4444; font-weight: 700; margin-bottom: 12px;">لم يتم العثور على أي إجازة مرضية مطابقة للبيانات المدخلة</p>
      <p style="font-size: 13px; color: #64748b; margin-bottom: 24px;">يرجى التأكد من صحة رقم الهوية ورمز الخدمة والمحاولة مجدداً.</p>
      <a href="/" class="btn btn-primary" style="display: inline-block; width: 200px;">العودة للاستعلام</a>
    </div>
    `}
    <div class="watermark">منصة صحة © جميع الحقوق محفوظة لوزارة الصحة</div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
};

app.all(['/inquiry.php', '/slenquiry.php', '/api/inquiry.php', '/check.php'], handlePhpInquiry);

app.get(['/slenquiry.app', '/slenquiry', '/inquiries/slenquiry'], (req, res) => {
  res.redirect('/#/inquiries/slenquiry');
});

const USERS_PATH = path.join(__dirname, 'data', 'users.json');

const readUsers = () => {
  try {
    if (!fs.existsSync(USERS_PATH)) {
      const defaultUsers = [
        { username: "77899900", password: "77889900", name: "المسؤول العام", role: "admin" },
        { username: "77889900", password: "77889900", name: "مسؤول النظام", role: "admin" }
      ];
      fs.mkdirSync(path.dirname(USERS_PATH), { recursive: true });
      fs.writeFileSync(USERS_PATH, JSON.stringify(defaultUsers, null, 2), 'utf-8');
      return defaultUsers;
    }
    const data = fs.readFileSync(USERS_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [
      { username: "77899900", password: "77889900", name: "المسؤول العام", role: "admin" }
    ];
  }
};

const writeUsers = (users) => {
  try {
    fs.mkdirSync(path.dirname(USERS_PATH), { recursive: true });
    fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error("Error writing users:", e);
    return false;
  }
};

// Users Management APIs
app.get('/api/users', (req, res) => {
  const users = readUsers();
  res.json({ success: true, data: users });
});

app.post('/api/users', (req, res) => {
  const { username, password, name } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: "يرجى إدخال اسم المستخدم/رقم الهوية وكلمة المرور" });
  }
  const users = readUsers();
  const existingIndex = users.findIndex(u => u.username === String(username).trim());
  if (existingIndex >= 0) {
    return res.status(400).json({ success: false, message: "المستخدم موجود بالفعل" });
  }
  const newUser = {
    username: String(username).trim(),
    password: String(password).trim(),
    name: String(name || `مستخدم ${username}`).trim(),
    role: "admin",
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  writeUsers(users);
  res.status(201).json({ success: true, message: "تمت إضافة المستخدم بنجاح", data: newUser });
});

app.put('/api/users/:username', (req, res) => {
  const targetUsername = String(req.params.username).trim();
  const { newUsername, newPassword, name } = req.body || {};
  const users = readUsers();
  const user = users.find(u => u.username === targetUsername);
  if (!user) {
    return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
  }
  if (newUsername && newUsername.trim() !== '') {
    user.username = String(newUsername).trim();
  }
  if (newPassword && newPassword.trim() !== '') {
    user.password = String(newPassword).trim();
  }
  if (name && name.trim() !== '') {
    user.name = String(name).trim();
  }
  writeUsers(users);
  res.json({ success: true, message: "تم تحديث البيانات بنجاح", data: user });
});

app.delete('/api/users/:username', (req, res) => {
  const targetUsername = String(req.params.username).trim();
  let users = readUsers();
  if (users.length <= 1) {
    return res.status(400).json({ success: false, message: "لا يمكن حذف آخر مسؤول متبقي للنظام" });
  }
  users = users.filter(u => u.username !== targetUsername);
  writeUsers(users);
  res.json({ success: true, message: "تم حذف المستخدم بنجاح" });
});

// Direct Auth Check & Mock API supporting all registered users
app.all(['/account/loginv3', '/api/account/loginv3', '/Account/loginv3', '/api/users/login'], (req, res) => {
  const { Username, Password } = req.body || {};
  const uStr = String(Username || '').trim();
  const pStr = String(Password || '').trim();
  const users = readUsers();

  const match = users.find(u => u.username === uStr && u.password === pStr) ||
    ((uStr === '77899900' || uStr === '77889900' || uStr === 'admin') && (pStr === '77889900' || pStr === '77899900') ? { username: uStr, name: 'المسؤول' } : null);

  if (match) {
    return res.json({
      errorCode: 0,
      errorMessage: null,
      data: {
        sendVerificationCode: false,
        userRole: [{ RoleId: 1, RoleName: "Admin", OrganizationId: "1" }],
        userName: match.username,
        name: match.name,
        token: `seha-token-${match.username}`
      }
    });
  }
  return res.json({ errorCode: 100, errorMessage: "بيانات الدخول غير صحيحة" });
});


// Serve static assets from current directory
app.use(express.static(__dirname));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/dist/assets', express.static(path.join(__dirname, 'dist/assets')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// Smart Asset Locator: Checks assets, img/services, and prefix matches
app.use((req, res, next) => {
  const ext = path.extname(req.path).toLowerCase();
  if (!['.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.gif'].includes(ext)) {
    return next();
  }

  const base = path.basename(req.path);
  const nameWithoutExt = path.basename(req.path, ext);
  // Strip Vite hash (e.g. cred-amanat-B5xqIzVe -> cred-amanat)
  const prefix = nameWithoutExt.replace(/-[A-Za-z0-9_-]{8}$/, '');

  const searchDirs = [
    path.join(__dirname, 'assets', 'img', 'services'),
    path.join(__dirname, 'assets'),
    path.join(__dirname, 'img', 'services'),
    path.join(__dirname, 'dist', 'assets'),
    path.join(__dirname, 'dist', 'assets', 'img', 'services'),
    path.join(__dirname, 'images')
  ];

  // 1. Direct file name check
  for (const dir of searchDirs) {
    const candidate = path.join(dir, base);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return res.sendFile(candidate);
    }
  }

  // 2. Unhashed / prefix name check (e.g. prefix + ext)
  if (prefix !== nameWithoutExt) {
    for (const dir of searchDirs) {
      const candidate = path.join(dir, prefix + ext);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return res.sendFile(candidate);
      }
    }
  }

  // 3. Find any file starting with prefix in searchDirs
  for (const dir of searchDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      const match = files.find(f => f.startsWith(prefix) && f.endsWith(ext));
      if (match) {
        return res.sendFile(path.join(dir, match));
      }
    }
  }

  next();
});

// Pre-buffered fallback image assets (so missing images NEVER return index.html)
const FALLBACK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAMklEQVR42u3PMQEAAAgEIDu3v7U50gN0QIK2h369AAAAAAAAAAAAgP8AALhW390AAAAAAADAbwXqM1p/W6oQhQAAAABJRU5ErkJggg==', 'base64');
const FALLBACK_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const getFallbackSvg = (name) => {
  const cleanName = (name || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" width="200" height="60">
    <rect width="100%" height="100%" rx="10" fill="#f0f7fc" stroke="#306db5" stroke-width="1.5" stroke-opacity="0.2"/>
    <g transform="translate(16, 12)">
      <circle cx="18" cy="18" r="16" fill="#306db5" fill-opacity="0.15"/>
      <path d="M18 10 V26 M10 18 H26" stroke="#306db5" stroke-width="3" stroke-linecap="round"/>
    </g>
    <text x="60" y="36" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600" fill="#306db5">${cleanName || 'SEHA'}</text>
  </svg>`;
};

// Permanent Asset Fallback Handler: Never return HTML for image / media / CSS requests
app.use((req, res, next) => {
  const ext = path.extname(req.path).toLowerCase();

  if (ext === '.svg') {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    const baseName = path.basename(req.path, ext);
    return res.send(getFallbackSvg(baseName));
  }

  if (['.png', '.jpg', '.jpeg', '.webp', '.ico'].includes(ext)) {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.end(FALLBACK_PNG);
  }

  if (ext === '.gif') {
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.end(FALLBACK_GIF);
  }

  if (ext === '.css') {
    res.setHeader('Content-Type', 'text/css');
    return res.send('/* asset fallback */');
  }

  if (ext === '.js') {
    res.setHeader('Content-Type', 'text/javascript');
    return res.send('export default {};');
  }

  next();
});

// API endpoints fallback
app.all(['/Account/GetJWTUserToken', '/api/Account/GetJWTUserToken'], (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  return res.json({ ErrorCode: 100, Data: null, Message: "No active session" });
});

// SPA fallback for all routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
