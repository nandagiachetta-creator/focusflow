// ═══════════════════════════════════════════════════════════
//  FocusFlow · Service Worker
//  Responsável por disparar notificações mesmo com o app
//  fechado ou em segundo plano.
//
//  COMO FUNCIONA:
//  1. O app principal envia uma lista de alarmes via postMessage
//  2. Este SW agenda setTimeout para cada alarme
//  3. Quando o tempo chega, dispara showNotification
//  4. Ao clicar na notificação, abre/foca o app
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'focusflow-v1';

// Alarmes ativos { id: timeoutId }
const activeAlarms = {};

// ── Instalação & Ativação ──────────────────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

// ── Recebe mensagens do app principal ─────────────────────
self.addEventListener('message', e => {
  if(!e.data) return;

  if(e.data.type === 'schedule') {
    scheduleAlarms(e.data.alarms || []);
  }
  if(e.data.type === 'cancel') {
    cancelAllAlarms();
  }
});

// ── Agenda alarmes ────────────────────────────────────────
function scheduleAlarms(alarms) {
  // Cancela todos os anteriores antes de reagendar
  cancelAllAlarms();

  alarms.forEach(alarm => {
    if(alarm.delay <= 0) return;

    const tid = setTimeout(async () => {
      await fireNotification(alarm);
      delete activeAlarms[alarm.id];
    }, alarm.delay);

    activeAlarms[alarm.id] = tid;
  });

  console.log(`[SW] ${alarms.length} alarme(s) agendado(s)`);
}

function cancelAllAlarms() {
  Object.values(activeAlarms).forEach(tid => clearTimeout(tid));
  Object.keys(activeAlarms).forEach(k => delete activeAlarms[k]);
}

// ── Dispara a notificação ─────────────────────────────────
async function fireNotification(alarm) {
  // Verifica se o app já está aberto e visível
  const clients = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
  const appOpen = clients.some(c => c.visibilityState === 'visible');

  // Mesmo com app aberto, dispara (o app também fará o beep via checkTaskAlerts)
  const options = {
    body:    alarm.body,
    icon:    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🍅</text></svg>',
    badge:   'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚡</text></svg>',
    tag:     alarm.id,
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data:    { alarmId: alarm.id },
  };

  await self.registration.showNotification(alarm.title, options);
}

// ── Clique na notificação → abre/foca o app ───────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();

  e.waitUntil(
    self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(clients => {
      // Se já tem uma janela aberta, foca ela
      for(const client of clients) {
        if('focus' in client) {
          client.focus();
          client.postMessage({ type:'focus', alarmId: e.notification.data?.alarmId });
          return;
        }
      }
      // Senão abre uma nova
      if(self.clients.openWindow) {
        return self.clients.openWindow('./');
      }
    })
  );
});

// ── Fechar notificação ────────────────────────────────────
self.addEventListener('notificationclose', e => {
  console.log('[SW] Notificação fechada:', e.notification.tag);
});
