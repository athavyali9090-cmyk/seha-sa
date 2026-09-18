const CLOUD_DB_URL = 'https://kvdb.io/TcTZV6yBkGnPQyKKNLL4yQ/seha_manual_leaves_v5';

export default async function handler(request, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers });
  }

  const url = new URL(request.url);
  const patientId = String(url.searchParams.get('PatientId') || url.searchParams.get('id') || url.searchParams.get('IDNumber') || '').trim();
  const serviceCode = String(url.searchParams.get('NormalizedServiceCode') || url.searchParams.get('code') || url.searchParams.get('LeaveId') || '').trim().toLowerCase();

  let leaves = [];
  try {
    const resp = await fetch(CLOUD_DB_URL, { cache: 'no-cache' });
    if (resp.ok) {
      leaves = await resp.json();
    }
  } catch (e) {}

  const matches = (Array.isArray(leaves) ? leaves : []).filter(l => {
    const lId = String(l.PatientId || l.id || '').trim();
    const lCode = String(l.NormalizedServiceCode || l.LeaveId || '').trim().toLowerCase();
    const idMatch = !patientId || lId === patientId;
    const codeMatch = !serviceCode || lCode === serviceCode;
    return idMatch && codeMatch;
  });

  return new Response(JSON.stringify(matches), { status: 200, headers });
}
