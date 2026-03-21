/* ═══════════════════════════════════════════════════════════════
   👑 The King AI — Service Worker v25.0
   Developed by: Murhaf Hassan
   © 2025 All Rights Reserved
   ✅ يعمل بدون إنترنت بعد أول تحميل
   ✅ منبهات عند إغلاق التطبيق أو إطفاء الشاشة
   ✅ إشعارات Push في الخلفية
   ✅ مزامنة في الخلفية (Background Sync)
═══════════════════════════════════════════════════════════════ */

const VER    = 'king-ai-v25.0';
const SCOPE  = self.registration.scope;

/* ════════════════════════════════════════════
   📦 قائمة الملفات للتخزين المسبق (Precache)
════════════════════════════════════════════ */
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

const CDN_CACHE = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/mathjs/12.4.0/math.min.js',
];

/* ════════════════════════════════════════════
   ⏰ إدارة المنبهات في الخلفية
════════════════════════════════════════════ */
let _bgAlarmInterval = null;

function _startBgAlarmChecker() {
  if (_bgAlarmInterval) return;
  _bgAlarmInterval = setInterval(_checkBgAlarms, 60000); // كل 60 ثانية
  _checkBgAlarms(); // فحص فوري
}

/* سجل آخر دقيقة تم فيها الإطلاق لتجنب التكرار */
const _firedKeys = new Set();

async function _checkBgAlarms() {
  try {
    const cache = await caches.open('king-ai-alarms');
    const resp  = await cache.match('reminders-data');
    if (!resp) return;

    const reminders = await resp.json();
    if (!Array.isArray(reminders) || !reminders.length) return;

    const now      = new Date();
    const h        = now.getHours();
    const m        = now.getMinutes();
    const today    = now.toDateString();
    const todayDay = now.getDay();
    const minuteKey = today + '-' + h + ':' + m;

    for (const r of reminders) {
      if (!r || !r.time) continue;
      if (r.triggered && (!r.repeat || r.repeat === 'none')) continue;

      try {
        const [rh, rm] = r.time.split(':').map(Number);
        const diff = (h * 60 + m) - (rh * 60 + rm);

        if (diff >= 0 && diff <= 2) {
          const rep    = r.repeat || 'none';
          const fireKey = (r.id || r.text) + '-' + minuteKey;

          /* تجنب الإطلاق المزدوج */
          if (_firedKeys.has(fireKey)) continue;

          if (rep !== 'none' && r._lastFired === today) continue;
          if (rep === 'weekdays' && (todayDay === 0 || todayDay === 6)) continue;
          if (rep === 'weekend'  && todayDay >= 1 && todayDay <= 5) continue;

          /* سجّل قبل الإرسال */
          _firedKeys.add(fireKey);
          /* نظّف القديم بعد 5 دقائق */
          setTimeout(() => _firedKeys.delete(fireKey), 5 * 60 * 1000);

          await self.registration.showNotification('⏰ ' + (r.text || 'تذكير'), {
            body:    r.text || 'حان وقت تذكيرك!',
            icon:    SCOPE + 'icon-512.png',
            badge:   SCOPE + 'icon-192.png',
            tag:     'reminder-' + (r.id || Date.now()),
            renotify: true,
            requireInteraction: true,
            silent:  false,
            vibrate: [400, 150, 400, 150, 800],
            dir:     'rtl',
            lang:    'ar',
            timestamp: Date.now(),
            actions: [
              { action: 'open',     title: '📱 فتح' },
              { action: 'snooze5',  title: '😴 5 دقائق' },
              { action: 'snooze10', title: '💤 10 دقائق' },
              { action: 'dismiss',  title: '✕ إغلاق' },
            ],
            data: { reminderId: r.id, text: r.text }
          });

          /* حدّث حالة التذكير في الكاش */
          if (rep === 'none') r.triggered = true;
          else r._lastFired = today;
        }
      } catch(e) {
        console.warn('[SW] alarm fire error:', e);
      }
    }

    /* احفظ التحديث */
    await cache.put('reminders-data',
      new Response(JSON.stringify(reminders), {
        headers: { 'Content-Type': 'application/json' }
      })
    );

    /* ═══ فحص قائمة Snooze ═══ */
    try {
      const snoozeResp = await cache.match('snooze-queue');
      if (snoozeResp) {
        let snoozes = await snoozeResp.json();
        const pending = [];

        for (const s of snoozes) {
          if (Date.now() >= s.fireAt) {
            /* حان وقت الإطلاق */
            await self.registration.showNotification('⏰ King AI — تذكير (مؤجل)', {
              body:    s.text || 'حان وقت تذكيرك!',
              icon:    SCOPE + 'icon-512.png',
              badge:   SCOPE + 'icon-192.png',
              tag:     s.id || ('snooze-fire-' + Date.now()),
              renotify: true,
              requireInteraction: true,
              vibrate: [400, 150, 400, 150, 800],
              dir:     'rtl',
              lang:    'ar',
              actions: [
                { action: 'open',     title: '📱 فتح'       },
                { action: 'snooze5',  title: '😴 5 دقائق'   },
                { action: 'snooze10', title: '💤 10 دقائق'  },
                { action: 'dismiss',  title: '✕ إغلاق'      },
              ],
              data: { text: s.text }
            });
          } else {
            pending.push(s); /* لم يحن وقته بعد */
          }
        }

        /* احفظ الـ pending فقط */
        await cache.put('snooze-queue',
          new Response(JSON.stringify(pending), {
            headers: { 'Content-Type': 'application/json' }
          })
        );
      }
    } catch(se) {
      console.warn('[SW] snooze-queue check error:', se);
    }
  } catch(e) {
    console.warn('[SW] _checkBgAlarms error:', e);
  }
}

