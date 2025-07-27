/**
 * The base URL for all API requests.
 *
 * During development with Vite's dev server, this should be an empty string to use the proxy.
 * For production builds, VITE_API_BASE_URL should be set to the absolute URL.
 * 
 * For Capacitor development on an Android emulator, this can be set to 'http://10.0.2.2:8000'
 * in a .env file to connect to the host machine's localhost. Note: for web dev, this bypasses the Vite proxy.
 * Use an empty string ('') for web development with the proxy.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '') + '/api';
