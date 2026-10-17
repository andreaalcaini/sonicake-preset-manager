/**
 * Sonicake Compiler Bridge Client Service
 * Connects the web frontend to the VPS / Local Python Compiler Microservice.
 * Converts Tone3000 NAM captures into hardware-ready .namb binaries
 * and normalizes Cabinet IRs.
 */

const DEFAULT_SERVER_URL = 'http://localhost:8080';
const STORAGE_KEY = 'sonicake_bridge_url';

export class CompilerBridgeService {
  static getServerUrl() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
    const host = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : 'localhost';
    const protocol = (typeof window !== 'undefined' && window.location && window.location.protocol) ? window.location.protocol : 'http:';
    return `${protocol}//${host}:8080`;
  }

  static setServerUrl(url) {
    const clean = (url || '').trim().replace(/\/+$/, '');
    if (clean) {
      localStorage.setItem(STORAGE_KEY, clean);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  /**
   * Check connection to the VPS / Local Compiler Bridge
   * @returns {Promise<{ available: boolean, platform?: string, version?: string }>}
   */
  static async checkHealth() {
    const baseUrl = this.getServerUrl();
    try {
      const resp = await fetch(`${baseUrl}/api/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(3000)
      });
      if (resp.ok) {
        const data = await resp.json();
        return {
          available: data.status === 'ok' && !!data.compiler_available,
          compilerAvailable: !!data.compiler_available,
          platform: data.platform || 'unknown',
          version: data.version || '1.0.0',
          url: baseUrl
        };
      }
    } catch (e) {
      // Server offline or unreachable
    }
    return { available: false, url: baseUrl };
  }

  /**
   * Convert a Neural Amp Modeler (.nam) profile into a compiled .namb hardware binary
   * @param {Object} options
   * @param {string} [options.url] Direct download URL for the .nam model
   * @param {Blob|File} [options.file] Local .nam file
   * @param {string} options.name Name of the model
   * @returns {Promise<{ blob: Blob, fileName: string, size: number }>}
   */
  static async convertNam({ url, file, name }) {
    const baseUrl = this.getServerUrl();
    const endpoint = `${baseUrl}/api/convert-nam`;

    let response;
    const cleanName = (name || 'Sonicake_Model').replace(/[\\/:*?"<>|]/g, '_').trim();

    if (file) {
      const formData = new FormData();
      formData.append('file', file, `${cleanName}.nam`);
      response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });
    } else if (url) {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, name: cleanName })
      });
    } else {
      throw new Error('Either file or url must be provided for conversion');
    }

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const text = await response.text();
        try {
          const errJson = JSON.parse(text);
          if (errJson.error) errMsg = errJson.error;
        } catch (pErr) {
          if (text && text.length < 200 && !text.includes('<html')) {
            errMsg = text.trim();
          }
        }
      } catch (e) {}
      throw new Error(errMsg);
    }

    const blob = await response.blob();
    const isClo = response.headers.get('Content-Disposition')?.includes('.clo') || cleanName.toLowerCase().endsWith('.clo');
    const fileName = isClo ? `${cleanName}.clo` : `${cleanName}.namb`;

    return {
      blob,
      fileName,
      size: blob.size
    };
  }

  /**
   * Check if an imported CLO profile is available in Sonicake Manager AppData
   * @returns {Promise<{ available: boolean, originalSize?: number, lowModelSize?: number, crc?: string }>}
   */
  static async getLatestCloInfo() {
    const baseUrl = this.getServerUrl();
    try {
      const resp = await fetch(`${baseUrl}/api/latest-clo?info=1`, {
        signal: AbortSignal.timeout(2000)
      });
      if (resp.ok) return await resp.json();
    } catch (_) {}
    return { available: false };
  }

  /**
   * Download the latest CLO profile imported in Sonicake Manager, converted to Low Model
   * @returns {Promise<Blob>}
   */
  static async getLatestCloBlob() {
    const baseUrl = this.getServerUrl();
    const resp = await fetch(`${baseUrl}/api/latest-clo`);
    if (!resp.ok) throw new Error(`Errore recupero ultimo CLO (HTTP ${resp.status})`);
    return await resp.blob();
  }

  /**
   * Fetch list of verified hardware models guaranteed to work without freezing
   * @returns {Promise<Array<{ id: string, name: string, description: string, size: number, url: string }>>}
   */
  static async getVerifiedModels() {
    const baseUrl = this.getServerUrl();
    try {
      const resp = await fetch(`${baseUrl}/api/verified-models`, {
        signal: AbortSignal.timeout(2000)
      });
      if (resp.ok) return await resp.json();
    } catch (_) {}
    return [];
  }

  /**
   * Fetch a verified model binary
   * @param {string} relativeOrAbsoluteUrl
   * @returns {Promise<Blob>}
   */
  static async getVerifiedModelBlob(url) {
    const baseUrl = this.getServerUrl().replace(/\/+$/, '');
    let target = url;
    if (!target.startsWith('http')) {
      if (!target.startsWith('/api/verified-models/')) {
        target = `/api/verified-models/${target.replace(/^\/+/, '')}`;
      }
      target = `${baseUrl}${target}`;
    }
    const resp = await fetch(target);
    if (!resp.ok) throw new Error(`Errore download modello (HTTP ${resp.status})`);
    return await resp.blob();
  }

  /**
   * Fetch detected hardware slot names from local bridge
   * @returns {Promise<{ cloneSlots?: string[], irSlots?: string[] } | null>}
   */
  static async getHardwareSlots() {
    const baseUrl = this.getServerUrl().replace(/\/+$/, '');
    try {
      const resp = await fetch(`${baseUrl}/api/hardware-slots`, { signal: AbortSignal.timeout(2000) });
      if (resp.ok) return await resp.json();
    } catch (_) {}
    return null;
  }

  /**
   * Triggers browser download of a compiled blob
   */
  static downloadBlob(blob, fileName) {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
  }
}

