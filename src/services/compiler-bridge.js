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
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_SERVER_URL;
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
        const errJson = await response.json();
        if (errJson.error) errMsg = errJson.error;
      } catch (e) {}
      throw new Error(`Compiler Server Error: ${errMsg}`);
    }

    const blob = await response.blob();
    const fileName = `${cleanName}.namb`;

    return {
      blob,
      fileName,
      size: blob.size
    };
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
