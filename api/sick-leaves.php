<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, apikey, x-token');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dbPath = dirname(__DIR__) . '/data/sick_leaves.json';
$backupPath = dirname(__DIR__) . '/data/sick_leaves_backup.json';

function getLeaves($dbPath, $backupPath) {
    if (file_exists($dbPath)) {
        $data = file_get_contents($dbPath);
        $decoded = json_decode($data, true);
        if (is_array($decoded)) {
            return $decoded;
        }
    }
    return [];
}

function saveLeaves($leaves, $dbPath, $backupPath) {
    $dir = dirname($dbPath);
    if (!is_dir($dir)) {
        @mkdir($dir, 0777, true);
    }
    $json = json_encode($leaves, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    @file_put_contents($dbPath, $json);
    @file_put_contents($backupPath, $json);
    return true;
}

$method = $_SERVER['REQUEST_METHOD'];
$leaves = getLeaves($dbPath, $backupPath);

if ($method === 'GET') {
    echo json_encode([
        'success' => true,
        'count' => count($leaves),
        'data' => $leaves
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$rawBody = file_get_contents('php://input');
$body = json_decode($rawBody, true) ?: $_POST;

if ($method === 'POST') {
    // Check if it is a sync request
    if (isset($_GET['sync']) || strpos($_SERVER['REQUEST_URI'], 'sync') !== false) {
        $incoming = $body['leaves'] ?? [];
        if (is_array($incoming) && count($incoming) > 0) {
            saveLeaves($incoming, $dbPath, $backupPath);
        }
        echo json_encode(['success' => true, 'message' => 'تمت المزامنة بنجاح'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $newLeave = $body;
    $codeKey = strtolower(trim($newLeave['NormalizedServiceCode'] ?? ''));
    $found = false;

    foreach ($leaves as $idx => $item) {
        $existingCode = strtolower(trim($item['NormalizedServiceCode'] ?? ''));
        if ($existingCode === $codeKey && $codeKey !== '') {
            $leaves[$idx] = array_merge($item, $newLeave, ['UpdatedAt' => date('c')]);
            $found = true;
            break;
        }
    }

    if (!$found) {
        $newLeave['CreatedAt'] = date('c');
        array_unshift($leaves, $newLeave);
    }

    saveLeaves($leaves, $dbPath, $backupPath);
    echo json_encode(['success' => true, 'message' => 'تم حفظ الإجازة في قاعدة البيانات بنجاح', 'data' => $newLeave], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'PUT') {
    $targetId = strtolower(trim($_GET['id'] ?? $body['id'] ?? $body['NormalizedServiceCode'] ?? ''));
    $found = false;

    foreach ($leaves as $idx => $item) {
        $id1 = strtolower(trim($item['id'] ?? ''));
        $id2 = strtolower(trim($item['NormalizedServiceCode'] ?? ''));
        if ($id1 === $targetId || $id2 === $targetId) {
            $leaves[$idx] = array_merge($item, $body, ['UpdatedAt' => date('c')]);
            $found = true;
            break;
        }
    }

    if (!$found) {
        array_unshift($leaves, $body);
    }

    saveLeaves($leaves, $dbPath, $backupPath);
    echo json_encode(['success' => true, 'message' => 'تم تحديث الإجازة بنجاح', 'data' => $body], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'DELETE') {
    $targetId = strtolower(trim($_GET['id'] ?? $body['id'] ?? ''));
    $filtered = [];

    foreach ($leaves as $item) {
        $id1 = strtolower(trim($item['id'] ?? ''));
        $id2 = strtolower(trim($item['NormalizedServiceCode'] ?? ''));
        if ($id1 !== $targetId && $id2 !== $targetId) {
            $filtered[] = $item;
        }
    }

    saveLeaves($filtered, $dbPath, $backupPath);
    echo json_encode(['success' => true, 'message' => 'تم حذف الإجازة بنجاح'], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
exit;
