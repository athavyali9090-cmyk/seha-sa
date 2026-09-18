const CLOUD_DB_URL = 'https://kvdb.io/TcTZV6yBkGnPQyKKNLL4yQ/seha_manual_leaves_v5';

const getLeaves = async () => {
  try {
    const resp = await fetch(CLOUD_DB_URL, { cache: 'no-cache' });
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data)) return data;
    }
  } catch (e) {}
  return [];
};

const saveLeaves = async (leaves) => {
  try {
    await fetch(CLOUD_DB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leaves)
    });
    return true;
  } catch (e) {
    return false;
  }
};

export default async function handler(request, context) {
  const method = request.method;
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8'
  };

  if (method === 'OPTIONS') {
    return new Response('', { status: 200, headers });
  }

  const leaves = await getLeaves();

  // GET
  if (method === 'GET') {
    return new Response(JSON.stringify({ success: true, count: leaves.length, data: leaves }), { status: 200, headers });
  }

  // POST
  if (method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch(e) {}

    const url = new URL(request.url);
    if (url.pathname.includes('/sync') || url.searchParams.get('sync')) {
      const incoming = body.leaves || [];
      if (Array.isArray(incoming) && incoming.length > 0) {
        await saveLeaves(incoming);
      }
      return new Response(JSON.stringify({ success: true, message: 'تمت المزامنة بنجاح' }), { status: 200, headers });
    }

    const codeKey = String(body.NormalizedServiceCode || '').trim().toLowerCase();
    const existingIndex = leaves.findIndex(l => String(l.NormalizedServiceCode || '').trim().toLowerCase() === codeKey);

    if (existingIndex >= 0) {
      leaves[existingIndex] = { ...leaves[existingIndex], ...body, UpdatedAt: new Date().toISOString() };
    } else {
      leaves.unshift({ ...body, CreatedAt: new Date().toISOString() });
    }

    await saveLeaves(leaves);
    return new Response(JSON.stringify({ success: true, message: 'تم حفظ الإجازة بنجاح', data: body }), { status: 200, headers });
  }

  // DELETE
  if (method === 'DELETE') {
    const url = new URL(request.url);
    const targetId = decodeURIComponent(url.pathname.split('/').pop()).trim().toLowerCase();
    const filtered = leaves.filter(l => 
      String(l.id || '').trim().toLowerCase() !== targetId &&
      String(l.NormalizedServiceCode || '').trim().toLowerCase() !== targetId
    );
    await saveLeaves(filtered);
    return new Response(JSON.stringify({ success: true, message: 'تم حذف الإجازة بنجاح' }), { status: 200, headers });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
}
