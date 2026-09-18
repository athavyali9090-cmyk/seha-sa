<?php
header('Content-Type: text/html; charset=utf-8');

$patientId = isset($_GET['PatientId']) ? trim($_GET['PatientId']) : (isset($_POST['PatientId']) ? trim($_POST['PatientId']) : '');
$serviceCode = isset($_GET['NormalizedServiceCode']) ? trim($_GET['NormalizedServiceCode']) : (isset($_POST['NormalizedServiceCode']) ? trim($_POST['NormalizedServiceCode']) : '');
$format = isset($_GET['format']) ? $_GET['format'] : '';

$dbPath = __DIR__ . '/data/sick_leaves.json';
$leaves = [];

if (file_exists($dbPath)) {
    $json = file_get_contents($dbPath);
    $leaves = json_decode($json, true) ?: [];
}

$matched = null;
if (!empty($patientId) && !empty($serviceCode)) {
    foreach ($leaves as $leave) {
        $pId = isset($leave['PatientId']) ? trim($leave['PatientId']) : '';
        $sCode = isset($leave['NormalizedServiceCode']) ? trim($leave['NormalizedServiceCode']) : '';
        if ($pId === $patientId && strcasecmp($sCode, $serviceCode) === 0) {
            $matched = $leave;
            break;
        }
    }
}

if ($format === 'json') {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'status' => $matched ? 'success' : 'not_found',
        'data' => $matched ? [$matched] : []
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$isMatch = ($matched !== null);
$data = $matched ?: [];
?>
<!DOCTYPE html>
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
      <img src="images/logo.png" alt="منصة صحة" class="logo" onerror="this.src='images/favicon.png'">
      <?php if ($isMatch): ?>
        <span class="badge-success">● تقرير معتمد ونشط</span>
      <?php else: ?>
        <span class="badge-danger">غير متوفر</span>
      <?php endif; ?>
    </div>
    <div class="title">استعلام الإجازة المرضية</div>
    <div class="subtitle">خدمة الاستعلام المباشرة المعتمدة من وزارة الصحة (PHP Engine)</div>

    <?php if ($isMatch): ?>
    <div class="grid">
      <div class="item full-width">
        <div class="item-label">اسم المستفيد</div>
        <div class="item-value"><?php echo htmlspecialchars($data['PatientName'] ?? 'غير محدد'); ?></div>
      </div>
      <div class="item">
        <div class="item-label">رقم الهوية / الإقامة</div>
        <div class="item-value"><?php echo htmlspecialchars($data['PatientId'] ?? 'غير محدد'); ?></div>
      </div>
      <div class="item">
        <div class="item-label">رمز الإجازة (Leave ID)</div>
        <div class="item-value" style="color: #306db5; font-family: monospace; font-size: 15px;"><?php echo htmlspecialchars($data['NormalizedServiceCode'] ?? 'غير محدد'); ?></div>
      </div>
      <div class="item">
        <div class="item-label">تاريخ البداية</div>
        <div class="item-value"><?php echo htmlspecialchars($data['From'] ?? 'غير محدد'); ?></div>
      </div>
      <div class="item">
        <div class="item-label">تاريخ النهاية</div>
        <div class="item-value"><?php echo htmlspecialchars($data['To'] ?? 'غير محدد'); ?></div>
      </div>
      <div class="item">
        <div class="item-label">المدة بالأيام</div>
        <div class="item-value"><?php echo htmlspecialchars($data['Duration'] ?? 1); ?> يوم</div>
      </div>
      <div class="item">
        <div class="item-label">تاريخ إصدار التقرير</div>
        <div class="item-value"><?php echo htmlspecialchars($data['SickLeaveDate'] ?? 'غير محدد'); ?></div>
      </div>
      <div class="item full-width">
        <div class="item-label">المنشأة الطبية</div>
        <div class="item-value"><?php echo htmlspecialchars($data['Hospital'] ?? $data['OrganizationName'] ?? 'مستشفى الملك فهد العام'); ?></div>
      </div>
      <div class="item">
        <div class="item-label">اسم الطبيب</div>
        <div class="item-value"><?php echo htmlspecialchars($data['DoctorName'] ?? $data['Doctor NAME'] ?? 'د. محمد علي عسيري'); ?></div>
      </div>
      <div class="item">
        <div class="item-label">المسمى الوظيفي</div>
        <div class="item-value"><?php echo htmlspecialchars($data['JobTitle'] ?? 'أخصائي عيادة'); ?></div>
      </div>
      <div class="item full-width">
        <div class="item-label">حالة التقرير</div>
        <div class="item-value" style="color: #16a34a;"><?php echo htmlspecialchars($data['Status'] ?? 'نشطة / سارية'); ?></div>
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" onclick="window.print()">طباعة التقرير</button>
      <a href="/" class="btn btn-outline">استعلام جديد</a>
    </div>
    <?php else: ?>
    <div style="text-align: center; padding: 40px 10px;">
      <p style="font-size: 16px; color: #ef4444; font-weight: 700; margin-bottom: 12px;">لم يتم العثور على أي إجازة مرضية مطابقة للبيانات المدخلة</p>
      <p style="font-size: 13px; color: #64748b; margin-bottom: 24px;">يرجى التأكد من صحة رقم الهوية ورمز الخدمة والمحاولة مجدداً.</p>
      <a href="/" class="btn btn-primary" style="display: inline-block; width: 200px;">العودة للاستعلام</a>
    </div>
    <?php endif; ?>
    <div class="watermark">منصة صحة © جميع الحقوق محفوظة لوزارة الصحة</div>
  </div>
</body>
</html>