/* ════════════════════════════════════════════
   📥 Install — تثبيت وتخزين الملفات
════════════════════════════════════════════ */
self.addEventListener('install', e => {
  console.info('[SW] Installing version:', VER);
  e.waitUntil(
    (async () => {
      const cache = await caches.open(VER);

      // تخزين الملفات المحلية
      for (const url of PRECACHE_URLS) {
        try {
          await cache.add(url);
        } catch(err) {
          console.warn('[SW] precache miss (local):', url);
        }
      }

      // تخزين CDN (اختياري — لا يوقف التثبيت عند فشله)
      for (const url of CDN_CACHE) {
        try {
          const resp = await fetch(url, { mode: 'cors' });
          if (resp.ok) await cache.put(url, resp);
        } catch(err) {
          console.warn('[SW] precache miss (cdn):', url);
        }
      }

      console.info('[SW] Precache complete');
      await self.skipWaiting();
    })()
  );
});

/* ════════════════════════════════════════════
   ✅ Activate — تنظيف الكاش القديم
════════════════════════════════════════════ */
self.addEventListener('activate', e => {
  console.info('[SW] Activating version:', VER);
  e.waitUntil(
    (async () => {
      // حذف النسخ القديمة
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => k !== VER && k !== 'king-ai-alarms')
          .map(k => {
            console.info('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      );

      // السيطرة الفورية على جميع الصفحات المفتوحة
      await self.clients.claim();

      // ابدأ فحص المنبهات في الخلفية
      _startBgAlarmChecker();

      console.info('[SW] Activated & claimed clients');
    })()
  );
});

/* ════════════════════════════════════════════
   🌐 Fetch — استراتيجية الكاش
════════════════════════════════════════════ */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = e.request.url;

  /* ─ API calls — دائماً من الشبكة، بدون كاش ─ */
  const isApi =
    url.includes('api.anthropic.com') ||
    url.includes('generativelanguage.googleapis.com') ||
    url.includes('serper.dev') ||
    url.includes('duckduckgo.com') ||
    url.includes('api.') ||
    url.includes('/v1/');

  if (isApi) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(
          JSON.stringify({ error: 'offline', message: 'لا يوجد اتصال بالإنترنت' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  /* ─ الصفحة الرئيسية — Network first ─ */
  const isApp =
    url.endsWith('/') ||
    url.endsWith('/index.html') ||
    url === SCOPE ||
    url === SCOPE + 'index.html';

  if (isApp) {
    e.respondWith(
      caches.open(VER).then(cache =>
        fetch(e.request)
          .then(resp => {
            if (resp && resp.status === 200) {
              cache.put(e.request, resp.clone());
            }
            return resp;
          })
          .catch(() => cache.match(e.request).then(c => c || cache.match('./index.html')))
      )
    );
    return;
  }

  /* ─ خطوط وأيقونات — Cache first ─ */
  const isStatic =
    url.includes('cdnjs.cloudflare.com') ||
    url.includes('cdn.jsdelivr.net')     ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com')   ||
    url.endsWith('.woff2') ||
    url.endsWith('.woff')  ||
    url.endsWith('.ttf')   ||
    url.endsWith('.png')   ||
    url.endsWith('.jpg')   ||
    url.endsWith('.svg')   ||
    url.endsWith('.ico')   ||
    url.endsWith('.js')    ||
    url.endsWith('.css');

  if (isStatic) {
    e.respondWith(
      caches.open(VER).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request)
            .then(resp => {
              if (resp && resp.status === 200) {
                cache.put(e.request, resp.clone());
              }
              return resp;
            })
            .catch(() => cached || new Response('', { status: 408 }));
        })
      )
    );
    return;
  }

  /* ─ باقي الطلبات — Stale While Revalidate ─ */
  e.respondWith(
    caches.open(VER).then(cache =>
      cache.match(e.request).then(cached => {
        const networkFetch = fetch(e.request)
          .then(resp => {
            if (resp && resp.status === 200 && resp.type !== 'opaque') {
              cache.put(e.request, resp.clone());
            }
            return resp;
          })
          .catch(() => cached || cache.match('./index.html'));

        return cached || networkFetch;
      })
    )
  );
});

