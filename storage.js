/* Versioned browser storage. It is local to this browser and survives page reloads. */
window.Revisions = window.Revisions || {};

(() => {
  const R = window.Revisions;
  const KEY = 'cap-revisions:v1';
  const empty = () => ({ version: 1, subjects: [], courses: [], sessions: [] });
  const clean = (value) => ({
    version: 1,
    subjects: Array.isArray(value?.subjects) ? value.subjects : [],
    courses: Array.isArray(value?.courses) ? value.courses : [],
    sessions: Array.isArray(value?.sessions) ? value.sessions : []
  });
  R.store = {
    load() { try { return clean(JSON.parse(localStorage.getItem(KEY))); } catch { return empty(); } },
    save(data) { localStorage.setItem(KEY, JSON.stringify(clean(data))); },
    reset() { localStorage.removeItem(KEY); },
    export(data) { return JSON.stringify(clean(data), null, 2); },
    import(raw) {
      let parsed;
      try { parsed = JSON.parse(raw); } catch { throw new Error("Ce fichier n'est pas un JSON valide."); }
      const data = clean(parsed);
      if (!Array.isArray(parsed.subjects) || !Array.isArray(parsed.courses) || !Array.isArray(parsed.sessions)) throw new Error('Le fichier ne contient pas les données attendues.');
      return data;
    }
  };
})();
