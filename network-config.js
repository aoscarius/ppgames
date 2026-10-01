/* Deployment override. Leave the array empty to use the built-in public STUN servers.
   For reliable cross-network WebRTC, configure a real TURN server here. */
window.P2P_ICE_SERVERS = [];

/* ============ Example ============ */
/* Optional WebRTC ICE/TURN configuration.
   Copy this file to network-config.js and put your real TURN credentials
   there. STUN alone is not sufficient for every NAT/firewall combination
   -- peers behind restrictive/symmetric NATs will fail to connect without
   a real TURN server. */

// window.P2P_ICE_SERVERS = [
//     { urls: 'stun:stun.l.google.com:19302' },
//     {
//         urls: 'turn:YOUR_TURN_HOST:3478',
//         username: 'YOUR_TURN_USERNAME',
//         credential: 'YOUR_TURN_PASSWORD'
//     }
// ];

/* Do not commit real TURN credentials to a public repository. For
   production, generate short-lived credentials server-side when possible
   (most TURN providers support this). */
