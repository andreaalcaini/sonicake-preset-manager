/**
 * Sonicake Compiler Bridge Client Service
 * Connects the web frontend to the NAM compiler (server.py) on the same origin.
 * Converts Tone3000 NAM captures into hardware-ready 2,696-byte Low Model .clo binaries
 * and normalizes Cabinet IRs.
 */


export class CompilerBridgeService {
  // The compiler always runs behind the same origin (/api, proxied to server.py)
  static getServerUrl() {
    return '';
  }

  /**
   * Check whether the NAM compiler is online
   * @returns {Promise<{ available: boolean }>}
   */
  static async checkHealth() {
    try {
      const resp = await fetch('/api/health', { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(2500) });
      if (resp.ok) {
        const data = await resp.json();
        return { available: data.status === 'ok' && !!data.compiler_available };
      }
    } catch (_) {}
    return { available: false };
  }

  /**
   * Convert a Neural Amp Modeler (.nam) profile into a 2,696-byte Low Model .clo (~15-20s server side)
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

