/* Optional WebRTC ICE/TURN configuration.
   Copy to network-config.js and put your real TURN credentials here.
   STUN alone is not sufficient for every NAT/firewall combination. */

// Example:
// window.P2P_ICE_SERVERS = [
//     { urls: 'stun:stun.l.google.com:19302' },
//     {
//         urls: 'turn:YOUR_TURN_HOST:3478',
//         username: 'YOUR_TURN_USERNAME',
//         credential: 'YOUR_TURN_PASSWORD'
//     }
// ];

/* Deployment override. Leave the array empty to use the built-in public STUN servers.
   For reliable cross-network WebRTC, configure a real TURN server here. */
window.P2P_ICE_SERVERS = [];
