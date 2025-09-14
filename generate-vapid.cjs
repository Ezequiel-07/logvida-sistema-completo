const webpush = require("web-push");

// Gere um par de chaves VAPID
const vapidKeys = webpush.generateVAPIDKeys();

console.log("Chave Pública VAPID:", vapidKeys.publicKey);
console.log("Chave Privada VAPID:", vapidKeys.privateKey);
