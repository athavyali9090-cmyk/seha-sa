<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, apikey, x-token');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$patientId = isset($_GET['PatientId']) ? trim($_GET['PatientId']) : (isset($_POST['PatientId']) ? trim($_POST['PatientId']) : '');
$serviceCode = isset($_GET['NormalizedServiceCode']) ? trim($_GET['NormalizedServiceCode']) : (isset($_POST['NormalizedServiceCode']) ? trim($_POST['NormalizedServiceCode']) : '');

if (empty($patientId) || empty($serviceCode)) {
    echo json_encode([], JSON_UNESCAPED_UNICODE);
    exit;
}

$dbPath = dirname(__DIR__) . '/data/sick_leaves.json';
$leaves = [];

if (file_exists($dbPath)) {
    $json = file_get_contents($dbPath);
    $leaves = json_decode($json, true) ?: [];
}

$matches = [];
foreach ($leaves as $leave) {
    $lId = isset($leave['PatientId']) ? trim($leave['PatientId']) : (isset($leave['id']) ? trim($leave['id']) : '');
    $lCode = isset($leave['NormalizedServiceCode']) ? trim($leave['NormalizedServiceCode']) : (isset($leave['LeaveId']) ? trim($leave['LeaveId']) : '');
    
    if ($lId === $patientId && strcasecmp($lCode, $serviceCode) === 0) {
        $matches[] = $leave;
    }
}

echo json_encode($matches, JSON_UNESCAPED_UNICODE);
exit;
