// 命名空間統一：本版早期採用 window.CCS3D，共用模組採用 window.CCS，
// 兩者指向同一個物件，讓新舊模組可互相取用彼此的匯出。
window.CCS = window.CCS || {};
window.CCS3D = window.CCS;
