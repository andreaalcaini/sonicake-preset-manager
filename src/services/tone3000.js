/**
 * Tone3000 (Neural Amp Modeler) Cloud Service
 * Real-time integration with Tone3000 Supabase REST API.
 */

const TONE3000_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6eWJpdW9weGtkeGJ5dG5vamRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgwODIxNjUsImV4cCI6MjA1MzY1ODE2NX0.Gq66BJXjtLsqP2nAGXm9Xb9PAjoeZalWUj66K4nmVSU';
const BASE_URL = 'https://api.tone3000.com/rest/v1';

export class Tone3000Service {
  /**
   * Search tones and Neural Amp Modeler captures
   */
  static async searchTones({ query = '', gear = 'all', limit = 20, offset = 0 } = {}) {
    try {
      let url = `${BASE_URL}/tones?select=id,title,description,gear,images,platform,created_at,token&is_public=eq.true&is_deleted=eq.false&order=created_at.desc&limit=${limit}&offset=${offset}`;

      if (query && query.trim()) {
        const cleanQuery = encodeURIComponent(query.trim());
        url += `&title=ilike.*${cleanQuery}*`;
      }

      if (gear && gear !== 'all') {
        url += `&gear=eq.${encodeURIComponent(gear)}`;
      }

      const response = await fetch(url, {
        headers: {
          'apikey': TONE3000_SUPABASE_KEY,
          'Authorization': `Bearer ${TONE3000_SUPABASE_KEY}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Tone3000 API HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.map(item => ({
        id: item.id,
        title: item.title,
        description: item.description || 'No description provided.',
        gear: item.gear || 'amp',
        image: item.images && item.images.length > 0 ? item.images[0] : null,
        createdDate: item.created_at ? new Date(item.created_at).toLocaleDateString() : '',
        url: `https://www.tone3000.com/tones/${item.id}`,
        token: item.token
      }));
    } catch (err) {
      console.warn('Tone3000 online search failed, falling back to curated library:', err);
      return this.getCuratedTones(query, gear);
    }
  }

  /**
   * Fetch specific models / .nam profiles for a tone
   */
  static async getToneModels(toneId) {
    try {
      const url = `${BASE_URL}/models?tone_id=eq.${toneId}&select=id,name,tone_id,size,architecture,metadata`;
      const response = await fetch(url, {
        headers: {
          'apikey': TONE3000_SUPABASE_KEY,
          'Authorization': `Bearer ${TONE3000_SUPABASE_KEY}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) return [];
      return await response.json();
    } catch (err) {
      console.error('Failed to fetch tone models:', err);
      return [];
    }
  }

  /**
   * Curated offline tone captures for immediate loading
   */
  static getCuratedTones(query = '', gear = 'all') {
    const curated = [
      {
        id: 101,
        title: "Marshall JCM800 2203 (Full Stack)",
        description: "Classic British crunch & hard rock roar. Master at 6, Preamp at 8, EL34 power stage.",
        gear: "amp",
        image: "https://api.tone3000.com/storage/v1/object/public/images/f6q1xbcmkq9.jpg",
        createdDate: "2026-02-15",
        url: "https://www.tone3000.com/tones/marshall-jcm800-2203"
      },
      {
        id: 102,
        title: "Peavey 5150 Block Letter (Lead Channel)",
        description: "The definitive modern metal tone. Tight low-end punch, aggressive upper mids.",
        gear: "amp",
        image: "https://api.tone3000.com/storage/v1/object/public/images/01zkk35h4k0r.jpg",
        createdDate: "2026-03-01",
        url: "https://www.tone3000.com/tones/peavey-5150-lead"
      },
      {
        id: 103,
        title: "Fender '65 Twin Reverb (Vibrato Channel)",
        description: "Sparkling crystal cleans with enormous headroom and warm tube sparkle.",
        gear: "amp",
        image: "https://api.tone3000.com/storage/v1/object/public/images/fpmzc9lpvmh.jpg",
        createdDate: "2026-01-20",
        url: "https://www.tone3000.com/tones/fender-twin-reverb"
      },
      {
        id: 104,
        title: "Klon Centaur Gold Horsie",
        description: "Legendary transparent overdrive. Adds harmonic rich warmth and touch dynamics.",
        gear: "pedal",
        image: "https://api.tone3000.com/storage/v1/object/public/images/arg3zpo1we.jpg",
        createdDate: "2026-02-28",
        url: "https://www.tone3000.com/tones/klon-centaur-gold"
      },
      {
        id: 105,
        title: "Mesa Boogie Dual Rectifier (Orange Modern)",
        description: "Iconic wall-of-sound rhythm tone. Deep sub bass and singing saturated lead.",
        gear: "amp",
        image: "https://api.tone3000.com/storage/v1/object/public/images/3fchhait1qf.jpg",
        createdDate: "2026-03-10",
        url: "https://www.tone3000.com/tones/mesa-dual-rectifier"
      },
      {
        id: 106,
        title: "Fortin Cali High Gain Custom",
        description: "Ultra tight boutique modern metal monster with razor-sharp note clarity.",
        gear: "amp",
        image: "https://api.tone3000.com/storage/v1/object/public/images/c4weec8xxmo.jpg",
        createdDate: "2026-03-12",
        url: "https://www.tone3000.com/tones/fortin-cali"
      },
      {
        id: 107,
        title: "Vox AC30 Top Boost 1964",
        description: "Chimey British Invasion cleans through blooming harmonic chime and edge-of-breakup grit.",
        gear: "amp",
        image: "https://api.tone3000.com/storage/v1/object/public/images/7cci7mggtrh.jpg",
        createdDate: "2026-02-05",
        url: "https://www.tone3000.com/tones/vox-ac30-top-boost"
      },
      {
        id: 108,
        title: "Mesa 4x12 Rectifier Cab (Celestion V30)",
        description: "Industry standard 4x12 cab captured with Shure SM57 & Royer R121 on axis.",
        gear: "cab",
        image: "https://api.tone3000.com/storage/v1/object/public/images/zjekt0nsasl.jpg",
        createdDate: "2026-01-18",
        url: "https://www.tone3000.com/tones/mesa-4x12-v30"
      }
    ];

    return curated.filter(item => {
      const matchQuery = !query || item.title.toLowerCase().includes(query.toLowerCase()) || item.description.toLowerCase().includes(query.toLowerCase());
      const matchGear = !gear || gear === 'all' || item.gear === gear;
      return matchQuery && matchGear;
    });
  }
}
