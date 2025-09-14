// Este arquivo DEVE estar no diretório /public

// Importa o script principal do Firebase e do Messaging.
// O importScripts é um método de service workers para carregar scripts externos.
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// Esta função busca dinamicamente a configuração do Firebase da nossa API route.
// Isso evita que chaves secretas sejam expostas e garante que o service worker
// sempre tenha a configuração correta, mesmo que as variáveis de ambiente mudem.
self.importScripts('/api/firebase-config');

// Agora `self.firebaseConfig` está disponível globalmente neste service worker
// graças ao script da API que acabamos de importar.

if (self.firebaseConfig) {
  // Inicializa o Firebase com a configuração recebida.
  firebase.initializeApp(self.firebaseConfig);

  // Obtém a instância do Firebase Messaging.
  const messaging = firebase.messaging();

  // Opcional: Adiciona um listener para notificações recebidas enquanto
  // o app não está em primeiro plano (ou está fechado).
  // Isso permite customizar como a notificação é exibida.
  messaging.onBackgroundMessage((payload) => {
    console.log(
      "[firebase-messaging-sw.js] Received background message ",
      payload
    );
    
    if (!payload.notification) {
      return;
    }

    const notificationTitle = payload.notification.title;
    const notificationOptions = {
      body: payload.notification.body,
      icon: payload.notification.icon || '/logvida-logo-192.png', // Um ícone padrão
    };

    // Mostra a notificação para o usuário.
    self.registration.showNotification(notificationTitle, notificationOptions);
  });
} else {
  console.error("[firebase-messaging-sw.js] Firebase config not found. Push notifications will not work.");
}