/* ════════════════════════════════════════════
   🔔 Notification Click — ضغط على الإشعار
════════════════════════════════════════════ */
self.addEventListener('notificationclick', e => {
  e.notification.close();

  const action     = e.action;
  const data       = e.notification.data || {};
  const reminderId = data.reminderId;

  /* ─ تأجيل 5 أو 10 دقائق — يحفظ في الكاش ويُطلق عبر _checkBgAlarms ─ */
  if (action === 'snooze5' || action === 'snooze10') {
    const mins = action === 'snooze5' ? 5 : 10;
    e.waitUntil(
      (async () => {
        try {
          const fireAt = Date.now() + mins * 60 * 1000;
          const cache  = await caches.open('king-ai-alarms');

          let snoozes = [];
          try {
            const r = await cache.match('snooze-queue');
            if (r) snoozes = await r.json();
          } catch(_) {}

          snoozes.push({
            id:     'snooze-' + Date.now(),
            fireAt,
            text:   data.text || 'تذكير مؤجل',
            mins
          });

          await cache.put('snooze-queue',
            new Response(JSON.stringify(snoozes), {
              headers: { 'Content-Type': 'application/json' }
            })
          );
          console.info('[SW] Snooze saved → fires in', mins, 'min');
        } catch(err) {
          console.warn('[SW] snooze save error:', err);
        }
      })()
    );
    return;
  }

  /* ─ dismiss ─ */
  if (action === 'dismiss') return;

  /* ─ open أو ضغط على الإشعار مباشرة ─ */
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
      // إذا كان التطبيق مفتوح — أحضره للأمام
      for (const cl of cls) {
        if (cl.url.includes('index.html') || cl.url.endsWith('/')) {
          return cl.focus().then(w => {
            w.postMessage({ type: 'REMINDER_FIRED', reminderId, data });
            return w;
          });
        }
      }
      // افتح التطبيق إذا لم يكن مفتوحاً
      return clients.openWindow(SCOPE + 'index.html').then(w => {
        if (w) {
          setTimeout(() => w.postMessage({ type: 'REMINDER_FIRED', reminderId, data }), 1500);
        }
      });
    })
  );
});

/* ════════════════════════════════════════════
   📨 Push — إشعارات خارجية (Push API)
════════════════════════════════════════════ */
self.addEventListener('push', e => {
  let payload = { title: '👑 King AI', body: 'إشعار جديد' };
  try { payload = e.data?.json() || payload; } catch(_) {}

  e.waitUntil(
    self.registration.showNotification(payload.title || '👑 King AI', {
      body:    payload.body || '',
      icon:    SCOPE + 'icon-512.png',
      badge:   SCOPE + 'icon-192.png',
      tag:     'push-' + Date.now(),
      dir:     'rtl',
      lang:    'ar',
      vibrate: [200, 100, 200],
      data:    payload
    })
  );
});

/* ════════════════════════════════════════════
   🔄 Background Sync — مزامنة في الخلفية
════════════════════════════════════════════ */
self.addEventListener('sync', e => {
  console.info('[SW] Background sync:', e.tag);
  if (e.tag === 'check-reminders') {
    e.waitUntil(_checkBgAlarms());
  }
});

/* ════════════════════════════════════════════
   📩 Message — رسائل من الصفحة الرئيسية
════════════════════════════════════════════ */
self.addEventListener('message', e => {
  const msg = e.data;
  if (!msg) return;

  /* تحديث فوري */
  if (msg === 'SKIP_WAITING' || msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  /* استعلام عن الإصدار */
  if (msg === 'GET_VERSION' || msg.type === 'GET_VERSION') {
    e.ports[0]?.postMessage({ version: VER });
    return;
  }

  /* حفظ التذكيرات في كاش الإشعارات */
  if (msg.type === 'SAVE_REMINDERS' && msg.reminders) {
    e.waitUntil(
      caches.open('king-ai-alarms').then(cache =>
        cache.put('reminders-data',
          new Response(JSON.stringify(msg.reminders), {
            headers: { 'Content-Type': 'application/json' }
          })
        )
      ).then(() => {
        // ابدأ الفحص فوراً
        _startBgAlarmChecker();
        e.ports[0]?.postMessage({ ok: true });
      })
    );
    return;
  }

  /* تشغيل فحص يدوي للمنبهات */
  if (msg.type === 'CHECK_ALARMS') {
    e.waitUntil(_checkBgAlarms());
    return;
  }

  /* تنظيف الكاش */
  if (msg.type === 'CLEAR_CACHE') {
    e.waitUntil(
      caches.keys().then(keys =>
        Promise.all(keys.map(k => caches.delete(k)))
      ).then(() => e.ports[0]?.postMessage({ ok: true }))
    );
    return;
  }
});

/* ════════════════════════════════════════════
   ⏱ Periodic Background Sync (إذا مدعوم)
════════════════════════════════════════════ */
self.addEventListener('periodicsync', e => {
  if (e.tag === 'king-ai-alarms') {
    e.waitUntil(_checkBgAlarms());
  }
});

/* ─── ابدأ الفحص فور تحميل السيرفس ووركر ─── */
_startBgAlarmChecker();

console.info('[SW] 👑 King AI Service Worker v25.0 — Ready');
