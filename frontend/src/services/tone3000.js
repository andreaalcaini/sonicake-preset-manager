/**
 * Tone3000 (Neural Amp Modeler) Cloud Service
 * Real-time integration with Tone3000 Supabase REST API.
 */

const TONE3000_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6eWJpdW9weGtkeGJ5dG5vamRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgwODIxNjUsImV4cCI6MjA1MzY1ODE2NX0.Gq66BJXjtLsqP2nAGXm9Xb9PAjoeZalWUj66K4nmVSU';
const BASE_URL = 'https://api.tone3000.com/rest/v1';

// Card fields and author (users). The counters are read in a second request (COUNTS_SELECT):
// combined with a title search, models(count) exceeds Tone3000's statement timeout (HTTP 500)
const TONE_SELECT = [
  'id', 'title', 'description', 'gear', 'images', 'platform', 'created_at', 'published_at', 'token',
  'users!tones_user_id_fkey(username,display_name,avatar_url,is_verified)'
].join(',');
const COUNTS_SELECT = 'id,models(count),downloads(count),comments(count)';
const API_HEADERS = {
  'apikey': TONE3000_SUPABASE_KEY,
  'Authorization': `Bearer ${TONE3000_SUPABASE_KEY}`,
  'Accept': 'application/json'
};

export const GEAR_LABELS = {
  'amp': 'Amp Capture',
  'amp-cab': 'Amp + Cab Capture',
  'pedal': 'Pedal Capture',
  'outboard': 'Outboard Capture',
  'cab': 'Cab IR',
  'experimental': 'Experimental Capture',
  'space': 'Space Capture',
  'full-rig': 'Full Rig Capture'
};

const countOf = (rel) => (Array.isArray(rel) && rel[0] && typeof rel[0].count === 'number') ? rel[0].count : null;

export class Tone3000Service {
  /**
   * Search tones the pedal can use: NAM captures (Clone AMP) and IR cabinets (User IR)
   */
  static async searchTones({ query = '', gear = 'all', limit = 20, offset = 0 } = {}) {
    try {
      let url = `${BASE_URL}/tones?select=${TONE_SELECT}&is_public=eq.true&is_deleted=eq.false&order=created_at.desc&limit=${limit}&offset=${offset}`;

      if (query && query.trim()) {
        const cleanQuery = encodeURIComponent(query.trim());
        url += `&title=ilike.*${cleanQuery}*`;
      }

      if (gear === 'cab') {
        url += '&gear=eq.cab&platform=eq.ir';
      } else if (gear && gear !== 'all') {
        url += `&gear=eq.${encodeURIComponent(gear)}&platform=eq.nam`;
      } else {
        // AIDA-X / Proteus captures cannot be converted for the pedal
        url += '&platform=in.(nam,ir)';
      }

      const response = await fetch(url, { headers: API_HEADERS });

      if (!response.ok) {
        throw new Error(`Tone3000 API HTTP ${response.status}`);
      }

      const data = await response.json();
      const counts = await this.fetchToneCounts(data.map(item => item.id));
      return data.map(item => {
        const author = item.users || null;
        const c = counts.get(item.id) || {};
        return {
          id: item.id,
          title: item.title,
          description: item.description || '',
          gear: item.gear || 'amp',
          gearLabel: GEAR_LABELS[item.gear] || 'Capture',
          platform: item.platform || 'nam',
          image: item.images && item.images.length > 0 ? item.images[0] : null,
          publishedAt: item.published_at || item.created_at || null,
          createdDate: item.created_at ? new Date(item.created_at).toLocaleDateString() : '',
          url: `https://www.tone3000.com/tones/${item.id}`,
          token: item.token,
          author: author ? {
            name: author.display_name || author.username || 'Anonimo',
            username: author.username || '',
            avatar: author.avatar_url || null,
            verified: !!author.is_verified
          } : null,
          downloads: countOf(c.downloads),
          filesCount: countOf(c.models),
          comments: countOf(c.comments)
        };
      });
    } catch (err) {
      console.warn('Tone3000 search failed:', err);
      throw new Error('Tone3000 non risponde in questo momento. Controlla la connessione e riprova.');
    }
  }

  /** Files / downloads / comments counters for the given tone ids (empty map if unavailable) */
  static async fetchToneCounts(ids) {
    const counts = new Map();
    if (!ids.length) return counts;
    try {
      const url = `${BASE_URL}/tones?select=${COUNTS_SELECT}&id=in.(${ids.join(',')})`;
      const response = await fetch(url, { headers: API_HEADERS });
      if (response.ok) {
        for (const row of await response.json()) counts.set(row.id, row);
      }
    } catch (err) {
      console.warn('Tone3000 counters unavailable:', err);
    }
    return counts;
  }

  /**
   * Files (models / variations) of a tone. Throws when Tone3000 cannot be reached;
   * an empty array means the tone has no downloadable file.
   */
  static async getToneModels(toneId) {
    const url = `${BASE_URL}/models?tone_id=eq.${encodeURIComponent(toneId)}&select=id,name,tone_id,size,model_url,pack_name,position&order=id.asc`;
    const response = await fetch(url, { headers: API_HEADERS });
    if (!response.ok) throw new Error(`Tone3000 API HTTP ${response.status}`);
    const data = await response.json();
    const seen = new Set();
    const unique = [];
    for (const m of Array.isArray(data) ? data : []) {
      const trimmed = (m.name || '').trim();
      if (trimmed && m.model_url && !seen.has(trimmed)) {
        seen.add(trimmed);
        unique.push({
          id: m.id,
          name: trimmed,
          toneId: m.tone_id,
          size: m.size || 'standard',
          url: m.model_url,
          webUrl: `https://www.tone3000.com/tones/${m.tone_id}`,
          packName: m.pack_name
        });
      }
    }
    return unique;
  }
}
